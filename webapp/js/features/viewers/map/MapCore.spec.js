/**
 * MapCore as the maps use it: what it hands to its toolbar and layer panels on the dataset tab
 * and in a view of the map viewer, where the rows and the base file come from, when it fits the
 * map, and how its panels share the corner. The children are stubs that show their props;
 * OpenLayers is real.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { fromLonLat } from 'ol/proj';
import ddb from 'ddb';
import { ScaleLine } from 'ol/control';
import { b64encode } from '@/libs/base64';
import { PREF, setPref } from '@/libs/preferences';

const T = ddb.entry.type;
const POLYGON = { type: 'Polygon', coordinates: [[[10, 45], [10.01, 45], [10.01, 45.01], [10, 45.01], [10, 45]]] };
const FAR_POLYGON = { type: 'Polygon', coordinates: [[[20, 50], [20.01, 50], [20.01, 50.01], [20, 50.01], [20, 50]]] };
const band = colorInterp => ({ colorInterp });
const georaster = (path, polygon_geom = POLYGON, bands = ['Gray']) => ({
    path, type: T.GEORASTER, hash: `h-${path}`, polygon_geom, properties: { bands: bands.map(band) }
});
const file = entry => ({ path: `ddb://acme/site/${entry.path}`, entry, selected: false });


const Toolbar = defineComponent({
    name: 'MapToolbar',
    props: {
        showBack: Boolean, copyLink: Boolean, analysisEntry: { type: Object, default: null }, splitToggle: Boolean,
        displayOptions: Boolean, splitMode: Boolean, canCompare: Boolean, rasterCount: { type: Number, default: 0 },
        pickToCompare: { type: Boolean, default: true }
    },
    emits: ['back', 'copy-link', 'analysis', 'toggle-split', 'compare-to'],
    setup(props, { emit }) {
        return () => h('div', { 'data-stub': 'toolbar' }, [
            h('button', { 'data-copy': '', onClick: () => emit('copy-link') }),
            h('button', { 'data-split': '', onClick: () => emit(props.canCompare ? 'toggle-split' : 'compare-to') })
        ]);
    }
});
const LayerPanel = defineComponent({
    name: 'RasterLayerOpacityPanel',
    props: {
        layers: { type: Array, default: () => [] }, removable: Boolean, removablePaths: { type: Array, default: null },
        canRepick: Boolean, canAdd: Boolean, addDisabled: Boolean, addTitle: { type: String, default: '' }, changedPaths: { type: Array, default: () => [] }
    },
    emits: ['remove', 'repick', 'add', 'reorder', 'toggle-visible', 'plant-health', 'update:layers'],
    setup() { return () => h('div', { 'data-stub': 'layers' }); }
});
const Opacity = defineComponent({
    name: 'OpacityControl',
    props: { canAdd: Boolean },
    emits: ['add', 'plant-health'],
    setup() { return () => h('div', { 'data-stub': 'opacity' }); }
});
const LinkPanel = defineComponent({
    name: 'MapLinkPanel',
    props: { dataset: { type: Object, default: null }, linkTarget: { type: Object, default: null }, note: Boolean, canSave: Boolean },
    emits: ['close', 'save'],
    setup(props, { emit }) {
        return () => h('div', { 'data-stub': 'link' }, [
            `${props.linkTarget.uid || props.linkTarget.path}|${props.note}|${props.canSave}`,
            h('button', { 'data-save': '', onClick: () => emit('save') })
        ]);
    }
});
// The popup is driven through methods
const Popup = defineComponent({ name: 'MapFilePopup', props: { map: { type: Object, default: null } }, setup(_, { expose }) { expose({ closeUnlessIn: () => false, close() {}, show() {} }); return () => h('div'); } });
const SplitOverlay = defineComponent({
    name: 'RasterSplitOverlay',
    props: { removable: Boolean, bands: { type: Array, default: () => [] } },
    emits: ['remove', 'repick', 'move', 'update:positions'],
    setup() { return () => h('div', { 'data-stub': 'split' }); }
});
const Plain = name => defineComponent({ name, inheritAttrs: false, setup() { return () => h('div'); } });

const stubs = {
    MapToolbar: Toolbar,
    RasterLayerOpacityPanel: LayerPanel,
    MapLinkPanel: LinkPanel,
    MapFilePopup: Popup,
    OpacityControl: Opacity,
    RasterSplitOverlay: SplitOverlay,
    PlantHealthPanel: Plain('PlantHealthPanel'),
    RasterAnalysisControls: Plain('RasterAnalysisControls'),
    ContourOptionsDialog: Plain('ContourOptionsDialog'),
    StockpileVolumePanel: Plain('StockpileVolumePanel'),
    MapDialogs: Plain('MapDialogs'),
    DialogHost: Plain('DialogHost')
};

// OpenLayers draws nothing here (no canvas), and a fit does not animate
vi.mock('ol', async importOriginal => {
    const ol = await importOriginal();
    class QuietMap extends ol.Map {
        render() {}
    }
    return { ...ol, Map: QuietMap };
});
vi.mock('@/libs/map/mapUtils', async importOriginal => {
    const utils = await importOriginal();
    return {
        ...utils,
        FIT_OPTIONS: { ...utils.FIT_OPTIONS, duration: 0 },
        FILE_FIT_OPTIONS: { ...utils.FILE_FIT_OPTIONS, duration: 0 }
    };
});

const { default: MapCore } = await import('./MapCore.vue');

let wrapper;
const dataset = { org: 'acme', ds: 'site', getFileContents: vi.fn(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); }) };

/** Lets the debounced layer rebuild and the fit run. */
const settle = async () => {
    await flushPromises();
    await new Promise(r => setTimeout(r, 40));
    await flushPromises();
};

/**
 * What a drawn map does after the view moved, which the quiet map here never does: the map
 * finishes a move (a fit, a pan), and the binding reports where it ended.
 */
const moved = async () => {
    wrapper.vm.map.dispatchEvent('moveend');
    await settle();
};

/** `real`: the components to mount for real instead of their stubs. */
async function mountMap(files, props = {}, provide = {}, real = []) {
    wrapper = mount(MapCore, {
        props: { files, dataset, standalone: true, ...props },
        global: { stubs: { ...stubs, ...Object.fromEntries(real.map(name => [name, false])) }, provide, mocks: { $router: { push: vi.fn() } } },
        attachTo: document.body
    });
    await settle();
    return wrapper;
}

/**
 * A map in a view, as the map viewer drives it: `entries` are the layers, top first, handed over
 * in draw order (bottom first), after a base file that is not one of them (not a georaster); the
 * state the map reports goes back into the view, as the viewer applies it. `extra` are the other
 * props, `provide` what the app provides, `real` the components to mount for real.
 */
async function mountView(entries, { base = entries[0], state = {}, extra = {}, provide = {}, real = [] } = {}) {
    const view = viewOf(base, entries, state);
    wrapper = mount(MapCore, {
        props: {
            files: [...(entries.includes(base) ? [] : [base]), ...[...entries].reverse()].map(file), dataset, standalone: true, view,
            'onUpdate:view': next => { reported.push(next); wrapper?.setProps({ view: next }); },
            ...extra
        },
        global: { stubs: { ...stubs, ...Object.fromEntries(real.map(name => [name, false])) }, provide, mocks: { $router: { push: vi.fn() } } },
        attachTo: document.body
    });
    await settle();
    await moved();
    return wrapper;
}

afterEach(() => { wrapper?.unmount(); wrapper = null; });

const toolbar = () => wrapper.findComponent(Toolbar);
const layerPanel = () => wrapper.findComponent(LayerPanel);
const linkPanel = () => wrapper.findComponent(LinkPanel);
const center = () => wrapper.vm.map.getView().getCenter();
const mainCenter = fromLonLat([10.005, 45.005]);
const farCenter = fromLonLat([20.005, 50.005]);
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 5;

const MAIN = georaster('dsm.tif');
const ADDED = georaster('ortho.tif', FAR_POLYGON, ['Red', 'Green', 'Blue']);
const THIRD = georaster('dtm.tif', POLYGON);
/** A base file that is not a georaster: a view of it starts with no layer */
const ZONES = { path: 'zones.geojson', type: T.VECTOR, hash: 'h-zones.geojson', polygon_geom: POLYGON, properties: {} };
/** The state of a view of these layers (top first) with `base` as its base file. */
const viewOf = (base, entries, state = {}) => ({
    v: 1,
    base: { path: base.path, hash: base.hash },
    layers: entries.map(e => ({ path: e.path, hash: e.hash, opacity: 1, visible: true, vizParams: null })),
    split: { enabled: false, positions: [] },
    view: null,
    display: { basemap: null },
    analysis: { target: null },
    ...state
});
const reported = [];
const rows = () => wrapper.vm.rasterLayerList.map(r => r.path);
const SAVED_POSITION = { center: [123, 456], zoom: 7, rotation: 0 };

afterEach(() => reported.splice(0));


describe('the canvas ratio of the map (FR-XC-32, D-042)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([[3, 2], [2, 2], [1.5, 1.5], [1, 1]])('draws at min(devicePixelRatio, 2): %s gives %s', async (dpr, applied) => {
        vi.stubGlobal('devicePixelRatio', dpr);
        await mountMap([MAIN]);
        expect(wrapper.vm.map.getPixelRatio()).toBe(applied);
    });

    it('applies the ratio again when the window moves to another screen, and stops with the map', async () => {
        let onChange;
        const stop = vi.fn();
        vi.stubGlobal('matchMedia', () => ({ addEventListener: (type, fn) => { onChange = fn; }, removeEventListener: stop }));
        vi.stubGlobal('devicePixelRatio', 1);
        await mountMap([MAIN]);
        expect(wrapper.vm.map.getPixelRatio()).toBe(1);
        vi.stubGlobal('devicePixelRatio', 2);
        onChange();
        expect(wrapper.vm.map.getPixelRatio()).toBe(2);
        wrapper.unmount();
        wrapper = null;
        expect(stop).toHaveBeenCalled();
    });
});

describe('the position of the map in a view', () => {
    it('opens on the base file, not on the first file of the draw order', async () => {
        // MAIN is the base and the top layer; the files are bottom first, so ADDED comes first
        await mountView([MAIN, ADDED], { base: MAIN });
        expect(near(center(), mainCenter)).toBe(true);
        wrapper.unmount();
        await mountView([MAIN, ADDED], { base: ADDED });
        expect(near(center(), farCenter)).toBe(true);
    });

    it('fits once, and reports the position it fitted to', async () => {
        await mountView([MAIN]);
        expect(near(center(), mainCenter)).toBe(true);
        expect(near(reported.at(-1).view.center, mainCenter)).toBe(true);
    });

    it('does not move when a layer is added or removed later', async () => {
        await mountView([MAIN]);
        wrapper.vm.map.getView().setCenter([123, 456]);
        await moved();
        await wrapper.setProps({ files: [file(MAIN), file(ADDED)], view: viewOf(MAIN, [ADDED, MAIN], { view: wrapper.props('view').view }) });
        await settle();
        expect(center()).toEqual([123, 456]);
        await wrapper.setProps({ files: [file(MAIN)], view: viewOf(MAIN, [MAIN], { view: wrapper.props('view').view }) });
        await settle();
        expect(center()).toEqual([123, 456]);
    });

    it('opens at a saved position and never fits to the files', async () => {
        await mountView([MAIN], { state: { view: SAVED_POSITION } });
        expect(center()).toEqual(SAVED_POSITION.center);
        expect(wrapper.vm.map.getView().getZoom()).toBe(SAVED_POSITION.zoom);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED)], view: viewOf(MAIN, [ADDED, MAIN], { view: SAVED_POSITION }) });
        await settle();
        expect(center()).toEqual(SAVED_POSITION.center);
    });

    it('still fits to the files when the user resets the view', async () => {
        await mountView([MAIN], { state: { view: SAVED_POSITION } });
        wrapper.vm.resetToInitialView();
        await settle();
        expect(near(center(), mainCenter)).toBe(true);
    });

    it('is fitted to the files again on the dataset tab when they change (the contrast)', async () => {
        await mountMap([file(MAIN)], { standalone: false });
        wrapper.vm.map.getView().setCenter([123, 456]);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED)] });
        await settle();
        // Both files are in view: the centre is between them
        expect(near(center(), mainCenter)).toBe(false);
        expect(near(center(), farCenter)).toBe(false);
        expect(center()[0]).toBeGreaterThan(mainCenter[0]);
        expect(center()[0]).toBeLessThan(farCenter[0]);
    });
});

describe('the fit to the files (FR-MAP-28)', () => {
    // Literal numbers: about 1.1 m wide at 45 degrees (the old fit stopped at 0.5 m per pixel, which a survey never reaches in a 100 px view)
    const TINY = { type: 'Polygon', coordinates: [[[10, 45], [10.00001, 45], [10.00001, 45.00001], [10, 45.00001], [10, 45]]] };
    const POINT = { type: 'Polygon', coordinates: [[[10, 45], [10, 45], [10, 45], [10, 45], [10, 45]]] };
    const fitSpy = () => vi.spyOn(wrapper.vm.map.getView(), 'fit');

    it('has no minimum resolution for the extent of a file, on the first fit and on Reset view', async () => {
        await mountView([georaster('dsm.tif', TINY)]);
        const fit = fitSpy();
        wrapper.vm.resetToInitialView();
        await settle();
        expect(fit).toHaveBeenCalledTimes(1);
        expect(fit.mock.calls[0][1]).not.toHaveProperty('minResolution');
        expect(fit.mock.calls[0][1]).toMatchObject({ padding: [40, 40, 40, 40], maxZoom: 22 });
    });

    it('fills the view with a small extent: it ends closer than 0.5 m per pixel (the old cap)', async () => {
        await mountView([georaster('dsm.tif', TINY)]);
        const resolution = wrapper.vm.map.getView().getResolution();
        expect(resolution).toBeLessThan(0.5);
        expect(resolution).toBeGreaterThan(0);
    });

    it('keeps a small minimum resolution for an extent with no size (one point)', async () => {
        await mountView([georaster('dsm.tif', POINT)]);
        const fit = fitSpy();
        wrapper.vm.resetToInitialView();
        await settle();
        expect(fit.mock.calls[0][1].minResolution).toBe(0.5);
        expect(wrapper.vm.map.getView().getResolution()).toBeGreaterThanOrEqual(0.5);
    });

    it('fits two photos a few metres apart closer than 0.5 m per pixel, and no closer than zoom 22', async () => {
        // About 3 m apart on the ground at 45 degrees (0.00004 degrees of longitude), 4.45 m in Web Mercator
        const photo = (path, lon) => ({ path, type: T.GEOIMAGE, hash: `h-${path}`, point_geom: { type: 'Point', coordinates: [lon, 45, 100] }, properties: {} });
        await mountMap([file(photo('a.jpg', 10)), file(photo('b.jpg', 10.00004))]);
        const extent = wrapper.vm.initialExtent;
        expect(extent[2] - extent[0]).toBeCloseTo(4.45, 2);
        const fit = fitSpy();
        wrapper.vm.resetToInitialView();
        await settle();
        expect(fit).toHaveBeenCalledTimes(1);
        expect(fit.mock.calls[0][1]).not.toHaveProperty('minResolution');
        expect(fit.mock.calls[0][1]).toMatchObject({ maxZoom: 22 });
        const view = wrapper.vm.map.getView();
        // The resolution of zoom 22 in Web Mercator: 156543.03392804097 / 2^22 m per pixel
        expect(view.getResolution()).toBeLessThan(0.5);
        expect(view.getResolution()).toBeGreaterThanOrEqual(0.0373227 - 1e-7);
        expect(view.getZoom()).toBeLessThanOrEqual(22);
    });
});

describe('the scale bar (FR-MAP-30)', () => {
    afterEach(() => setPref(PREF.MEASURE_UNIT, 'metric'));
    const scaleLine = () => wrapper.vm.map.getControls().getArray().find(c => c instanceof ScaleLine);

    it('is a bar of at least 100 px, in metric by default', async () => {
        await mountMap([MAIN]);
        expect(scaleLine()).toBeTruthy();
        expect(scaleLine().getUnits()).toBe('metric');
        expect(scaleLine().element.classList.contains('ol-scale-bar')).toBe(true);
        expect(scaleLine().minWidth_).toBe(100);
    });

    it('starts in imperial when the preference is imperial, and follows the preference while open', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await mountMap([MAIN]);
        expect(scaleLine().getUnits()).toBe('imperial');
        setPref(PREF.MEASURE_UNIT, 'metric');
        await settle();
        expect(scaleLine().getUnits()).toBe('metric');
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await settle();
        expect(scaleLine().getUnits()).toBe('imperial');
    });

    it('goes with the map', async () => {
        await mountMap([MAIN]);
        const map = wrapper.vm.map;
        const control = scaleLine();
        wrapper.unmount();
        expect(map.getControls().getArray()).not.toContain(control);
    });
});

describe('the state of a view', () => {
    it('is reported by the map as the user changes it, in full', async () => {
        await mountView([ADDED, MAIN], { base: MAIN });
        reported.length = 0;
        wrapper.vm.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        await settle();
        expect(reported[0].layers.map(l => l.path)).toEqual([MAIN.path, ADDED.path]);
        expect(reported[0].base).toEqual({ path: MAIN.path, hash: MAIN.hash });
    });

    it('reports an opacity set on the row of a lone raster', async () => {
        await mountView([MAIN]);
        reported.length = 0;
        layerPanel().vm.$emit('update:layers', [{ ...wrapper.vm.rasterLayerList[0], opacity: 0.4 }]);
        await settle();
        expect(reported.at(-1).layers[0].opacity).toBe(0.4);
    });

    it('is not reported when the map only shows it', async () => {
        await mountView([ADDED, MAIN]);
        reported.length = 0;
        await wrapper.setProps({ view: viewOf(MAIN, [ADDED, MAIN], { view: wrapper.props('view').view }) });
        await settle();
        expect(reported).toEqual([]);
    });
});

describe('the rows of the layer panel', () => {
    it('on the dataset tab, a lone raster has the one opacity control and no panel', async () => {
        await mountMap([file(MAIN)], { standalone: false });
        expect(wrapper.findComponent(Opacity).exists()).toBe(true);
        expect(layerPanel().exists()).toBe(false);
    });

    it('on the dataset tab, two rasters have the panel and no row can be removed', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false });
        expect(wrapper.findComponent(Opacity).exists()).toBe(false);
        const panel = layerPanel();
        expect(panel.props('removable')).toBe(false);
        expect(panel.props('canRepick')).toBe(false);
        expect(panel.props('canAdd')).toBe(false);
    });

    it('in a view, a lone raster has the panel, not the opacity control, with the badges of the changed files', async () => {
        await mountView([MAIN], { extra: { changedPaths: [MAIN.path] } });
        expect(wrapper.findComponent(Opacity).exists()).toBe(false);
        expect(layerPanel().exists()).toBe(true);
        expect(layerPanel().props('layers').map(l => l.path)).toEqual([MAIN.path]);
        expect(layerPanel().props('changedPaths')).toEqual([MAIN.path]);
    });

    it('in a view of a file that is not a georaster, there is the panel with no row, to add one', async () => {
        await mountView([], { base: ZONES, extra: { canAddLayers: true } });
        expect(wrapper.findComponent(Opacity).exists()).toBe(false);
        const panel = layerPanel();
        expect(panel.exists()).toBe(true);
        expect(panel.props('layers')).toEqual([]);
        expect(panel.props('canAdd')).toBe(true);
        panel.vm.$emit('add');
        expect(wrapper.emitted('addLayer')).toHaveLength(1);
    });

    it('in a view, a layer can be removed, picked again or added, whatever its place', async () => {
        await mountView([ADDED, MAIN], { extra: { canAddLayers: true, addLayerDisabled: true, addLayerTitle: 'A view shows at most 6 rasters' } });
        const panel = layerPanel();
        expect(panel.props('removable')).toBe(true);
        expect(panel.props('removablePaths')).toBeNull();
        expect(panel.props('canRepick')).toBe(true);
        expect(panel.props('canAdd')).toBe(true);
        expect(panel.props('addDisabled')).toBe(true);
        expect(panel.props('addTitle')).toBe('A view shows at most 6 rasters');
    });

    it('tells the viewer which layer to remove or pick again, and to add one', async () => {
        await mountView([ADDED, MAIN], { extra: { canAddLayers: true } });
        layerPanel().vm.$emit('remove', ADDED.path);
        layerPanel().vm.$emit('repick', MAIN.path);
        layerPanel().vm.$emit('add');
        expect(wrapper.emitted('removeLayer')).toEqual([[ADDED.path]]);
        expect(wrapper.emitted('repick')).toEqual([[MAIN.path]]);
        expect(wrapper.emitted('addLayer')).toHaveLength(1);
    });

    it('in a view, the row of a lone raster sets its own opacity and honours its eye', async () => {
        await mountView([MAIN]);
        const layer = wrapper.vm.rasterLayerList[0].olLayer;
        layerPanel().vm.$emit('update:layers', [{ ...wrapper.vm.rasterLayerList[0], opacity: 0.4 }]);
        await settle();
        expect(layer.getOpacity()).toBeCloseTo(0.4);
        wrapper.vm.toggleRasterLayerVisible(MAIN.path);
        await settle();
        expect(layer.getVisible()).toBe(false);
    });

    it('on the dataset tab, a lone raster ignores its row and always shows (the contrast)', async () => {
        await mountMap([file(MAIN)], { standalone: false });
        const layer = wrapper.vm.rasterLayerList[0].olLayer;
        wrapper.vm.rasterLayerList = [{ ...wrapper.vm.rasterLayerList[0], opacity: 0.4, visible: false }];
        await settle();
        expect(layer.getVisible()).toBe(true);
        expect(layer.getOpacity()).toBe(1);
    });
});

describe('the rows of the layer panel on a viewer-only map', () => {
    const embed = { embed: true };

    it('in a view, offers no add, remove or pick again', async () => {
        await mountView([ADDED, MAIN], { extra: { canAddLayers: true }, provide: embed });
        const panel = layerPanel();
        expect(panel.props('canAdd')).toBe(false);
        expect(panel.props('removable')).toBe(false);
        expect(panel.props('canRepick')).toBe(false);
    });

    it('in a view with a lone raster, offers no add either', async () => {
        await mountView([MAIN], { extra: { canAddLayers: true }, provide: embed });
        expect(layerPanel().props('canAdd')).toBe(false);
    });

    it('in a view of a file that is not a georaster, offers no add (the panel has nothing to show)', async () => {
        await mountView([], { base: ZONES, extra: { canAddLayers: true }, provide: embed });
        expect(layerPanel().props('canAdd')).toBe(false);
    });

    it('offers no add button on the dataset map with a single georaster', async () => {
        await mountMap([file(MAIN)], { standalone: false, canAddLayers: true }, embed);
        expect(wrapper.findComponent(Opacity).props('canAdd')).toBe(false);
    });

    it('without embed, the dataset map with a single georaster offers it', async () => {
        await mountMap([file(MAIN)], { standalone: false, canAddLayers: true });
        expect(wrapper.findComponent(Opacity).props('canAdd')).toBe(true);
    });

    it('offers no remove or pick again in the split overlay either', async () => {
        const state = { split: { enabled: true, positions: [0.5] } };
        await mountView([ADDED, MAIN], { state, provide: embed });
        expect(wrapper.findComponent(SplitOverlay).props('removable')).toBe(false);
        wrapper.unmount();
        await mountView([ADDED, MAIN], { state });
        expect(wrapper.findComponent(SplitOverlay).props('removable')).toBe(true);
    });

    it('has no remove in the split overlay of the dataset tab', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false });
        wrapper.vm.toggleSplit();
        await settle();
        expect(wrapper.findComponent(SplitOverlay).props('removable')).toBe(false);
    });
});

describe('the order of the layers when the files change', () => {
    it('keeps the order the user gave on the dataset tab, with the new layer on top', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false });
        expect(rows()).toEqual([ADDED.path, MAIN.path]);
        wrapper.vm.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        expect(rows()).toEqual([MAIN.path, ADDED.path]);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED), file(THIRD)] });
        await settle();
        expect(rows()).toEqual([THIRD.path, MAIN.path, ADDED.path]);
    });

    it('follows the layers of the view, whatever the user did', async () => {
        await mountView([ADDED, MAIN]);
        expect(rows()).toEqual([ADDED.path, MAIN.path]);
        wrapper.vm.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        expect(rows()).toEqual([MAIN.path, ADDED.path]);
        // The viewer applied the order the map reported and added a layer at the top
        await wrapper.setProps({
            files: [file(MAIN), file(ADDED), file(THIRD)],
            view: viewOf(MAIN, [THIRD, ADDED, MAIN])
        });
        await settle();
        expect(rows()).toEqual([THIRD.path, ADDED.path, MAIN.path]);
    });

    it('puts a layer added at the bottom at the bottom', async () => {
        await mountView([MAIN]);
        await wrapper.setProps({ files: [file(THIRD), file(MAIN)], view: viewOf(MAIN, [MAIN, THIRD]) });
        await settle();
        expect(rows()).toEqual([MAIN.path, THIRD.path]);
    });
});

describe('the toolbar', () => {
    it('offers Copy link in a view of a dataset, and not without a link or a dataset', async () => {
        await mountView([MAIN], { extra: { linkTarget: { path: MAIN.path } } });
        expect(toolbar().props('copyLink')).toBe(true);
        wrapper.unmount();
        await mountView([MAIN]);
        expect(toolbar().props('copyLink')).toBe(false);
        wrapper.unmount();
        await mountView([MAIN], { extra: { linkTarget: { path: MAIN.path }, dataset: null } });
        expect(toolbar().props('copyLink')).toBe(false);
    });

    it('does not offer Copy link on the dataset tab', async () => {
        await mountMap([file(MAIN)], { standalone: false });
        expect(toolbar().props('copyLink')).toBe(false);
    });

    it('offers only the split toggle in a view, from two rasters: a layer is added in the layer panel', async () => {
        await mountView([MAIN]);
        expect(toolbar().props('splitToggle')).toBe(true);
        expect(toolbar().props('canCompare')).toBe(false);
        expect(toolbar().props('pickToCompare')).toBe(false);
        wrapper.unmount();
        await mountView([ADDED, MAIN]);
        expect(toolbar().props('splitToggle')).toBe(true);
        expect(toolbar().props('canCompare')).toBe(true);
        expect(toolbar().props('pickToCompare')).toBe(false);
    });

    it('has no compare button in a view with one raster, and the split toggle with two (the toolbar drawn)', async () => {
        const compare = () => wrapper.element.querySelector('button[aria-label^="Compare"]');
        await mountView([MAIN], { real: ['MapToolbar'] });
        expect(compare()).toBeNull();
        wrapper.unmount();
        await mountView([ADDED, MAIN], { real: ['MapToolbar'] });
        expect(compare().getAttribute('aria-label')).toBe('Compare georasters side by side');
    });

    it('splits the map between the rasters of a view and reports the split', async () => {
        await mountView([ADDED, MAIN]);
        await toolbar().find('[data-split]').trigger('click');
        await settle();
        expect(wrapper.vm.splitMode).toBe(true);
        expect(reported.at(-1).split).toEqual({ enabled: true, positions: [0.5] });
    });

    it('shows the split of the view', async () => {
        await mountView([ADDED, MAIN], { state: { split: { enabled: true, positions: [0.3] } } });
        expect(wrapper.vm.splitMode).toBe(true);
        expect(wrapper.vm.splitPositions).toEqual([0.3]);
    });

    it('opens the file with the picker in a new tab from the dataset tab with one raster', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        await mountMap([file(MAIN)], { standalone: false });
        expect(toolbar().props('pickToCompare')).toBe(true);
        await toolbar().find('[data-split]').trigger('click');
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith(`/r/acme/site/view/${b64encode(MAIN.path)}/map?pick=1`, '_blank', 'noopener');
        open.mockRestore();
    });

    it('splits the dataset tab between its rasters from two (as before)', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false });
        expect(toolbar().props('canCompare')).toBe(true);
        await toolbar().find('[data-split]').trigger('click');
        expect(wrapper.vm.splitMode).toBe(true);
    });
});

describe('the analysis tools', () => {
    it('are in the toolbar of a map with an elevation model, on the dataset tab and in a view', async () => {
        await mountMap([file(MAIN)]);
        expect(toolbar().props('analysisEntry')).toMatchObject({ path: MAIN.path });
        wrapper.unmount();
        await mountView([ADDED, MAIN]);
        expect(toolbar().props('analysisEntry')).toMatchObject({ path: MAIN.path });
    });

    it('close when split compare turns on', async () => {
        await mountView([THIRD, MAIN]);
        await wrapper.vm.toggleAnalysisPanel('stockpile');
        expect(wrapper.vm.stockpilePanelVisible).toBe(true);
        wrapper.vm.toggleSplit();
        await settle();
        expect(wrapper.vm.splitMode).toBe(true);
        expect(wrapper.vm.stockpilePanelVisible).toBe(false);
    });

    it('take the elevation model a view records, without a panel, and record the one the user picks', async () => {
        // The tools would pick MAIN (the measurements are on the first georaster): THIRD is a choice
        await mountView([THIRD, MAIN], { state: { analysis: { target: THIRD.path } } });
        expect(wrapper.vm.analysisTargetPath).toBe(THIRD.path);
        expect(wrapper.vm.stockpilePanelVisible).toBe(false);
        reported.length = 0;
        await wrapper.vm.selectAnalysisTarget(MAIN.path);
        await settle();
        expect(wrapper.vm.analysisTargetPath).toBe(MAIN.path);
        // The model the tools pick anyway is not recorded
        expect(reported.at(-1).analysis.target).toBeNull();
        await wrapper.vm.selectAnalysisTarget(THIRD.path);
        await settle();
        expect(reported.at(-1).analysis.target).toBe(THIRD.path);
    });

    it('load the measurements of the elevation model of a view', async () => {
        dataset.getFileContents.mockClear();
        await mountView([ADDED, MAIN], { state: { analysis: { target: MAIN.path } } });
        const read = dataset.getFileContents.mock.calls.map(c => c[0]);
        expect(read.some(path => path.startsWith('dsm_measurements'))).toBe(true);
    });
});

describe('the link panel and the analysis panels', () => {
    const copyLink = () => toolbar().find('[data-copy]').trigger('click');
    const link = { linkTarget: { uid: 'v_k3j9x2ab' }, shareNote: true, canSave: true };

    it('opens with the link of the view and its note, and closes with the same button', async () => {
        await mountView([ADDED, MAIN], { extra: link });
        expect(linkPanel().exists()).toBe(false);
        await copyLink();
        expect(linkPanel().text()).toBe('v_k3j9x2ab|true|true');
        await copyLink();
        expect(linkPanel().exists()).toBe(false);
    });

    it('links to the file of a new view', async () => {
        await mountView([MAIN], { extra: { linkTarget: { path: MAIN.path } } });
        await copyLink();
        expect(linkPanel().text()).toBe(`${MAIN.path}|false|false`);
    });

    it('asks the viewer to save from the link panel', async () => {
        await mountView([MAIN], { extra: link });
        await copyLink();
        await linkPanel().find('[data-save]').trigger('click');
        expect(wrapper.emitted('save')).toHaveLength(1);
    });

    it('closes when an analysis panel opens', async () => {
        await mountView([MAIN], { extra: link });
        await copyLink();
        expect(linkPanel().exists()).toBe(true);
        await wrapper.vm.toggleAnalysisPanel('stockpile');
        await nextTick();
        expect(wrapper.vm.stockpilePanelVisible).toBe(true);
        expect(linkPanel().exists()).toBe(false);
    });

    it('replaces an open analysis panel when it opens', async () => {
        await mountView([MAIN], { extra: link });
        await wrapper.vm.toggleAnalysisPanel('stockpile');
        expect(wrapper.vm.stockpilePanelVisible).toBe(true);
        await copyLink();
        expect(wrapper.vm.stockpilePanelVisible).toBe(false);
        expect(linkPanel().exists()).toBe(true);
    });
});

describe('the panels over the map', () => {
    // The phone layout hides the layer panel behind an open sheet with `.map-container:has(> …)`,
    // which only matches direct children of the map
    it('are direct children of the map, the analysis sheet and the layer panel', async () => {
        wrapper = mount(MapCore, {
            props: {
                files: [file(MAIN)], dataset: { ...dataset, getVisibility: async () => null }, standalone: true,
                view: viewOf(MAIN, [MAIN]), linkTarget: { path: MAIN.path }
            },
            global: { stubs: { ...stubs, MapLinkPanel: false, RasterLayerOpacityPanel: false }, mocks: { $router: { push: vi.fn() } } },
            attachTo: document.body
        });
        await settle();
        await toolbar().find('[data-copy]').trigger('click');
        const container = wrapper.find('.map-container').element;
        expect(wrapper.find('.analysis-panel').element.parentElement).toBe(container);
        expect(wrapper.find('.map-bottom-panel').element.parentElement).toBe(container);
    });
});

describe('the photo popup', () => {
    it('closed by the user (Escape, Close) clears the footprint and leaves the focus to the overlay stack (MAP-20)', async () => {
        await mountMap([]);
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        const clear = vi.spyOn(wrapper.vm.fileLayers, 'clearFootprints');
        wrapper.findComponent(Popup).vm.$emit('dismiss');
        expect(clear).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it('has a map container that can take the focus from code, as the popup gives it back there', async () => {
        await mountMap([]);
        expect(wrapper.find('.map-container').attributes('tabindex')).toBe('-1');
    });
});

describe('the size class of the map (FR-MAP-12, FR-SHR-05)', () => {
    /** The container of the map has this size (jsdom has no layout: its elements have none) */
    const sized = (width, height) => {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
    };
    afterEach(() => {
        delete HTMLElement.prototype.clientWidth;
        delete HTMLElement.prototype.clientHeight;
    });
    const classes = () => wrapper.find('.map-container').classes();

    it('is narrow and compact on a phone, whatever the window is', async () => {
        sized(390, 844);
        await mountMap([]);
        expect(classes()).toEqual(expect.arrayContaining(['is-narrow', 'is-compact']));
        expect(classes()).not.toContain('is-short');
    });

    it('is short and compact, not narrow, in the default 600 x 400 frame of an embed', async () => {
        sized(600, 400);
        await mountMap([]);
        expect(classes()).toEqual(expect.arrayContaining(['is-short', 'is-compact']));
        expect(classes()).not.toContain('is-narrow');
    });

    it('is none of them on a desktop map', async () => {
        sized(1280, 800);
        await mountMap([]);
        for (const name of ['is-narrow', 'is-short', 'is-compact']) expect(classes()).not.toContain(name);
    });
});

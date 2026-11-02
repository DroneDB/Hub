/**
 * MapCore as the maps use it: what it hands to its toolbar and layer panels for each kind of
 * map (dataset tab, single-file map, comparison), when it fits the view, and how its panels
 * share the corner. The children are stubs that show their props; OpenLayers is real.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { fromLonLat } from 'ol/proj';
import ddb from 'ddb';

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
    props: { showBack: Boolean, copyLink: Boolean, analysisEntry: { type: Object, default: null }, splitToggle: Boolean, displayOptions: Boolean, splitMode: Boolean },
    emits: ['back', 'copy-link', 'analysis', 'toggle-split'],
    setup(props, { emit }) {
        return () => h('div', { 'data-stub': 'toolbar' }, [h('button', { 'data-copy': '', onClick: () => emit('copy-link') })]);
    }
});
const LayerPanel = defineComponent({
    name: 'RasterLayerOpacityPanel',
    props: { layers: { type: Array, default: () => [] }, removable: Boolean, removablePaths: { type: Array, default: null }, removeLabel: { type: String, default: '' }, canRepick: Boolean, canAdd: Boolean },
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
    props: { dataset: { type: Object, default: null }, path: { type: String, default: '' }, layers: { type: Array, default: () => [] } },
    emits: ['close'],
    setup(props) { return () => h('div', { 'data-stub': 'link' }, `${props.path}|${props.layers.join(',')}`); }
});
// The popup is driven through methods
const Popup = defineComponent({ name: 'MapFilePopup', props: { map: { type: Object, default: null } }, setup(_, { expose }) { expose({ closeUnlessIn: () => false, close() {}, show() {} }); return () => h('div'); } });
const Plain = name => defineComponent({ name, inheritAttrs: false, setup() { return () => h('div'); } });

const stubs = {
    MapToolbar: Toolbar,
    RasterLayerOpacityPanel: LayerPanel,
    MapLinkPanel: LinkPanel,
    MapFilePopup: Popup,
    OpacityControl: Opacity,
    RasterSplitOverlay: Plain('RasterSplitOverlay'),
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
    return { ...utils, FIT_OPTIONS: { ...utils.FIT_OPTIONS, duration: 0 } };
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
const COMPARISON = (...entries) => ({
    v: 1,
    layers: entries.map(e => ({ path: e.path, hash: e.hash, opacity: 1, vizParams: null })),
    split: { enabled: false, positions: [] },
    view: null,
    display: { basemap: null }
});

describe('the view of the single-file map', () => {
    it('opens on the main file only when layers are added at the first load', async () => {
        await mountMap([file(MAIN), file(ADDED)]);
        expect(near(center(), mainCenter)).toBe(true);
    });

    it('does not move when a layer is added later', async () => {
        await mountMap([file(MAIN)]);
        expect(near(center(), mainCenter)).toBe(true);
        wrapper.vm.map.getView().setCenter([123, 456]);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED)] });
        await settle();
        expect(center()).toEqual([123, 456]);
    });

    it('does not move when a layer is removed', async () => {
        await mountMap([file(MAIN), file(ADDED)]);
        wrapper.vm.map.getView().setCenter([123, 456]);
        await wrapper.setProps({ files: [file(MAIN)] });
        await settle();
        expect(center()).toEqual([123, 456]);
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

describe('Copy link', () => {
    it('is offered on the single-file map of a dataset', async () => {
        await mountMap([file(MAIN)]);
        expect(toolbar().props('copyLink')).toBe(true);
    });

    it.each([
        ['the dataset tab', { standalone: false }],
        ['a map with no dataset', { dataset: null }],
        ['a comparison', { comparison: COMPARISON(MAIN) }]
    ])('is not offered on %s', async (_, props) => {
        await mountMap([file(MAIN)], props);
        expect(toolbar().props('copyLink')).toBe(false);
    });
});

describe('the rows of the layer panel', () => {
    it('on the single-file map, only the added layers can be removed, and none can be picked again', async () => {
        await mountMap([file(MAIN), file(ADDED)], { addedLayerPaths: [ADDED.path] });
        const panel = layerPanel();
        expect(panel.exists()).toBe(true);
        expect(panel.props('removable')).toBe(false);
        expect(panel.props('removablePaths')).toEqual([ADDED.path]);
        expect(panel.props('removeLabel')).toBe('Remove layer');
        expect(panel.props('canRepick')).toBe(false);
    });

    it('in a comparison, every row can be removed or picked again', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false, comparison: COMPARISON(MAIN, ADDED) });
        const panel = layerPanel();
        expect(panel.props('removable')).toBe(true);
        expect(panel.props('removablePaths')).toBeNull();
        expect(panel.props('removeLabel')).toBe('Remove from comparison');
        expect(panel.props('canRepick')).toBe(true);
    });

    it('tells the parent which layer to remove or pick again', async () => {
        await mountMap([file(MAIN), file(ADDED)], { addedLayerPaths: [ADDED.path] });
        layerPanel().vm.$emit('remove', ADDED.path);
        layerPanel().vm.$emit('add');
        expect(wrapper.emitted('removeLayer')).toEqual([[ADDED.path]]);
        expect(wrapper.emitted('addLayer')).toHaveLength(1);
    });
});

describe('the rows of the layer panel on a viewer-only map', () => {
    const embed = { embed: true };

    it('on the single-file map, offers no add button and removes no added layer', async () => {
        await mountMap([file(MAIN), file(ADDED)], { canAddLayers: true, addedLayerPaths: [ADDED.path] }, embed);
        const panel = layerPanel();
        expect(panel.props('canAdd')).toBe(false);
        expect(panel.props('removable')).toBe(false);
        expect(panel.props('removablePaths')).toEqual([]);
        expect(panel.props('canRepick')).toBe(false);
    });

    it('in a comparison, offers no add, remove or pick again', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false, canAddLayers: true, comparison: COMPARISON(MAIN, ADDED) }, embed);
        const panel = layerPanel();
        expect(panel.props('canAdd')).toBe(false);
        expect(panel.props('removable')).toBe(false);
        expect(panel.props('removablePaths')).toEqual([]);
        expect(panel.props('canRepick')).toBe(false);
    });

    it('offers no add button on a map with a single georaster', async () => {
        await mountMap([file(MAIN)], { canAddLayers: true }, embed);
        expect(wrapper.findComponent(Opacity).props('canAdd')).toBe(false);
    });

    it('without embed, the single-file map offers them', async () => {
        await mountMap([file(MAIN)], { canAddLayers: true });
        expect(wrapper.findComponent(Opacity).props('canAdd')).toBe(true);
        wrapper.unmount();
        await mountMap([file(MAIN), file(ADDED)], { canAddLayers: true, addedLayerPaths: [ADDED.path] });
        expect(layerPanel().props('canAdd')).toBe(true);
        expect(layerPanel().props('removablePaths')).toEqual([ADDED.path]);
    });

    it('without embed, a comparison offers them', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false, canAddLayers: true, comparison: COMPARISON(MAIN, ADDED) });
        expect(layerPanel().props('canAdd')).toBe(true);
        expect(layerPanel().props('removable')).toBe(true);
        expect(layerPanel().props('canRepick')).toBe(true);
    });
});

describe('the order of the layers when the files change', () => {
    const rows = () => wrapper.vm.rasterLayerList.map(r => r.path);
    const THIRD = georaster('dtm.tif', POLYGON);

    it('keeps the order the user gave on the single-file map, with the new layer on top', async () => {
        await mountMap([file(MAIN), file(ADDED)]);
        expect(rows()).toEqual([ADDED.path, MAIN.path]);
        wrapper.vm.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        expect(rows()).toEqual([MAIN.path, ADDED.path]);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED), file(THIRD)] });
        await settle();
        expect(rows()).toEqual([THIRD.path, MAIN.path, ADDED.path]);
    });

    it('follows the files in a comparison, whatever the user did', async () => {
        await mountMap([file(MAIN), file(ADDED)], { standalone: false, comparison: COMPARISON(MAIN, ADDED) });
        wrapper.vm.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        expect(rows()).toEqual([MAIN.path, ADDED.path]);
        await wrapper.setProps({ files: [file(MAIN), file(ADDED), file(THIRD)], comparison: COMPARISON(MAIN, ADDED, THIRD) });
        await settle();
        expect(rows()).toEqual([THIRD.path, ADDED.path, MAIN.path]);
    });
});

describe('the analysis tools', () => {
    it('are in the toolbar of a map with an elevation model, and not in a comparison', async () => {
        await mountMap([file(MAIN)]);
        expect(toolbar().props('analysisEntry')).toMatchObject({ path: MAIN.path });
        wrapper.unmount();
        await mountMap([file(MAIN), file(ADDED)], { standalone: false, comparison: COMPARISON(MAIN, ADDED) });
        expect(toolbar().props('analysisEntry')).toBeNull();
    });

    it('close when split compare turns on', async () => {
        await mountMap([file(MAIN), file(georaster('dtm.tif'))]);
        await wrapper.vm.toggleAnalysisPanel('stockpile');
        expect(wrapper.vm.stockpilePanelVisible).toBe(true);
        wrapper.vm.toggleSplit();
        await settle();
        expect(wrapper.vm.splitMode).toBe(true);
        expect(wrapper.vm.stockpilePanelVisible).toBe(false);
    });
});

describe('the link panel and the analysis panels', () => {
    const copyLink = () => toolbar().find('[data-copy]').trigger('click');

    it('opens with the main file and the added layers, and closes with the same button', async () => {
        await mountMap([file(MAIN), file(ADDED)], { addedLayerPaths: [ADDED.path] });
        expect(linkPanel().exists()).toBe(false);
        await copyLink();
        expect(linkPanel().text()).toBe(`${MAIN.path}|${ADDED.path}`);
        await copyLink();
        expect(linkPanel().exists()).toBe(false);
    });

    it('closes when an analysis panel opens', async () => {
        await mountMap([file(MAIN)]);
        await copyLink();
        expect(linkPanel().exists()).toBe(true);
        await wrapper.vm.toggleAnalysisPanel('stockpile');
        await nextTick();
        expect(wrapper.vm.stockpilePanelVisible).toBe(true);
        expect(linkPanel().exists()).toBe(false);
    });

    it('replaces an open analysis panel when it opens', async () => {
        await mountMap([file(MAIN)]);
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
        await mountMap([file(MAIN)], { dataset: { ...dataset, getVisibility: async () => null } }, {}, ['MapLinkPanel', 'OpacityControl']);
        await toolbar().find('[data-copy]').trigger('click');
        const container = wrapper.find('.map-container').element;
        expect(wrapper.find('.analysis-panel').element.parentElement).toBe(container);
        expect(wrapper.find('.map-bottom-panel').element.parentElement).toBe(container);
    });
});

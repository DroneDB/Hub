/**
 * The point-cloud viewer's controls (FR-VWR-26, D-027), in two bars of one look. Top left, what the user does to the
 * cloud: the one MeasureToolbar with labelled measuring tools that start what the icons of the Potree menu start, then
 * the clip volume once the cloud is loaded, and undo and Save once there are measurements. Bottom left, how the cloud
 * is shown: the views, Colour by and the unit. Potree is a stand-in that records what it is asked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { readSource } from '@/specs/cssSource';
import { US_FOOT_WKT, FOOT_WKT, UTM_33N_WKT, METRE_US_FOOT_HEIGHT_WKT } from '@/libs/map/crs.fixtures';
import { notify } from '@/libs/notify';

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}

let viewer;
let measure;

vi.mock('ddb', () => ({
    default: {
        entry: { type: { POINTCLOUD: 'pointcloud' } },
        pathutils: { basename: p => p.split('/').pop() }
    }
}));
// The error the viewer shows (its shell is a stand-in)
const shown = vi.hoisted(() => ({ error: null }));
// What the user may do in the dataset, and the measurements of the viewer: refs the tests change
const access = vi.hoisted(() => ({}));
const measurements = vi.hoisted(() => ({}));
// The query of the address of the viewer (`?item=`: the annotation to frame)
const routing = vi.hoisted(() => ({ query: {}, found: true }));
// The path of the entry the viewer opens
const opened = vi.hoisted(() => ({ path: 'cloud.laz' }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: routing.query }) }));
vi.mock('@/composables/useViewerEntry', () => ({
    useViewerEntry: () => ({
        entry: ref({ path: opened.path }),
        dataset: ref({ Entry: e => ({ path: e.path, getCopc: () => 'https://hub.test/cloud.copc.laz' }) }),
        canWrite: (access.canWrite = ref(true)), canDelete: (access.canDelete = ref(true)), loading: ref(false), error: (shown.error = ref('')), loadError: ref(null),
        entryLoaded: Promise.resolve(true)
    })
}));
vi.mock('@/composables/usePotreeMeasurements', () => ({
    usePotreeMeasurements: () => Object.assign(measurements, {
        hasMeasurements: ref(false), hasSavedMeasurements: ref(false), savingMeasurements: ref(false), deleteDialogOpen: ref(false),
        deleteToolActive: ref(false), canUndo: ref(false), canRedo: ref(false), undo: vi.fn(), redo: vi.fn(), toggleDeleteTool: vi.fn(),
        save: vi.fn(), requestDelete: vi.fn(), onDeleteDialogClose() {}, discardMeasure() {}, attach: (_viewer, _session, coordinateSystem) => { calls.push(['attach', coordinateSystem]); }, load: async () => { calls.push(['load']); }, focusItem: id => { calls.push(['focus', id]); return routing.found; }, onGuiLoaded() {}
    })
}));
// The scripts of Potree load when the test lets them
const lazy = vi.hoisted(() => ({ gate: null }));
vi.mock('@/libs/lazy', () => ({ loadResources: () => lazy.gate ?? Promise.resolve() }));
const calls = vi.hoisted(() => []);
// The WKT of the COPC header
const copcWkt = vi.hoisted(() => ({ value: 'PROJCS["x"]' }));
// The version that the URLs of the Potree files get: the Hub's and the digest of the files (potreeVersion)
const urlVersion = vi.hoisted(() => ({ used: null }));
vi.mock('@/libs/potree/potreeResources', () => ({
    POTREE_RESOURCES: [], versioned: (r, version) => { urlVersion.used = version; return r; }, potreeVersion: v => `${v}+files`, fixPotreePaths() {}
}));
const sessionOptions = vi.hoisted(() => ({ last: null }));
vi.mock('@/libs/potree/potreeSession', () => ({
    pointBudgetFor: () => 1000000,
    PotreeSession: class {
        constructor(options) { sessionOptions.last = options; }
        create(factory) { return factory(); }
        track(target, type, fn, options) { target.addEventListener(type, fn, options); }
        untrack(target, type, fn) { target.removeEventListener(type, fn); }
        dispose() {}
    }
}));
vi.mock('@/libs/potree/potreeControls', () => ({ labelPotreeControls() {} }));
vi.mock('@/libs/hubUpdateChecker', () => ({ HUB_VERSION: 'test' }));

import PotreeViewer from './PotreeViewer.vue';

function stubPotree() {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const material = Object.assign(new Dispatcher(), { activeAttributeName: 'rgba' });
    const range = (min, max) => ({ range: [min, max] });
    const attributes = { rgba: range(0, 255), intensity: range(0, 65535) };
    // The header copc.js read the cloud with, kept by its geometry
    const copc = {
        header: { scale: [0.01, 0.01, 0.001, 9], offset: [100, 200, 0, 9] }, info: { cube: [0, 1, 2, 10, 11, 12] }, wkt: copcWkt.value
    };
    const cloud = { material, getAttribute: name => attributes[name] ?? null, pcoGeometry: { copc } };
    const scene = Object.assign(new Dispatcher(), {
        measurements: [], volumes: [], polygonClipVolumes: [], pointclouds: [],
        addPointCloud(c) { this.pointclouds.push(c); }, removeMeasurement() {}, removeAllClipVolumes() {},
        scene: { add() {} }
    });
    const measuringTool = Object.assign(new Dispatcher(), {
        startInsertion: vi.fn(args => {
            measure = { points: [], spheres: [], name: args.name, maxMarkers: args.maxMarkers ?? Infinity, removeMarker() {}, addMarker() {} };
            measuringTool.dispatchEvent({ type: 'start_inserting_measurement', measure });
            return measure;
        })
    });
    viewer = Object.assign(new Dispatcher(), {
        scene, measuringTool, renderer: { domElement: canvas, setPixelRatio: vi.fn() },
        inputHandler: { drag: null, startDragging: vi.fn() },
        volumeTool: { startInsertion: vi.fn() },
        setTopView: vi.fn(), setFrontView: vi.fn(), setLeftView: vi.fn(), setRightView: vi.fn(),
        setLengthUnit: vi.fn(), setEDLEnabled() {}, setFOV() {}, setPointBudget() {}, fitToScreen() {}, setLanguage() {},
        loadGUI: cb => { calls.push(['gui']); cb(); }, lengthUnit: 'm', lengthUnitDisplay: {}
    });
    globalThis.Potree = {
        PointSizeType: { FIXED: 0, ATTENUATED: 1, ADAPTIVE: 2 }, TextSprite: class {},
        Viewer: function Viewer() { return viewer; },
        loadPointCloud: (_url, _name, cb) => cb({ type: 'pointcloud_loaded', pointcloud: Object.assign(cloud, { material }) })
    };
    globalThis.THREE = { AmbientLight: class {}, DirectionalLight: class { constructor() { this.position = {}; } } };
    globalThis.$ = () => ({ next: () => ({ show() {} }), length: 0 });
    cloud.material.size = 0;
}

let wrapper;
const stubs = {
    ViewerShell: { template: '<div><slot /></div>' },
    DialogHost: true,
    DeleteSavedMeasurementsDialog: true
};
const mountViewer = async () => {
    wrapper = mount(PotreeViewer, { global: { stubs } });
    await flushPromises();
};
const button = id => wrapper.find(`[data-testid="${id}"]`);
// The two bars: the tools (top left) and the display of the cloud (bottom left)
const tools = () => wrapper.find('[role="toolbar"][aria-label="Measure"]');
const display = () => wrapper.find('[role="toolbar"][aria-label="Display"]');

beforeEach(() => { calls.length = 0; opened.path = 'cloud.laz'; routing.query = {}; routing.found = true; lazy.gate = null; copcWkt.value = 'PROJCS["x"]'; stubPotree(); });
afterEach(() => {
    wrapper?.unmount();
    delete globalThis.Potree;
    delete globalThis.THREE;
    delete globalThis.$;
});

describe('PotreeViewer on a HiDPI screen (FR-VWR-33, FR-VWR-36)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('draws at the applied ratio: min(devicePixelRatio, 2), and the labels of Potree at the same one', async () => {
        vi.stubGlobal('devicePixelRatio', 3);
        await mountViewer();
        expect(viewer.renderer.setPixelRatio).toHaveBeenCalledWith(2);
        expect(globalThis.Potree.TextSprite.resolutionScale).toBe(2);
    });

    it('at ratio 1 the canvas is the CSS size', async () => {
        vi.stubGlobal('devicePixelRatio', 1);
        await mountViewer();
        expect(viewer.renderer.setPixelRatio).toHaveBeenCalledWith(1);
        expect(globalThis.Potree.TextSprite.resolutionScale).toBe(1);
    });

    it('shows the point cloud with adaptive points of 1 CSS px, never less than 2 px (the size of a point follows the screen)', async () => {
        await mountViewer();
        const material = viewer.scene.pointclouds[0].material;
        expect(material.pointSizeType).toBe(2);
        expect(material.size).toBe(1);
        expect(material.minSize).toBe(2);
    });
});

describe('PotreeViewer tool panel', () => {
    it('has the measuring tools with their names in the MeasureToolbar', async () => {
        await mountViewer();
        const toolbar = wrapper.find('[data-testid="measure-toolbar"]');
        expect(toolbar.exists()).toBe(true);
        expect(['point', 'distance', 'height', 'area'].map(k => button(`measure-${k}`).text())).toEqual(['Point', 'Distance', 'Height', 'Area']);
    });

    it('each tool starts the measure of the Potree icon of its kind', async () => {
        await mountViewer();
        await button('measure-distance').trigger('click');
        expect(viewer.measuringTool.startInsertion).toHaveBeenLastCalledWith({ showDistances: true, showArea: false, closed: false, name: 'Distance' });
        await button('measure-area').trigger('click');
        expect(viewer.measuringTool.startInsertion).toHaveBeenLastCalledWith({ showDistances: true, showArea: true, closed: true, name: 'Area' });
    });

    it('shows the hint of the tool with Done and Cancel while a measure is drawn', async () => {
        await mountViewer();
        await button('measure-distance').trigger('click');
        expect(button('measure-hint').text()).toContain('Enter');
        expect(button('measure-done').exists()).toBe(true);
        expect(button('measure-cancel').exists()).toBe(true);
    });

    it('has the clip volume in the measuring toolbar once the cloud is loaded', async () => {
        await mountViewer();
        expect(tools().find('[data-testid="clip-volume"]').text()).toBe('Clip volume');
        expect(tools().find('[data-testid="clip-remove"]').exists()).toBe(true);
    });

    it('has neither the clip volume nor the display bar while the cloud loads', async () => {
        globalThis.Potree.loadPointCloud = () => {};
        wrapper = mount(PotreeViewer, { global: { stubs } });
        await flushPromises();
        expect(wrapper.find('[data-testid="measure-toolbar"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="potree-clip-tools"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="potree-display-bar"]').exists()).toBe(false);
    });

    it('the Top button looks at the cloud from above', async () => {
        await mountViewer();
        await button('view-top').trigger('click');
        expect(viewer.setTopView).toHaveBeenCalledTimes(1);
    });

    it('Clip volume starts the clip insertion and ends the measure that is drawn', async () => {
        await mountViewer();
        await button('measure-distance').trigger('click');
        expect(button('measure-hint').exists()).toBe(true);
        await button('clip-volume').trigger('click');
        expect(viewer.volumeTool.startInsertion).toHaveBeenCalledWith({ clip: true });
        expect(button('measure-hint').exists()).toBe(false);
    });
});

describe('PotreeViewer bars: what is done to the cloud at the top, how it is shown at the bottom', () => {
    it('has two toolbars: Measure, then Display', async () => {
        await mountViewer();
        expect(wrapper.findAll('[role="toolbar"]').map(t => t.attributes('aria-label'))).toEqual(['Measure', 'Display']);
        expect(tools().element.closest('.tools-top')).not.toBeNull();
        expect(display().classes()).toContain('tools-bottom');
    });

    it('has the views, Colour by and the unit in the display bar, and none of them among the tools', async () => {
        await mountViewer();
        expect(['top', 'front', 'left', 'right'].map(v => display().find(`[data-testid="view-${v}"]`).text())).toEqual(['Top', 'Front', 'Left', 'Right']);
        expect(display().find('[data-testid="color-by"]').exists()).toBe(true);
        expect(display().find('#potree-unit-select').exists()).toBe(true);
        for (const id of ['view-top', 'color-by', 'unit-select']) expect(tools().find(`[data-testid="${id}"]`).exists(), id).toBe(false);
    });

    it('has no tool in the display bar: the measures, the clip volume, undo and Save are at the top', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        await flushPromises();
        for (const id of ['measure-distance', 'clip-volume', 'measure-undo', 'measure-save']) {
            expect(tools().find(`[data-testid="${id}"]`).exists(), id).toBe(true);
            expect(display().find(`[data-testid="${id}"]`).exists(), id).toBe(false);
        }
    });

    it('places the two bars at the left, at one distance from the edges, clear of the right edge and of the open menu', () => {
        const scss = readSource(__dirname, 'PotreeViewer.scss');
        expect(scss).toMatch(/\.tools-top,\s*\.tools-bottom \{[^}]*position: absolute;\s*left: var\(--ddb-spacing-sm\);\s*max-width: calc\(100% - var\(--ddb-spacing-sm\) - var\(--tools-room-right\)\);/);
        expect(scss).toMatch(/\.tools-top \{\s*top: var\(--ddb-spacing-sm\);/);
        expect(scss).toMatch(/\.tools-bottom \{\s*bottom: var\(--ddb-spacing-sm\);/);
        expect(scss).toMatch(/\.potree-container\.sidebar-open \{\s*\.tools-top,\s*\.tools-bottom \{\s*--tools-room-right: calc\(var\(--ddb-sidebar-width\) \+ 4\.5rem\);/);
        const phone = scss.slice(scss.indexOf('@media (max-width: 767.98px)'));
        expect(phone).toMatch(/\.potree-container\.sidebar-open \{\s*\.tools-top,\s*\.tools-bottom \{\s*visibility: hidden;/);
    });

    it('has no look of its own for a bar or a button: the bars are OverlayToolbars', () => {
        const scss = readSource(__dirname, 'PotreeViewer.scss');
        expect(scss).not.toMatch(/btn-undo-redo|btn-measurement|unit-selector-toolbar|measurements-toolbar|--ddb-viewer-btn-/);
    });
});

describe('PotreeViewer undo and Save, in the measuring toolbar once there are measurements', () => {
    const history = () => tools().find('[data-testid="measure-history"]');
    const saved = () => tools().find('[data-testid="measure-saved"]');
    const more = () => saved().find('[data-testid="overlay-menu-button"]');

    it('has neither with nothing measured and nothing saved', async () => {
        await mountViewer();
        expect(history().exists()).toBe(false);
        expect(saved().exists()).toBe(false);
    });

    it('has Undo, Redo and the delete tool as tools of the bar, after the clip volume', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        measurements.canUndo.value = true;
        await flushPromises();
        expect(history().classes()).toContain('tool-group');
        expect(history().findAll('button').map(b => b.attributes('aria-label'))).toEqual(['Undo', 'Redo', 'Delete measurement tool']);
        const order = tools().findAll('button').map(b => b.attributes('data-testid'));
        expect(order.indexOf('measure-undo')).toBeGreaterThan(order.indexOf('clip-remove'));
        expect(button('measure-undo').attributes('disabled')).toBeUndefined();
        expect(button('measure-redo').attributes('disabled')).toBeDefined();
        await button('measure-undo').trigger('click');
        expect(measurements.undo).toHaveBeenCalledTimes(1);
    });

    it('shows the delete tool as on, in the danger colour, while it is', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        await flushPromises();
        expect(button('measure-delete-tool').classes()).toEqual(['danger']);
        expect(button('measure-delete-tool').attributes('aria-pressed')).toBe('false');
        await button('measure-delete-tool').trigger('click');
        expect(measurements.toggleDeleteTool).toHaveBeenCalledTimes(1);
        measurements.deleteToolActive.value = true;
        await flushPromises();
        expect(button('measure-delete-tool').classes()).toEqual(['danger', 'active']);
        expect(button('measure-delete-tool').attributes('aria-pressed')).toBe('true');
    });

    it('has Save as the one filled button of the bar, named Save', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        await flushPromises();
        expect(button('measure-save').text()).toBe('Save');
        expect(button('measure-save').attributes('aria-label')).toBe('Save measurements');
        expect(tools().findAll('button.primary').map(b => b.attributes('data-testid'))).toEqual(['measure-save']);
        await button('measure-save').trigger('click');
        expect(measurements.save).toHaveBeenCalledTimes(1);
    });

    it('Save is off while a save runs, and is not there for a user who cannot write', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        measurements.savingMeasurements.value = true;
        await flushPromises();
        expect(button('measure-save').attributes('disabled')).toBeDefined();
        access.canWrite.value = false;
        await flushPromises();
        expect(button('measure-save').exists()).toBe(false);
    });

    it('keeps Save with nothing left in the view while a file is saved: saving then empties the file', async () => {
        await mountViewer();
        measurements.hasSavedMeasurements.value = true;
        await flushPromises();
        expect(button('measure-save').exists()).toBe(true);
    });

    it('has no button that deletes what was saved: it is in the menu beside Save, once something is saved', async () => {
        await mountViewer();
        measurements.hasMeasurements.value = true;
        await flushPromises();
        expect(more().exists()).toBe(false);
        measurements.hasSavedMeasurements.value = true;
        await flushPromises();
        expect(tools().findAll('button').map(b => b.text())).not.toContain('Delete Saved');
        await more().trigger('click');
        await flushPromises();
        const item = saved().find('[data-testid="overlay-menu-delete-saved"]');
        expect(item.text()).toBe('Delete saved measurements');
        expect(item.classes()).toContain('danger');
        await item.trigger('click');
        expect(measurements.requestDelete).toHaveBeenCalledTimes(1);
    });

    it('does not offer it to a user who cannot delete in the dataset', async () => {
        await mountViewer();
        measurements.hasSavedMeasurements.value = true;
        access.canDelete.value = false;
        await flushPromises();
        expect(button('measure-save').exists()).toBe(true);
        expect(more().exists()).toBe(false);
    });

    it('shows Save as its icon on a phone (below sm), with its accessible name', async () => {
        const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
            matches: query === '(max-width: 575.98px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
        }));
        try {
            await mountViewer();
            measurements.hasMeasurements.value = true;
            await flushPromises();
            expect(button('measure-save').text()).toBe('');
            expect(button('measure-save').attributes('aria-label')).toBe('Save measurements');
        } finally {
            media.mockRestore();
        }
    });
});

describe('PotreeViewer menu style (the sidebar of Potree kept for the advanced settings)', () => {
    const scss = readSource(__dirname, 'PotreeViewer.scss');

    it('takes the colours of the Hub through the custom properties of Potree', () => {
        expect(scss).toContain('--bg-color: var(--ddb-viewer-sidebar-bg);');
        expect(scss).toContain('--font-color: var(--ddb-text-on-dark);');
    });

    it('uses the font of the Hub, not Potree\'s Arial', () => {
        expect(scss).toMatch(/#sidebar_root \{[\s\S]*?height: 100%;\s*font-family: inherit;/);
    });
});

describe('PotreeViewer fullscreen (FR-VWR-38)', () => {
    let shellProps;
    const Shell = {
        props: { fullscreenButton: Boolean, fullscreenCorner: { type: String, default: null }, fullscreenKey: { type: Function, default: null } },
        setup(props) { shellProps = props; },
        template: '<div><slot /></div>'
    };
    const mountWithShell = async () => {
        wrapper = mount(PotreeViewer, { global: { stubs: { ...stubs, ViewerShell: Shell } } });
        await flushPromises();
    };

    it('asks its shell for the fullscreen button, at the bottom right when embedded (Potree has its buttons at the top right)', async () => {
        await mountWithShell();
        expect(shellProps.fullscreenButton).toBe(true);
        expect(shellProps.fullscreenCorner).toBe('bottom-right');
    });

    it('leaves the key F to Potree in fly mode, where F flies down, and gives it to the shell in the other modes', async () => {
        await mountWithShell();
        const fly = { name: 'fly' };
        const orbit = { name: 'orbit' };
        let controls = orbit;
        Object.assign(viewer, { fpControls: fly, getControls: () => controls });
        expect(shellProps.fullscreenKey()).toBe(true);
        controls = fly;
        expect(shellProps.fullscreenKey()).toBe(false);
        controls = orbit;
        expect(shellProps.fullscreenKey()).toBe(true);
    });

    it('gives the key F to the shell before Potree has its fly controls', async () => {
        await mountWithShell();
        expect(viewer.fpControls).toBeUndefined();
        expect(shellProps.fullscreenKey()).toBe(true);
    });

    it('moves the button of the shell beside the open menu, and hides it on a phone, where the menu covers the view', () => {
        const scss = readSource(__dirname, 'PotreeViewer.scss');
        expect(scss).toMatch(/&\.sidebar-open ~ \.viewer-fullscreen-overlay \{\s*right: calc\(var\(--ddb-sidebar-width\) \+ var\(--ddb-spacing-md\)\);/);
        const phone = scss.slice(scss.indexOf('@media (max-width: 767.98px)'));
        expect(phone).toMatch(/&\.sidebar-open ~ \.viewer-fullscreen-overlay \{\s*visibility: hidden;/);
    });
});

describe('PotreeViewer reading the point cloud', () => {
    it('takes the coordinate system from the header the cloud was read with, without reading the file again', async () => {
        const loadPointCloud = vi.spyOn(globalThis.Potree, 'loadPointCloud');
        await mountViewer();
        expect(loadPointCloud).toHaveBeenCalledTimes(1);
        expect(loadPointCloud.mock.calls[0][0]).toBe('https://hub.test/cloud.copc.laz');
        // No copc.js here: the viewer reads nothing itself
        expect(window.Copc).toBeUndefined();
        expect(calls.find(c => c[0] === 'attach')[1]).toEqual({
            srs: 'PROJCS["x"]', scale: [0.01, 0.01, 0.001], offset: [100, 200, 0],
            bounds: { minx: 0, miny: 1, minz: 2, maxx: 10, maxy: 11, maxz: 12 }
        });
    });

    it('gives Potree the name of a file named like markup as text: its scene tree parses the name as HTML', async () => {
        opened.path = 'a/<img src=x onerror=alert(1)>&.laz';
        const loadPointCloud = vi.spyOn(globalThis.Potree, 'loadPointCloud');
        await mountViewer();
        const name = loadPointCloud.mock.calls[0][1];
        expect(name).not.toContain('<');
        expect(name).toBe('&lt;img src=x onerror=alert(1)&gt;&amp;.laz');
    });

    it('loads the files of Potree under the version of the Hub and of the files, so a changed file is fetched again', async () => {
        urlVersion.used = null;
        await mountViewer();
        expect(urlVersion.used).toBe('test+files');
    });

    it('does nothing when the GUI of Potree finishes loading after the viewer was left', async () => {
        let guiLoaded;
        viewer.loadGUI = callback => { guiLoaded = callback; };
        await mountViewer();
        wrapper.unmount();
        wrapper = null;
        expect(() => guiLoaded()).not.toThrow();
    });

    it('tells the user once, in words, that a part of the cloud cannot be read when the server refuses it', async () => {
        const warn = vi.spyOn(notify, 'error').mockImplementation(() => {});
        await mountViewer();
        sessionOptions.last.onReadRefused({ status: 401 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('401');
        expect(warn.mock.calls[0][0]).toContain('Reload the page');
        warn.mockRestore();
    });

    it('shows an error when the cloud cannot be loaded', async () => {
        globalThis.Potree.loadPointCloud = (_url, _name, cb) => cb({ type: 'loading_failed' });
        await mountViewer();
        expect(calls.map(c => c[0])).not.toContain('attach');
        expect(shown.error.value).toContain('Unable to load cloud.laz');
    });
});

describe('PotreeViewer that is left while it loads', () => {
    afterEach(() => { delete window.viewer; });

    it('builds no viewer when the scripts of Potree arrive after the page was left', async () => {
        let release;
        lazy.gate = new Promise(resolve => { release = resolve; });
        const Viewer = vi.spyOn(globalThis.Potree, 'Viewer');
        wrapper = mount(PotreeViewer, { global: { stubs } });
        await flushPromises();

        wrapper.unmount();
        wrapper = null;
        release();
        await flushPromises();

        expect(Viewer).not.toHaveBeenCalled();
        expect(window.viewer).toBeUndefined();
    });

    it('does not load the measurements or publish the viewer when the cloud arrives after the page was left', async () => {
        let loaded;
        globalThis.Potree.loadPointCloud = (_url, _name, cb) => { loaded = () => cb({ type: 'pointcloud_loaded', pointcloud: { material: { activeAttributeName: 'rgba' }, getAttribute: () => null } }); };
        wrapper = mount(PotreeViewer, { global: { stubs } });
        await vi.waitFor(() => expect(loaded).toBeTypeOf('function'));

        wrapper.unmount();
        wrapper = null;
        loaded();
        await flushPromises();

        expect(calls.map(c => c[0])).not.toContain('load');
        expect(window.viewer).toBeUndefined();
    });

    it('lets go of window.viewer with the component', async () => {
        await mountViewer();
        expect(window.viewer).toBe(viewer);

        wrapper.unmount();
        wrapper = null;

        expect(window.viewer).toBeUndefined();
    });
});

describe('PotreeViewer lengths in the unit of the cloud', () => {
    it('a cloud in US survey feet measures in feet, shown in the unit the user chose (metres by default)', async () => {
        copcWkt.value = US_FOOT_WKT;
        stubPotree();
        await mountViewer();
        expect(viewer.lengthUnit.code).toBe('ft');
        expect(viewer.lengthUnit.unitspermeter).toBeCloseTo(3937 / 1200, 9);
        expect(viewer.lengthUnitDisplay).toEqual({ code: 'm', unitspermeter: 1 });
        // Potree's label: 100 units of the cloud, in metres
        expect(100 / viewer.lengthUnit.unitspermeter * viewer.lengthUnitDisplay.unitspermeter).toBeCloseTo(30.48006, 5);
        expect(viewer.scene.lengthUnit).toBe(viewer.lengthUnit);
    });

    it('a cloud in international feet, and one in metres', async () => {
        copcWkt.value = FOOT_WKT;
        stubPotree();
        await mountViewer();
        expect(viewer.lengthUnit).toEqual({ code: 'ft', unitspermeter: 1 / 0.3048 });
        wrapper.unmount();
        copcWkt.value = UTM_33N_WKT;
        stubPotree();
        await mountViewer();
        expect(viewer.lengthUnit).toEqual({ code: 'm', unitspermeter: 1 });
    });

    it('shows feet when the user chooses them, whatever the unit of the cloud', async () => {
        copcWkt.value = UTM_33N_WKT;
        stubPotree();
        await mountViewer();
        await wrapper.find('#potree-unit-select').setValue('imperial');
        expect(viewer.lengthUnitDisplay).toEqual({ code: 'ft', unitspermeter: 1 / 0.3048 });
        expect(viewer.lengthUnit).toEqual({ code: 'm', unitspermeter: 1 });
        // The preference is shared: back to the default for the other specs
        await wrapper.find('#potree-unit-select').setValue('metric');
    });
});

describe('PotreeViewer with the heights in another unit than x and y', () => {
    it('labels the numbers of the coordinates with no unit of length, says why, and turns the unit selector off', async () => {
        const warn = vi.spyOn(notify, 'warn').mockImplementation(() => {});
        try {
            copcWkt.value = METRE_US_FOOT_HEIGHT_WKT;
            stubPotree();
            await mountViewer();
            // Not metres, which the heights are not, nor feet, which x and y are not
            expect(viewer.lengthUnit).toEqual({ code: 'units', unitspermeter: 1 });
            expect(viewer.lengthUnitDisplay).toEqual({ code: 'units', unitspermeter: 1 });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('The heights of this point cloud are in US survey feet and its other coordinates in metres');
            expect(wrapper.find('#potree-unit-select').attributes('disabled')).toBeDefined();
        } finally {
            warn.mockRestore();
        }
    });

    it('a cloud in one unit is not told anything', async () => {
        const warn = vi.spyOn(notify, 'warn').mockImplementation(() => {});
        try {
            copcWkt.value = UTM_33N_WKT;
            stubPotree();
            await mountViewer();
            expect(warn).not.toHaveBeenCalled();
            expect(wrapper.find('#potree-unit-select').attributes('disabled')).toBeUndefined();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('PotreeViewer with ?item= (the link of a report item)', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/r/o/d/view/x/pointcloud?item=a1b2&keep=1');
        vi.spyOn(notify, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('frames the item once the measurements are in the viewer, and takes item off the address', async () => {
        routing.query = { item: 'a1b2' };
        await mountViewer();
        expect(calls.map(c => c[0])).toEqual(expect.arrayContaining(['attach', 'load', 'focus']));
        expect(calls.findIndex(c => c[0] === 'focus')).toBeGreaterThan(calls.findIndex(c => c[0] === 'load'));
        expect(calls.find(c => c[0] === 'focus')).toEqual(['focus', 'a1b2']);
        expect(notify.warn).not.toHaveBeenCalled();
        expect(window.location.search).toBe('?keep=1');
    });

    it('says "This item no longer exists" and opens as usual when the viewer has no item with the id', async () => {
        routing.query = { item: 'gone' };
        routing.found = false;
        await mountViewer();
        expect(notify.warn).toHaveBeenCalledWith('This item no longer exists', { summary: 'Item not found' });
        expect(calls.map(c => c[0])).toContain('load');
    });

    it('asks nothing of the viewer when the address has no item', async () => {
        await mountViewer();
        expect(calls.map(c => c[0])).not.toContain('focus');
        expect(notify.warn).not.toHaveBeenCalled();
    });
});

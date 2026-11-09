/**
 * The point-cloud viewer's tool panel (FR-VWR-26, D-027): the one MeasureToolbar with labelled measuring tools that start
 * what the icons of the Potree menu start, and the point cloud's own tools (clip volume, views, colour by) in its extra
 * slot once the cloud is loaded. Potree is a stand-in that records what it is asked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { readSource } from '@/specs/cssSource';

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
vi.mock('@/composables/useViewerEntry', () => ({
    useViewerEntry: () => ({
        entry: ref({ path: 'cloud.laz' }),
        dataset: ref({ Entry: e => ({ path: e.path, getCopc: () => 'https://hub.test/cloud.copc.laz' }) }),
        canWrite: ref(true), canDelete: ref(true), loading: ref(false), error: ref(''), loadError: ref(null),
        entryLoaded: Promise.resolve(true)
    })
}));
vi.mock('@/composables/usePotreeMeasurements', () => ({
    usePotreeMeasurements: () => ({
        hasMeasurements: ref(false), hasSavedMeasurements: ref(false), savingMeasurements: ref(false), deleteDialogOpen: ref(false),
        deleteToolActive: ref(false), canUndo: ref(false), canRedo: ref(false), undo() {}, redo() {}, toggleDeleteTool() {},
        save() {}, requestDelete() {}, onDeleteDialogClose() {}, discardMeasure() {}, attach() {}, load: async () => {}, onGuiLoaded() {}
    })
}));
vi.mock('@/libs/lazy', () => ({ loadResources: async () => {} }));
vi.mock('@/libs/potree/potreeResources', () => ({ POTREE_RESOURCES: [], versioned: r => r, fixPotreePaths() {} }));
vi.mock('@/libs/potree/potreeSession', () => ({
    pointBudgetFor: () => 1000000,
    PotreeSession: class {
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
    const cloud = { material, getAttribute: name => attributes[name] ?? null };
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
        loadGUI: cb => cb(), lengthUnit: 'm', lengthUnitDisplay: {}
    });
    globalThis.Potree = {
        PointSizeType: { FIXED: 0, ATTENUATED: 1, ADAPTIVE: 2 }, TextSprite: class {},
        Viewer: function Viewer() { return viewer; },
        loadPointCloud: (_url, _name, cb) => cb({ type: 'pointcloud_loaded', pointcloud: Object.assign(cloud, { material }) })
    };
    globalThis.THREE = { AmbientLight: class {}, DirectionalLight: class { constructor() { this.position = {}; } } };
    globalThis.$ = () => ({ next: () => ({ show() {} }), length: 0 });
    globalThis.window.Copc = {
        Copc: { create: async () => ({ header: {}, info: {} }) }, Getter: { http: u => u }
    };
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

beforeEach(stubPotree);
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

    it('has the clip volume, the views and Colour by in the toolbar once the cloud is loaded', async () => {
        await mountViewer();
        const toolbar = wrapper.find('[role="toolbar"]');
        expect(toolbar.find('[data-testid="clip-volume"]').text()).toBe('Clip volume');
        expect(['top', 'front', 'left', 'right'].map(v => toolbar.find(`[data-testid="view-${v}"]`).text())).toEqual(['Top', 'Front', 'Left', 'Right']);
        expect(toolbar.find('[data-testid="color-by"]').exists()).toBe(true);
    });

    it('does not have them while the cloud loads', async () => {
        globalThis.Potree.loadPointCloud = () => {};
        wrapper = mount(PotreeViewer, { global: { stubs } });
        await flushPromises();
        expect(wrapper.find('[data-testid="measure-toolbar"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="potree-tools"]').exists()).toBe(false);
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

/**
 * "Capture for report" through the point cloud viewer's measurements: the dialog of an annotation is given a capture only
 * for a writer, the capture writes <folder>/annotations/<id>-3d.webp over the earlier one and puts the snapshot in the
 * annotation, and the next Save writes it to the measurement file. The real Potree, the real converter and the real
 * storage run; the viewer around them is a stand-in.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { ref } from 'vue';
import { loadPotree } from '@/libs/potree/potreeLibs.fixtures';
import AnnotationPropertiesDialog from '@/features/viewers/pointcloud/AnnotationPropertiesDialog.vue';
import { useTestScope } from '@/composables/testScope.fixtures';

// The composable's scope ends with each test: its timers never fire after the test environment is torn down
const inTestScope = useTestScope();

vi.mock('@/composables/useMapAlerts', () => ({ flash: vi.fn() }));
vi.mock('@/libs/reports/reportSettings', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, datasetReportSettings: async () => ({ templates: [actual.DEFAULT_TEMPLATE], schema: actual.DEFAULT_SCHEMA }) };
});

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');

const PATH = 'site/cloud_measurements.geojson';
const FILE = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { measurementType: 'annotation', name: 'Gate', localCoordinates: [1, 2, 3] } }]
};

let stored;
let written;
const listeners = new Map();
const session = {
    track: (target, type, fn) => {
        if (typeof target.addEventListener === 'function') target.addEventListener(type, fn);
        else listeners.set(`${target.id}:${type}`, fn);
    },
    untrack: () => {},
    adopt: el => el
};

beforeAll(() => { globalThis.Potree = loadPotree(); });
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

async function start({ canWrite = true } = {}) {
    stored = { [PATH]: JSON.stringify(FILE) };
    written = [];
    const dataset = {
        getFileContents: vi.fn(async path => stored[path]),
        writeObj: vi.fn(async (path, blob, options) => { written.push({ path, options }); if (path === PATH) stored[path] = await blob.text(); }),
        deleteObj: vi.fn()
    };
    const dialogs = { open: vi.fn(() => ({ close: vi.fn() })) };
    const m = inTestScope(() => usePotreeMeasurements({ entry: ref({ path: 'site/cloud.laz' }), dataset: ref(dataset), canWrite: ref(canWrite), error: ref(''), dialogs }));
    const annotations = {
        id: 'annotations', children: [],
        add(a) { this.children.push(a); listeners.get('annotations:annotation_added')?.({ annotation: a }); },
        traverse(fn) { this.children.forEach(fn); },
        removeAllChildren() { this.children = []; },
        remove(a) { this.children = this.children.filter(x => x !== a); }
    };
    const canvas = Object.assign(document.createElement('canvas'), { id: 'canvas', width: 800, height: 600 });
    const view = { position: new THREE.Vector3(1, 2, 3), getPivot: () => new THREE.Vector3(4, 5, 6) };
    const viewer = {
        scene: { id: 'scene', view, measurements: [], annotations, addMeasurement() {}, removeMeasurement() {} },
        renderer: { domElement: canvas },
        zoomTo: vi.fn(),
        render: vi.fn()
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, drawImage() {}, fillStyle: '' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['webp'], { type: 'image/webp' })));
    // The nodes of the cloud are not loading: no waiting for them
    globalThis.Potree.numNodesLoading = 0;
    m.attach(viewer, session, { srs: null });
    await m.load();
    const annotation = annotations.children[0];
    annotation.domElement.find('.annotation-titlebar')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const [component, props] = dialogs.open.mock.calls.at(-1);
    expect(component).toBe(AnnotationPropertiesDialog);
    return { m, props, annotation, viewer };
}

describe('Capture for report in the point cloud viewer', () => {
    it('is offered to a writer, and not to a reader', async () => {
        expect((await start()).props.capture).toEqual({ run: expect.any(Function) });
        expect((await start({ canWrite: false })).props.capture).toBeNull();
    });

    it('writes <folder>/annotations/<id>-3d.webp over the earlier capture, frames the item, and Save writes the snapshot to the file', async () => {
        const { m, props, annotation, viewer } = await start();
        await props.capture.run();
        const id = annotation.ddbProperties.id;
        expect(written).toEqual([{ path: `site/annotations/${id}-3d.webp`, options: { overwrite: true } }]);
        expect(viewer.zoomTo).toHaveBeenCalledTimes(1);
        expect(annotation.ddbProperties.snapshot).toEqual({ path: `site/annotations/${id}-3d.webp`, camera: { position: [1, 2, 3], target: [4, 5, 6] }, capturedAt: expect.any(String) });

        // A new capture is written to the same path
        await props.capture.run();
        expect(written.map(w => w.path)).toEqual([`site/annotations/${id}-3d.webp`, `site/annotations/${id}-3d.webp`]);

        // Nothing is in the measurement file until Save
        expect(JSON.parse(stored[PATH]).features[0].properties.snapshot).toBeUndefined();
        await m.save();
        expect(JSON.parse(stored[PATH]).features[0].properties.snapshot).toEqual({ path: `site/annotations/${id}-3d.webp`, camera: { position: [1, 2, 3], target: [4, 5, 6] }, capturedAt: expect.any(String) });
    });
});

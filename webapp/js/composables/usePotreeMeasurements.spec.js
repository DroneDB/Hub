/**
 * The 3D viewer follows the same rules as the 2D map: Save makes the file match the viewer (also
 * with nothing left), Delete saved removes the viewer's measurements from the file and the viewer,
 * and the map's measurements in the same file are neither shown nor touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const flash = vi.fn();
vi.mock('@/composables/useMapAlerts', () => ({ flash: (...args) => flash(...args) }));
// The viewer's measures are plain objects here: the converter writes and reads them as features
vi.mock('@/libs/map/potreeMeasurementConverter', () => ({
    exportMeasurements: viewer => ({
        type: 'FeatureCollection',
        metadata: {},
        features: viewer.scene.measurements.map(m => ({ type: 'Feature', geometry: null,
            properties: { name: m.name, measurementType: 'distance', localCoordinates: [[0, 0, 0]] } }))
    }),
    importMeasurements: (geojson, viewer) => geojson.features.map(f => {
        const measure = { name: f.properties.name };
        viewer.scene.addMeasurement(measure);
        return measure;
    })
}));

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');

const PATH = 'a/cloud_measurements.geojson';
const mapFeature = name => ({ type: 'Feature', geometry: null, properties: { name, measurementType: 'length' } });
const viewerFeature = name => ({ type: 'Feature', geometry: null, properties: { name, measurementType: 'distance', localCoordinates: [[0, 0, 0]] } });

let stored;
let dataset;
let viewer;

// Listeners go through the session, as in the viewer; the scene fires Potree's events
const listeners = new Map();
const session = { track: (target, type, fn) => { listeners.set(`${target === viewer?.scene ? 'scene' : 'other'}:${type}`, fn); }, untrack: () => {} };
const fire = type => (listeners.get(`scene:${type}`) || (() => {}))();

function fakeViewer() {
    const scene = {
        measurements: [],
        annotations: { children: [], traverse(fn) { fn(this); this.children.forEach(fn); }, removeAllChildren() { this.children = []; } },
        addMeasurement(m) { this.measurements.push(m); fire('measurement_added'); },
        removeMeasurement(m) { this.measurements = this.measurements.filter(x => x !== m); fire('measurement_removed'); }
    };
    return { scene, renderer: { domElement: document.createElement('canvas') } };
}
const removeAll = () => [...viewer.scene.measurements].forEach(x => viewer.scene.removeMeasurement(x));

function start() {
    const m = usePotreeMeasurements({
        entry: ref({ path: 'a/cloud.laz' }), dataset: ref(dataset), canWrite: ref(true), error: ref(''), dialogs: { open: vi.fn() }
    });
    viewer = fakeViewer();
    m.attach(viewer, session, {});
    return m;
}
const inFile = () => (PATH in stored ? JSON.parse(stored[PATH]).features.map(f => f.properties.name) : null);

beforeEach(() => {
    flash.mockClear();
    stored = { [PATH]: JSON.stringify({ type: 'FeatureCollection', features: [mapFeature('m1'), viewerFeature('v1')] }) };
    dataset = {
        getFileContents: vi.fn(async path => {
            if (!(path in stored)) throw Object.assign(new Error('Not found'), { status: 404 });
            return stored[path];
        }),
        writeObj: vi.fn(async (path, blob) => { stored[path] = await blob.text(); }),
        deleteObj: vi.fn(async path => { delete stored[path]; })
    };
});

describe('usePotreeMeasurements', () => {
    it('loads only its own measurements', async () => {
        const m = start();
        await m.load();
        expect(viewer.scene.measurements.map(x => x.name)).toEqual(['v1']);
        expect(m.hasSavedMeasurements.value).toBe(true);
    });

    it('a save with every measurement deleted removes them from the file and keeps the map\'s', async () => {
        const m = start();
        await m.load();
        removeAll();
        expect(m.hasMeasurements.value).toBe(false);
        await m.save();
        expect(inFile()).toEqual(['m1']);
        expect(m.hasSavedMeasurements.value).toBe(false);
        expect(flash).toHaveBeenLastCalledWith('Removed the 3D viewer measurements from "cloud_measurements.geojson" (the 2D map ones stay)');
    });

    it('a save with nothing left removes the file when it held only the viewer\'s', async () => {
        stored[PATH] = JSON.stringify({ type: 'FeatureCollection', features: [viewerFeature('v1')] });
        const m = start();
        await m.load();
        removeAll();
        expect(m.hasMeasurements.value).toBe(false);
        await m.save();
        expect(inFile()).toBeNull();
    });

    it('Delete saved takes the measurements out of the file and the viewer', async () => {
        const m = start();
        await m.load();
        await m.onDeleteDialogClose('confirm');
        expect(inFile()).toEqual(['m1']);
        expect(viewer.scene.measurements).toEqual([]);
        expect(m.hasMeasurements.value).toBe(false);
        expect(m.hasSavedMeasurements.value).toBe(false);
    });

    it('a save writes its measurements next to the map\'s', async () => {
        const m = start();
        await m.load();
        viewer.scene.addMeasurement({ name: 'v2' });
        await m.save();
        expect(inFile()).toEqual(['v1', 'v2', 'm1']);
        expect(flash).toHaveBeenLastCalledWith('Saved 2 measurements to "cloud_measurements.geojson"');
    });
});

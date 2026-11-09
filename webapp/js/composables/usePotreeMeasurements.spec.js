/**
 * The 3D viewer follows the same rules as the 2D map: Save makes the file match the viewer (also
 * with nothing left), Delete saved removes the viewer's measurements from the file and the viewer,
 * and the map's measurements in the same file are neither shown nor touched.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { ref } from 'vue';

const flash = vi.fn();
vi.mock('@/composables/useMapAlerts', () => ({ flash: (...args) => flash(...args) }));
// The labels need Potree's sprites and a camera: what matters here is that a measure gets its label
const labels = vi.hoisted(() => ({ measureAt: null }));
vi.mock('@/libs/potree/measureLabels', () => ({
    measureAt: vi.fn((...args) => (labels.measureAt ? labels.measureAt(...args) : null)),
    annotationElement: () => null,
    updateNameLabel: vi.fn(),
    updateAnnotationTooltip: vi.fn()
}));
// The viewer's measures are plain objects here: the converter writes and reads them as features
vi.mock('@/libs/map/potreeMeasurementConverter', () => ({
    exportMeasurements: viewer => ({
        type: 'FeatureCollection',
        metadata: {},
        features: viewer.scene.measurements.map(m => ({ type: 'Feature', geometry: null,
            properties: { name: m.name, measurementType: 'distance', localCoordinates: [[0, 0, 0]] } }))
    }),
    importMeasurements: (geojson, viewer) => geojson.features.map(f => {
        const measure = { name: f.properties.name, points: [{ position: { x: 0, y: 0, z: 0 } }] };
        viewer.scene.addMeasurement(measure);
        return measure;
    })
}));

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');
const { updateNameLabel } = await import('@/libs/potree/measureLabels');

// Minimal stand-ins for the THREE / Potree globals the viewer loads: a restored measure is a new
// Potree.Measure, with Potree's defaults (maxMarkers has no limit)
class Color {
    constructor(hex = '#000000') { this.hex = String(hex).replace('#', ''); }
    getHexString() { return this.hex; }
    clone() { return new Color('#' + this.hex); }
}
class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
class Measure {
    constructor() {
        Object.assign(this, { restored: true, points: [], spheres: [], edges: [], children: [], maxMarkers: Number.MAX_SAFE_INTEGER });
        this.update = vi.fn();
    }
    addMarker({ position }) { this.points.push({ position }); this.spheres.push({ material: {} }); this.edges.push({ material: { linewidth: 2 } }); }
    traverse(fn) { fn(this); this.children.forEach(fn); }
}
beforeAll(() => {
    globalThis.THREE = { Color, Vector3 };
    globalThis.Potree = { Measure };
});
afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.Potree;
});

const PATH = 'a/cloud_measurements.geojson';
const mapFeature = name => ({ type: 'Feature', geometry: null, properties: { name, measurementType: 'length' } });
const viewerFeature = name => ({ type: 'Feature', geometry: null, properties: { name, measurementType: 'distance', localCoordinates: [[0, 0, 0]] } });

let stored;
let dataset;
let viewer;

// Listeners go through the session, as in the viewer; the scene fires Potree's events
const listeners = new Map();
const session = { track: (target, type, fn) => { listeners.set(`${target === viewer?.scene ? 'scene' : 'other'}:${type}`, fn); }, untrack: () => {} };
const fire = (type, event) => (listeners.get(`scene:${type}`) || (() => {}))(event);

function fakeViewer() {
    const scene = {
        measurements: [],
        annotations: { children: [], traverse(fn) { fn(this); this.children.forEach(fn); }, removeAllChildren() { this.children = []; } },
        addMeasurement(m) { this.measurements.push(m); fire('measurement_added', { measurement: m }); },
        // Potree only tells about a measure it had
        removeMeasurement(m) {
            if (!this.measurements.includes(m)) return;
            this.measurements = this.measurements.filter(x => x !== m);
            fire('measurement_removed', { measurement: m });
        }
    };
    const LengthUnits = { METER: { code: 'm', unitspermeter: 1 } };
    return { scene, renderer: { domElement: document.createElement('canvas') }, lengthUnit: LengthUnits.METER, lengthUnitDisplay: LengthUnits.METER };
}
const removeAll = () => [...viewer.scene.measurements].forEach(x => viewer.scene.removeMeasurement(x));

let dialogs;
function start() {
    dialogs = { open: vi.fn(() => ({ close: vi.fn() })) };
    const m = usePotreeMeasurements({
        entry: ref({ path: 'a/cloud.laz' }), dataset: ref(dataset), canWrite: ref(true), error: ref(''), dialogs
    });
    viewer = fakeViewer();
    m.attach(viewer, session, {});
    return m;
}
const inFile = () => (PATH in stored ? JSON.parse(stored[PATH]).features.map(f => f.properties.name) : null);

beforeEach(() => {
    flash.mockClear();
    updateNameLabel.mockClear();
    labels.measureAt = null;
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

    describe('undo and redo', () => {
        const pointsOf = (...xs) => xs.map(x => ({ position: { x, y: 0, z: 0 } }));
        // Potree adds the measure when the drawing starts, with one marker; the user clicks the others afterwards
        const startDrawing = name => {
            const measure = Object.assign(new Measure(), { name, restored: false, points: pointsOf(0), spheres: [{}], maxMarkers: 2 });
            viewer.scene.addMeasurement(measure);
            return measure;
        };
        const finishDrawing = (measure, ...xs) => { measure.points = pointsOf(0, ...xs); viewer.inputHandler = {}; };
        const keydown = (key, init = {}) => {
            const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init });
            listeners.get('other:keydown')(event);
            return event;
        };

        it('undoes an addition by removing the measure with the points it has by then, and redoes it', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            expect(m.canUndo.value).toBe(true);

            m.undo();
            expect(viewer.scene.measurements).toEqual([]);
            expect(m.canRedo.value).toBe(true);

            m.redo();
            expect(viewer.scene.measurements).toHaveLength(1);
            expect(viewer.scene.measurements[0].points.map(p => p.position.x)).toEqual([0, 5]);
            expect(viewer.scene.measurements[0].restored).toBe(true);
            expect(m.measurementCount.value).toBe(1);
        });

        it('undoes a deletion by adding the measure back, and redoes it by removing the copy', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            viewer.scene.removeMeasurement(measure);
            expect(viewer.scene.measurements).toEqual([]);

            m.undo();
            expect(viewer.scene.measurements.map(x => x.name)).toEqual(['d1']);
            expect(viewer.scene.measurements[0].points.map(p => p.position.x)).toEqual([0, 5]);

            m.redo();
            expect(viewer.scene.measurements).toEqual([]);
        });

        it('undoes an addition after a deletion and its undo (the measure is a copy by then)', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            viewer.scene.removeMeasurement(measure);
            m.undo();
            m.undo();
            expect(viewer.scene.measurements).toEqual([]);
            m.redo();
            m.redo();
            expect(viewer.scene.measurements).toEqual([]);
            expect(m.canRedo.value).toBe(false);
        });

        it('does nothing while a measure is still being drawn', () => {
            const m = start();
            const done = startDrawing('done');
            finishDrawing(done, 5);
            const drawing = startDrawing('drawing');
            viewer.inputHandler = { drag: { object: drawing.spheres[0] } };

            m.undo();
            expect(viewer.scene.measurements).toHaveLength(2);
            expect(m.canUndo.value).toBe(true);

            drawing.points = pointsOf(0, 3);
            m.undo();
            expect(viewer.scene.measurements.map(x => x.name)).toEqual(['done']);
        });

        it('puts a removal made by Potree itself in the history', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            m.undo();
            m.redo();
            const copy = viewer.scene.measurements[0];
            // Potree's own remove button calls scene.removeMeasurement directly
            viewer.scene.removeMeasurement(copy);
            expect(viewer.scene.measurements).toEqual([]);
            m.undo();
            expect(viewer.scene.measurements).toHaveLength(1);
        });

        it('keeps a drawing Potree takes back, and the loaded and cleared measures, out of the history', async () => {
            const m = start();
            const cancelled = startDrawing('cancelled');
            viewer.scene.removeMeasurement(cancelled);
            m.undo();
            expect(viewer.scene.measurements).toEqual([]);

            const loaded = start();
            await loaded.load();
            expect(loaded.canUndo.value).toBe(false);
            await loaded.onDeleteDialogClose('confirm');
            expect(loaded.canUndo.value).toBe(false);
            expect(loaded.canRedo.value).toBe(false);
        });

        it('a new action drops what was undone', () => {
            const m = start();
            const first = startDrawing('first');
            finishDrawing(first, 1);
            m.undo();
            const second = startDrawing('second');
            finishDrawing(second, 2);
            expect(m.canRedo.value).toBe(false);
        });

        it('Ctrl+Z undoes and Ctrl+Y redoes, not while typing', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);

            const event = keydown('z');
            expect(event.defaultPrevented).toBe(true);
            expect(viewer.scene.measurements).toEqual([]);

            // Typing in a field keeps the browser's own undo
            const input = document.createElement('input');
            const typing = { ctrlKey: true, key: 'y', target: input, preventDefault: vi.fn() };
            listeners.get('other:keydown')(typing);
            expect(typing.preventDefault).not.toHaveBeenCalled();
            expect(viewer.scene.measurements).toEqual([]);

            keydown('y');
            expect(viewer.scene.measurements).toHaveLength(1);
            expect(m.canUndo.value).toBe(true);
        });

        // The properties dialog opens on a double click on the measure (measureAt finds it)
        const editWith = (measure, properties) => {
            labels.measureAt = () => measure;
            listeners.get('other:dblclick')(new MouseEvent('dblclick'));
            dialogs.open.mock.calls.at(-1)[1].onSave(properties);
        };
        const style = { name: 'Fence', description: 'North side', stroke: '#00ff00', 'stroke-width': 4, 'stroke-opacity': 0.5, fill: '#0000ff', 'fill-opacity': 0.6 };
        const expectStyled = measure => {
            expect(measure.name).toBe('Fence');
            expect(measure.description).toBe('North side');
            expect(measure.color.getHexString()).toBe('00ff00');
            expect(measure.strokeWidth).toBe(4);
            expect(measure.strokeOpacity).toBe(0.5);
            expect(measure.fillColor.getHexString()).toBe('0000ff');
            expect(measure.fillOpacity).toBe(0.6);
        };

        it('keeps the description and the look of an edited measure through Ctrl+Z and Ctrl+Y', () => {
            start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            editWith(measure, style);
            expectStyled(measure);

            keydown('z');
            expect(viewer.scene.measurements).toEqual([]);
            keydown('y');
            const copy = viewer.scene.measurements[0];
            expect(copy.restored).toBe(true);
            expectStyled(copy);
            // As a loaded measure: the viewer's units, its geometry, its look on every part and its label
            expect(copy.lengthUnit).toBe(viewer.lengthUnit);
            expect(copy.lengthUnitDisplay).toBe(viewer.lengthUnitDisplay);
            expect(copy.update).toHaveBeenCalled();
            expect(copy.edges[0].material.linewidth).toBe(4);
            expect(copy.spheres[0].material.color.getHexString()).toBe('00ff00');
            expect(updateNameLabel).toHaveBeenCalledWith(copy, expect.anything());
        });

        it('keeps the description and the look of a deleted measure brought back by undo', () => {
            const m = start();
            const measure = startDrawing('d1');
            finishDrawing(measure, 5);
            editWith(measure, style);
            viewer.scene.removeMeasurement(measure);
            m.undo();
            expectStyled(viewer.scene.measurements[0]);
        });

        it('a point measure deleted, brought back and deleted again can be undone again (its maxMarkers is kept)', () => {
            const m = start();
            const point = { name: 'p1', points: pointsOf(7), spheres: [{}], maxMarkers: 1 };
            viewer.scene.addMeasurement(point);
            viewer.scene.removeMeasurement(point);
            m.undo();
            const copy = viewer.scene.measurements[0];
            expect(copy.maxMarkers).toBe(1);

            viewer.scene.removeMeasurement(copy);
            expect(viewer.scene.measurements).toEqual([]);
            m.undo();
            expect(viewer.scene.measurements.map(x => x.points.map(p => p.position.x))).toEqual([[7]]);
        });

        it('a double click while a measure is drawn ends it: no properties dialog', () => {
            start();
            const drawing = startDrawing('drawing');
            viewer.inputHandler = { drag: { object: drawing.spheres[0] } };
            labels.measureAt = () => drawing;
            listeners.get('other:dblclick')(new MouseEvent('dblclick'));
            expect(dialogs.open).not.toHaveBeenCalled();

            finishDrawing(drawing, 3);
            listeners.get('other:dblclick')(new MouseEvent('dblclick'));
            expect(dialogs.open).toHaveBeenCalledTimes(1);
        });
    });
});

/**
 * "Capture for report": the item is framed, a frame is drawn and copied in the same task, the WebP is written to
 * <folder>/annotations/<id>-3d.webp over any earlier one, and the item stores the snapshot that the next Save writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';
import { annotationProperties } from '@/libs/map/annotationIds';
import { captureForReport, cameraOf, readFrame, settle, CAPTURE_MAX_SIDE } from './captureForReport';

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    toArray() { return [this.x, this.y, this.z]; }
}
class Box3 {
    constructor() { this.min = new Vector3(Infinity, Infinity, Infinity); this.max = new Vector3(-Infinity, -Infinity, -Infinity); }
    setFromPoints(points) { for (const p of points) for (const a of ['x', 'y', 'z']) { this.min[a] = Math.min(this.min[a], p[a]); this.max[a] = Math.max(this.max[a], p[a]); } return this; }
    isEmpty() { return this.max.x < this.min.x; }
    getSize(target) { return Object.assign(target, { x: this.max.x - this.min.x, y: this.max.y - this.min.y, z: this.max.z - this.min.z }); }
    expandByScalar(s) { for (const a of ['x', 'y', 'z']) { this.min[a] -= s; this.max[a] += s; } return this; }
}
class Object3D {}

const events = [];
function viewerOf({ width = 3200, height = 2000 } = {}) {
    const view = { position: new Vector3(1, 2, 3), getPivot: () => new Vector3(4, 5, 6) };
    const domElement = { width, height };
    return {
        scene: { view },
        renderer: { domElement },
        zoomTo: vi.fn(() => events.push('zoom')),
        render: vi.fn(() => events.push('render'))
    };
}
const measure = id => ({ [PROPERTY_BAG]: { id }, points: [{ position: new Vector3(0, 0, 0) }, { position: new Vector3(2, 0, 0) }] });
const annotation = id => ({ [PROPERTY_BAG]: { id }, position: new Vector3(1, 1, 1) });

let draws;
beforeEach(() => {
    events.length = 0;
    draws = [];
    vi.stubGlobal('THREE', { Box3, Vector3, Object3D });
    const ctx = { fillRect() {}, drawImage: (...args) => { events.push('copy'); draws.push(args); }, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) { events.push('encode'); callback(new Blob([`${this.width}x${this.height}`], { type: 'image/webp' })); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const dataset = () => ({ writeObj: vi.fn(async () => ({})) });
const wait = async () => { events.push('wait'); };

describe('captureForReport', () => {
    it('frames the item, writes the image to <folder>/annotations/<id>-3d.webp over an earlier one, and stores the snapshot', async () => {
        const viewer = viewerOf();
        const item = measure('id-1');
        const ds = dataset();
        const snapshot = await captureForReport({ viewer, item, dataset: ds, measurementPath: 'site/cloud_measurements.geojson', wait });
        expect(viewer.zoomTo).toHaveBeenCalledWith(expect.any(Object3D), 2, 0);
        expect(ds.writeObj).toHaveBeenCalledTimes(1);
        const [path, blob, options] = ds.writeObj.mock.calls[0];
        expect(path).toBe('site/annotations/id-1-3d.webp');
        expect(blob).toBeInstanceOf(Blob);
        expect(options).toEqual({ overwrite: true });
        expect(snapshot).toEqual({ path: 'site/annotations/id-1-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] } });
        expect(item[PROPERTY_BAG].snapshot).toEqual(snapshot);
    });

    it('leaves the snapshot in the property bag that the next Save writes to the file, and a recapture writes the same path', async () => {
        const item = annotation('id-2');
        const ds = dataset();
        await captureForReport({ viewer: viewerOf(), item, dataset: ds, measurementPath: 'm.geojson', wait });
        await captureForReport({ viewer: viewerOf(), item, dataset: ds, measurementPath: 'm.geojson', wait });
        expect(ds.writeObj.mock.calls.map(c => c[0])).toEqual(['annotations/id-2-3d.webp', 'annotations/id-2-3d.webp']);
        // The bag is what the converter writes (the keys of an annotation include the snapshot) and what an undo copies
        expect(annotationProperties(item[PROPERTY_BAG]).snapshot).toEqual({ path: 'annotations/id-2-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] } });
        expect(JSON.parse(JSON.stringify(item[PROPERTY_BAG])).snapshot.path).toBe('annotations/id-2-3d.webp');
    });

    it('reads the canvas in the same task as it renders: nothing is awaited between the render and the copy', async () => {
        await captureForReport({ viewer: viewerOf(), item: measure('x'), dataset: dataset(), measurementPath: 'm.geojson', wait });
        expect(events).toEqual(['zoom', 'wait', 'render', 'copy', 'encode']);
    });

    it('gives an item that has no id one, once, and uses it', async () => {
        const item = { position: new Vector3(1, 1, 1) };
        const ds = dataset();
        await captureForReport({ viewer: viewerOf(), item, dataset: ds, measurementPath: 'm.geojson', wait });
        expect(item[PROPERTY_BAG].id).toBeTruthy();
        expect(ds.writeObj.mock.calls[0][0]).toBe(`annotations/${item[PROPERTY_BAG].id}-3d.webp`);
    });

    it('does not store the snapshot when the write fails, and says why', async () => {
        const item = measure('id-3');
        const ds = { writeObj: vi.fn(async () => { throw new Error('Forbidden'); }) };
        await expect(captureForReport({ viewer: viewerOf(), item, dataset: ds, measurementPath: 'm.geojson', wait })).rejects.toThrow('Forbidden');
        expect(item[PROPERTY_BAG].snapshot).toBeUndefined();
    });

    it('refuses an item with no position to frame', async () => {
        const item = { [PROPERTY_BAG]: { id: 'e' }, points: [] };
        await expect(captureForReport({ viewer: viewerOf(), item, dataset: dataset(), measurementPath: 'm.geojson', wait })).rejects.toThrow('no position');
    });
});

describe('readFrame', () => {
    it('copies the frame at most CAPTURE_MAX_SIDE on the long side', () => {
        const copy = readFrame(viewerOf({ width: 3200, height: 2000 }));
        expect(copy.width).toBe(CAPTURE_MAX_SIDE);
        expect(copy.height).toBe(1000);
        expect(readFrame(viewerOf({ width: 800, height: 600 })).width).toBe(800);
    });

    it('refuses a view with no size', () => {
        expect(() => readFrame(viewerOf({ width: 0, height: 0 }))).toThrow('no size');
    });
});

describe('cameraOf', () => {
    it('is the position of the view and the point it looks at', () => {
        expect(cameraOf(viewerOf())).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    });
});

describe('settle', () => {
    it('waits for a run of frames with no node loading, and starts again when one loads', async () => {
        const loads = [0, 0, 3, 0, 0, 0];
        let frames = 0;
        await settle({ frames: 3, loading: () => loads[frames - 1] ?? 0, frame: async () => { frames++; }, now: () => 0 });
        expect(frames).toBe(6);
    });

    it('gives up after the timeout and captures what the cloud has', async () => {
        let t = 0;
        await settle({ frames: 3, timeoutMs: 100, loading: () => 5, frame: async () => { t += 40; }, now: () => t });
        expect(t).toBe(120);
    });
});

/**
 * Finding and framing an annotation of the point cloud viewer by its id (`?item=`): a measure by the box of its points, an
 * annotation by Potree's own move to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';
import { CAPTURE_FRAMING, findItem, focusItem, frameItemNow } from './itemFocus';

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    length() { return Math.hypot(this.x, this.y, this.z); }
}
class Box3 {
    constructor() { this.min = new Vector3(Infinity, Infinity, Infinity); this.max = new Vector3(-Infinity, -Infinity, -Infinity); }
    setFromPoints(points) {
        for (const p of points) {
            for (const axis of ['x', 'y', 'z']) {
                this.min[axis] = Math.min(this.min[axis], p[axis]);
                this.max[axis] = Math.max(this.max[axis], p[axis]);
            }
        }
        return this;
    }
    isEmpty() { return this.max.x < this.min.x; }
    getSize(target) { return Object.assign(target, { x: this.max.x - this.min.x, y: this.max.y - this.min.y, z: this.max.z - this.min.z }); }
    expandByScalar(s) { for (const axis of ['x', 'y', 'z']) { this.min[axis] -= s; this.max[axis] += s; } return this; }
}
class Object3D {}

const measure = (id, ...points) => ({ [PROPERTY_BAG]: { id }, points: points.map(([x, y, z]) => ({ position: new Vector3(x, y, z) })) });
const note = id => ({ [PROPERTY_BAG]: { id }, position: new Vector3(1, 2, 3), moveHere: vi.fn() });

let viewer;
beforeEach(() => {
    vi.stubGlobal('THREE', { Box3, Vector3, Object3D });
});
afterEach(() => vi.unstubAllGlobals());

function viewerOf(measurements, annotations) {
    return {
        scene: {
            measurements,
            annotations: { traverse: fn => { fn({}); annotations.forEach(fn); } },
            getActiveCamera: () => 'camera'
        },
        zoomTo: vi.fn()
    };
}

describe('findItem', () => {
    it('finds a measure and an annotation by the id in their property bag', () => {
        const a = measure('m1', [0, 0, 0], [1, 1, 1]);
        const b = note('n1');
        viewer = viewerOf([a], [b]);
        expect(findItem(viewer, 'm1')).toBe(a);
        expect(findItem(viewer, 'n1')).toBe(b);
    });

    it('is null for an id that nothing has, and for objects with no bag', () => {
        viewer = viewerOf([{ points: [] }], [{ position: new Vector3() }]);
        expect(findItem(viewer, 'gone')).toBeNull();
    });
});

describe('focusItem', () => {
    it('zooms to the box of the points of a measure', () => {
        viewer = viewerOf([measure('m1', [0, 0, 0], [10, 0, 0])], []);
        expect(focusItem(viewer, 'm1')).toBe(true);
        const [node, factor, duration] = viewer.zoomTo.mock.calls[0];
        expect(node).toBeInstanceOf(Object3D);
        expect(node.boundingBox.max.x).toBe(10);
        expect(factor).toBe(2);
        expect(duration).toBe(500);
    });

    it('gives a lone point some room around it', () => {
        viewer = viewerOf([measure('m1', [5, 5, 5])], []);
        expect(focusItem(viewer, 'm1')).toBe(true);
        const box = viewer.zoomTo.mock.calls[0][0].boundingBox;
        expect(box.max.x - box.min.x).toBe(10);
    });

    it('moves the camera to an annotation the way Potree does', () => {
        const annotation = note('n1');
        viewer = viewerOf([], [annotation]);
        expect(focusItem(viewer, 'n1')).toBe(true);
        expect(annotation.moveHere).toHaveBeenCalledWith('camera');
        expect(viewer.zoomTo).not.toHaveBeenCalled();
    });

    it('is false when the viewer has no item with the id', () => {
        viewer = viewerOf([measure('m1', [0, 0, 0], [1, 1, 1])], []);
        expect(focusItem(viewer, 'gone')).toBe(false);
        expect(viewer.zoomTo).not.toHaveBeenCalled();
    });
});

describe('frameItemNow (the capture for a report)', () => {
    it('frames a lone point close, at once: a box of 4 units around it, with little room', () => {
        const point = measure('m1', [5, 5, 5]);
        viewer = viewerOf([point], []);
        expect(frameItemNow(viewer, point)).toBe(true);
        const [node, factor, duration] = viewer.zoomTo.mock.calls[0];
        expect(node.boundingBox.max.x - node.boundingBox.min.x).toBe(2 * CAPTURE_FRAMING.pointMargin);
        expect(node.boundingBox.min.x).toBe(3);
        expect(factor).toBe(CAPTURE_FRAMING.zoom);
        expect(duration).toBe(0);
        // Potree stands the camera radius / sin(fov / 2) x the factor away: a 60° view is about 8 units from the point,
        // where a link's framing (a 10 unit box, twice as far) is about 35
        const distance = (radius, zoom) => (radius / Math.sin(Math.PI / 6)) * zoom;
        expect(distance(Math.sqrt(3) * CAPTURE_FRAMING.pointMargin, CAPTURE_FRAMING.zoom)).toBeLessThan(9);
        expect(distance(Math.sqrt(3) * 5, 2)).toBeGreaterThan(34);
    });

    it('frames a measure on the box of its points and an annotation around its position', () => {
        const line = measure('m1', [0, 0, 0], [10, 0, 0]);
        const annotation = note('n1');
        annotation.position = new Vector3(1, 2, 3);
        viewer = viewerOf([line], [annotation]);
        expect(frameItemNow(viewer, line)).toBe(true);
        expect(viewer.zoomTo.mock.calls[0][0].boundingBox.max.x).toBe(10);
        expect(frameItemNow(viewer, annotation)).toBe(true);
        expect(viewer.zoomTo.mock.calls[1][0].boundingBox.min.x).toBe(1 - CAPTURE_FRAMING.pointMargin);
    });

    it('is false for an item with no position', () => {
        viewer = viewerOf([], []);
        expect(frameItemNow(viewer, { points: [] })).toBe(false);
        expect(viewer.zoomTo).not.toHaveBeenCalled();
    });
});

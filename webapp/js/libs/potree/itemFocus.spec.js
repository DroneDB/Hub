/**
 * Finding and framing an annotation of the point cloud viewer by its id (`?item=`): a measure by the box of its points, an
 * annotation by Potree's own move to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';
import { findItem, focusItem } from './itemFocus';

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
        expect(box.max.x - box.min.x).toBeGreaterThan(0);
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

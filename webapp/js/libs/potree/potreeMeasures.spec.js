import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { snapshotMeasure, restoreMeasure, matchesSnapshot } from './measureSnapshot';
import { applyMeasureStyle, measureAsFeature, assignMeasureProperties } from './measureStyle';
import { updateAnnotationTooltip } from './measureLabels';

// Minimal stand-ins for the THREE / Potree globals the viewer loads
class Color {
    constructor(hex = '#000000') { this.hex = hex.replace('#', ''); }
    getHexString() { return this.hex; }
    clone() { return new Color('#' + this.hex); }
}
class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
class Measure {
    constructor() { this.points = []; this.children = []; }
    addMarker({ position }) { this.points.push({ position }); }
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

function measure(points, props = {}) {
    const m = new Measure();
    points.forEach(([x, y, z]) => m.addMarker({ position: new Vector3(x, y, z) }));
    return Object.assign(m, props);
}

describe('measure snapshots', () => {
    it('restore what was deleted and find it again', () => {
        const original = measure([[1, 2, 3], [4, 5, 6]], { name: 'Fence', color: new Color('#ff0000'), showArea: false });
        const data = snapshotMeasure(original);
        const restored = restoreMeasure(data);
        expect(restored.name).toBe('Fence');
        expect(restored.color.getHexString()).toBe('ff0000');
        expect(restored.showDistances).toBe(true);
        expect(matchesSnapshot(restored, data)).toBe(true);
        expect(matchesSnapshot(measure([[1, 2, 3], [4, 5, 7]]), data)).toBe(false);
    });
});

describe('measure style', () => {
    it('round-trips the properties dialog and paints every line', () => {
        const line = { isLine2: true, material: { linewidth: 1 } };
        const sphere = { material: {} };
        const m = measure([[0, 0, 0], [1, 1, 1]], { spheres: [sphere], edges: [{ material: { linewidth: 1 } }] });
        m.children.push(line);
        assignMeasureProperties(m, { name: 'A', stroke: '#00ff00', 'stroke-width': 4 });
        applyMeasureStyle(m);
        expect(line.material.color.getHexString()).toBe('00ff00');
        expect(line.material.linewidth).toBe(4);
        expect(m.edges[0].material.linewidth).toBe(4);
        expect(sphere.material.color.getHexString()).toBe('00ff00');
        const feature = measureAsFeature(m);
        expect(feature.get('name')).toBe('A');
        expect(feature.get('stroke')).toBe('#00ff00');
        expect(feature.get('unknown')).toBeNull();
    });
});

describe('annotation tooltip', () => {
    it('shows the description as text, not markup', () => {
        const tracked = [];
        const session = { adopt: n => n, track: (...a) => tracked.push(a), untrack: () => {} };
        const el = document.createElement('div');
        const annotation = { domElement: el, description: '<img src=x onerror="alert(1)">' };
        updateAnnotationTooltip(annotation, { session });
        expect(annotation._descriptionTooltip.querySelector('img')).toBeNull();
        expect(annotation._descriptionTooltip.textContent).toBe('<img src=x onerror="alert(1)">');
        updateAnnotationTooltip(annotation, { session });
        expect(document.querySelectorAll('.potree-annotation-tooltip').length).toBe(1);
        annotation._descriptionTooltip.remove();
    });
});

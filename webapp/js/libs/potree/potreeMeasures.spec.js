import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { snapshotMeasure, restoreMeasure, matchesSnapshot } from './measureSnapshot';
import { applyMeasureStyle, measureAsFeature, assignMeasureProperties, annotationFieldsOf } from './measureStyle';
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

    it('keep the description, the look of the properties dialog, the kind and the units', () => {
        const meter = { code: 'm', unitspermeter: 1 };
        const original = measure([[1, 2, 3]], { name: 'Pole', maxMarkers: 1, showCoordinates: true, showAzimuth: true, lengthUnit: meter });
        assignMeasureProperties(original, {
            description: 'Top of the pole', stroke: '#00ff00', 'stroke-width': 4, 'stroke-opacity': 0.5, fill: '#0000ff', 'fill-opacity': 0.6
        });
        const restored = restoreMeasure(snapshotMeasure(original));
        expect(restored).not.toBe(original);
        expect(restored.description).toBe('Top of the pole');
        expect(restored.color.getHexString()).toBe('00ff00');
        expect(restored.strokeWidth).toBe(4);
        expect(restored.strokeOpacity).toBe(0.5);
        expect(restored.fillColor.getHexString()).toBe('0000ff');
        expect(restored.fillOpacity).toBe(0.6);
        expect(restored.maxMarkers).toBe(1);
        expect(restored.showCoordinates).toBe(true);
        expect(restored.showAzimuth).toBe(true);
        expect(restored.lengthUnit).toBe(meter);
    });

    it('keep the id, the ref, the fields and the properties of the file that the viewer does not know: undo brings back the same feature', () => {
        const original = measure([[1, 2, 3], [4, 5, 6]], { name: 'Fence' });
        original.ddbProperties = {
            id: 'stable-id', ref: '7', category: 'defect', status: 'open', report: false, createdAt: '2026-01-01T00:00:00.000Z',
            photos: [{ path: 'a.jpg', source: 'dataset' }], extra: { customKey: 5 }
        };
        const data = snapshotMeasure(original);
        // The measure is edited after the copy was taken: the copy does not follow
        original.ddbProperties.ref = '9';
        original.ddbProperties.extra.customKey = 6;
        const restored = restoreMeasure(data);
        expect(restored.ddbProperties).toEqual({
            id: 'stable-id', ref: '7', category: 'defect', status: 'open', report: false, createdAt: '2026-01-01T00:00:00.000Z',
            photos: [{ path: 'a.jpg', source: 'dataset' }], extra: { customKey: 5 }
        });
        expect(restored.ddbProperties).not.toBe(data.properties);
        // A measure made in the viewer has none yet: nothing is made up
        expect(restoreMeasure(snapshotMeasure(measure([[0, 0, 0]]))).ddbProperties).toBeUndefined();
    });

    it('leave what the measure did not have to Potree\'s defaults', () => {
        const restored = restoreMeasure(snapshotMeasure(measure([[0, 0, 0], [1, 0, 0]], { name: 'Plain' })));
        expect(restored.description).toBeUndefined();
        expect(restored.fillColor).toBeUndefined();
        expect(restored.maxMarkers).toBeUndefined();
        expect(restored.showAzimuth).toBe(false);
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

describe('the annotation fields of a measure', () => {
    it('are shown to the properties dialog as a feature has them, and set from what it saves, a missing value removing the field', () => {
        const m = measure([[0, 0, 0], [1, 1, 1]], { name: 'A' });
        m.ddbProperties = { id: 'i', ref: '3', category: 'defect', assignee: 'Anna', extra: { customKey: 5 } };
        const feature = measureAsFeature(m);
        expect(feature.get('ref')).toBe('3');
        expect(feature.get('category')).toBe('defect');
        expect(feature.get('status')).toBeNull();
        expect(annotationFieldsOf(m)).toEqual({ ref: '3', category: 'defect', assignee: 'Anna' });

        assignMeasureProperties(m, { name: 'B', category: undefined, status: 'open', report: false, dueDate: '2026-12-01' });
        expect(m.ddbProperties).toEqual({ id: 'i', ref: '3', assignee: 'Anna', status: 'open', report: false, dueDate: '2026-12-01', extra: { customKey: 5 } });
    });

    it('make the id of a measure that has no properties yet, and keep it', () => {
        const m = measure([[0, 0, 0]], { name: 'New' });
        assignMeasureProperties(m, { status: 'open' });
        const { id } = m.ddbProperties;
        expect(id).toBeTruthy();
        assignMeasureProperties(m, { status: 'resolved' });
        expect(m.ddbProperties.id).toBe(id);
    });
});

describe('annotation tooltip', () => {
    it('shows the description as text, not markup', () => {
        const tracked = [];
        const session = { adopt: n => n, track: (...a) => tracked.push(a), untrack: () => {} };
        const el = document.createElement('div');
        // Potree holds the description as HTML: the escaped text that the converter gives it
        const annotation = { domElement: el, description: '&lt;img src=x onerror="alert(1)"&gt;' };
        updateAnnotationTooltip(annotation, { session });
        expect(annotation._descriptionTooltip.querySelector('img')).toBeNull();
        expect(annotation._descriptionTooltip.textContent).toBe('<img src=x onerror="alert(1)">');
        updateAnnotationTooltip(annotation, { session });
        expect(document.querySelectorAll('.potree-annotation-tooltip').length).toBe(1);
        annotation._descriptionTooltip.remove();
    });

    it('is made from the text of the HTML description, so a tag in it is never an element', () => {
        const session = { adopt: n => n, track: () => {}, untrack: () => {} };
        const annotation = { domElement: document.createElement('div'), description: 'a<br>b <img src=x onerror="alert(1)">' };
        updateAnnotationTooltip(annotation, { session });
        expect(annotation._descriptionTooltip.querySelector('img')).toBeNull();
        expect(annotation._descriptionTooltip.querySelectorAll('br')).toHaveLength(1);
        expect(annotation._descriptionTooltip.textContent).toBe('ab ');
        annotation._descriptionTooltip.remove();
    });
});

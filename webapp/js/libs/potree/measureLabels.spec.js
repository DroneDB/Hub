/**
 * The label of a 3D measure (updateItemLabel) with the real Potree: a point with a name, a category, a severity or a
 * description shows them above it instead of its coordinates, at the screen size of Potree's labels; a point with none
 * of them keeps its coordinates; a label follows a new schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { loadPotree } from './potreeLibs.fixtures';
import { updateItemLabel } from './measureLabels';
import { ensureProperties } from '@/libs/map/potreeMeasurementConverter';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportDefaults';

// The sprites draw their text on a canvas: a context that takes everything and draws nothing
const context2d = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 40 }) : () => {}),
    set: (target, key, value) => { target[key] = value; return true; }
});

let Potree;
beforeAll(() => {
    Potree = loadPotree();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === '2d' ? context2d : original.call(this, type, ...args); };
});

/** A viewer with a camera 50 units above the origin and a 1000 x 800 view, and the session's update listeners */
function setup() {
    const THREE = globalThis.THREE;
    const camera = new THREE.PerspectiveCamera(60, 1000 / 800, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const dom = document.createElement('canvas');
    Object.defineProperty(dom, 'clientWidth', { value: 1000 });
    Object.defineProperty(dom, 'clientHeight', { value: 800 });
    const updates = [];
    const viewer = { scene: { getActiveCamera: () => camera }, renderer: { domElement: dom } };
    const session = {
        track: vi.fn((target, type, fn) => { if (type === 'update') updates.push(fn); }),
        untrack: vi.fn((target, type, fn) => { if (updates.includes(fn)) updates.splice(updates.indexOf(fn), 1); }),
        adopt: el => el
    };
    return { camera, viewer, session, frame: () => updates.forEach(fn => fn()) };
}

function point(props = {}) {
    const measure = new Potree.Measure();
    measure.showCoordinates = true;
    measure.maxMarkers = 1;
    measure.addMarker(new globalThis.THREE.Vector3(0, 0, 0));
    Object.assign(measure, props);
    measure.update();
    return measure;
}

describe('updateItemLabel', () => {
    it('shows the name, the category and severity and the description of a point above it, in place of its coordinates', () => {
        const { viewer, session, frame, camera } = setup();
        const measure = point({ name: 'Crepa', description: 'Crack in the roof' });
        Object.assign(ensureProperties(measure), { category: 'defect', severity: 'high' });

        updateItemLabel(measure, { viewer, session, schema: () => DEFAULT_SCHEMA });
        // Potree's update shows the coordinates again at each frame: the label's handler, after it, hides them
        measure.update();
        expect(measure.coordinateLabels[0].visible).toBe(true);
        frame();

        expect(measure._itemLabel.lines.map(line => line.text)).toEqual(['Crepa', 'Defect · High', 'Crack in the roof']);
        expect(measure.coordinateLabels[0].visible).toBe(false);
        // Above the point on the screen, its bottom edge 12 px over it
        const screen = measure._itemLabel.position.clone().project(camera);
        expect(screen.x).toBeCloseTo(0, 5);
        expect(((screen.y * 800) / 2)).toBeCloseTo(12, 3);
        expect(measure._itemLabel.sprite.center.y).toBe(0);
        // The screen size of Potree's labels: 70 / (px per unit at its distance), times the factor of an 800 px view (1)
        const distance = camera.position.distanceTo(measure._itemLabel.position);
        const pxPerUnit = 800 / (2 * Math.tan(Math.PI / 6) * distance);
        expect(measure._itemLabel.scale.x).toBeCloseTo(70 / pxPerUnit, 6);
    });

    it('leaves a point with no name, inspection field or description to its coordinates', () => {
        const { viewer, session, frame } = setup();
        const measure = point({ name: '' });

        updateItemLabel(measure, { viewer, session, schema: () => DEFAULT_SCHEMA });
        frame();

        expect(measure._itemLabel).toBeNull();
        expect(measure.coordinateLabels[0].visible).toBe(true);
    });

    it('is drawn again with a new schema, and the old label and its listener go', () => {
        const { viewer, session } = setup();
        const measure = point({ name: '' });
        ensureProperties(measure).severity = 'urgent';

        updateItemLabel(measure, { viewer, session, schema: () => DEFAULT_SCHEMA });
        const first = measure._itemLabel;
        expect(first.lines).toEqual([{ text: 'Unknown (urgent)', kind: 'fields' }]);

        const schema = { ...DEFAULT_SCHEMA, severities: [{ id: 'urgent', name: 'Urgent', colour: '#ff0000' }] };
        updateItemLabel(measure, { viewer, session, schema: () => schema });

        expect(measure._itemLabel.lines).toEqual([{ text: 'Urgent', kind: 'fields', colour: '#ff0000' }]);
        expect(measure.children).not.toContain(first);
        expect(session.untrack).toHaveBeenCalledWith(viewer, 'update', expect.any(Function));
    });
});

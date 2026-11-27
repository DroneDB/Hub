/**
 * The label of a 3D measure (updateItemLabel) with the real Potree: a point with a name, a category, a severity or a
 * description shows them above it instead of its coordinates, at the screen size of Potree's labels; a point with none
 * of them keeps its coordinates; a label follows a new schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { loadPotree } from './potreeLibs.fixtures';
import { updateItemLabel, measureAt, hideTooltips } from './measureLabels';
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

describe('measureAt', () => {
    /** The setup's viewer with these measures, its canvas at the top left of the page, and a pointer at (x, y) CSS px */
    function scene(...measures) {
        const ctx = setup();
        ctx.viewer.scene.measurements = measures;
        ctx.viewer.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
        const at = (clientX, clientY) => measureAt(ctx.viewer, { clientX, clientY });
        const place = () => { ctx.frame(); measures.forEach(m => m.updateMatrixWorld(true)); };
        return { ...ctx, at, place };
    }
    /** Where a world position is on the screen, in CSS px */
    const onScreen = (camera, position) => {
        const p = position.clone().project(camera);
        return { x: ((p.x + 1) / 2) * 1000, y: ((1 - p.y) / 2) * 800 };
    };

    it('finds a measure by its label, the card a user points at, and not by an empty place', () => {
        const measure = point({ name: 'Pickup truck: height', description: 'Accuracy check' });
        const { viewer, session, camera, at, place } = scene(measure);
        updateItemLabel(measure, { viewer, session, schema: () => DEFAULT_SCHEMA });
        place();
        // The card stands above the point: its bottom edge 12 px over it, so 8 px further up is inside it
        const label = onScreen(camera, measure._itemLabel.position);
        expect(at(label.x, label.y - 8)).toBe(measure);
        expect(at(label.x + 5, label.y - 8)).toBe(measure);
        expect(at(100, 100)).toBeNull();
    });

    it('finds a measure by one of its marker spheres', () => {
        const measure = point({ name: '' });
        const { at, place } = scene(measure);
        place();
        expect(measure._itemLabel).toBeUndefined();
        expect(at(500, 400)).toBe(measure);
    });

    it('does not find a hidden measure, by its label or its spheres', () => {
        const measure = point({ name: 'Hidden' });
        const { viewer, session, camera, at, place } = scene(measure);
        updateItemLabel(measure, { viewer, session, schema: () => DEFAULT_SCHEMA });
        place();
        measure.visible = false;
        const label = onScreen(camera, measure._itemLabel.position);
        expect(at(label.x, label.y - 8)).toBeNull();
        expect(at(500, 400)).toBeNull();
    });

    it('finds the nearer of two measures under the pointer, whichever comes first in the scene', () => {
        const far = point({ name: '' });
        const near = point({ name: '' });
        near.points[0].position.set(0, 0, 10);
        near.spheres[0].position.set(0, 0, 10);
        const { at, place } = scene(far, near);
        place();
        expect(at(500, 400)).toBe(near);
        expect(scene(near, far).at(500, 400)).toBe(near);
    });
});

describe('hideTooltips', () => {
    it('hides the shown description tooltips of the measures and the annotations, and leaves those without one alone', () => {
        const { viewer, session } = setup();
        const described = point({ name: 'Crepa', description: 'Crack in the roof' });
        const bare = point({ name: 'No description' });
        updateItemLabel(described, { viewer, session, schema: () => DEFAULT_SCHEMA });
        updateItemLabel(bare, { viewer, session, schema: () => DEFAULT_SCHEMA });
        expect(bare._itemLabelTooltip).toBeFalsy();
        described._itemLabelTooltip.style.display = 'block';
        const annotationTooltip = document.createElement('div');
        annotationTooltip.style.display = 'block';
        const annotations = [{}, { _descriptionTooltip: annotationTooltip }];
        viewer.scene.measurements = [described, bare];
        viewer.scene.annotations = { traverse: fn => annotations.forEach(fn) };

        hideTooltips(viewer);

        expect(described._itemLabelTooltip.style.display).toBe('none');
        expect(annotationTooltip.style.display).toBe('none');
    });
});

describe('updateItemLabel places the label above the value of its measure', () => {
    /** A measure of the real Potree through these points, with these options, and its values updated */
    function measureOf(points, options) {
        const measure = new Potree.Measure();
        Object.assign(measure, { name: 'Dry beach width', description: 'Vegetation edge to the wet/dry line.' }, options);
        points.forEach(([x, y, z]) => measure.addMarker(new globalThis.THREE.Vector3(x, y, z)));
        measure.update();
        return measure;
    }
    /** Potree's measuring tool sizes its labels at each frame (70 over the px of one unit at their distance) */
    function sizeLikePotree(measure, camera) {
        const labels = [...measure.edgeLabels, ...measure.angleLabels, measure.heightLabel, measure.areaLabel, measure.circleRadiusLabel];
        for (const label of labels) {
            const pxPerUnit = 800 / (2 * Math.tan(Math.PI / 6) * camera.position.distanceTo(label.position));
            const scale = 70 / pxPerUnit;
            label.scale.set(scale, scale, scale);
        }
    }
    /** The screen box of a label, in CSS px from the top left of the 1000 x 800 view (its sprite's center is its anchor) */
    function boxOf(label, camera) {
        const p = label.position.clone().project(camera);
        const x = ((p.x + 1) / 2) * 1000;
        const y = ((1 - p.y) / 2) * 800;
        const pxPerUnit = 800 / (2 * Math.tan(Math.PI / 6) * camera.position.distanceTo(label.position));
        const width = label.sprite.scale.x * label.scale.x * pxPerUnit;
        const height = label.sprite.scale.y * label.scale.y * pxPerUnit;
        const { x: cx, y: cy } = label.sprite.center;
        return { left: x - cx * width, right: x + (1 - cx) * width, top: y - (1 - cy) * height, bottom: y + cy * height };
    }
    /** Places the labels as a frame does, with the camera at this distance above the origin */
    function render(measure, distance) {
        const ctx = setup();
        ctx.camera.position.set(0, 0, distance);
        ctx.camera.lookAt(0, 0, 0);
        ctx.camera.updateMatrixWorld();
        updateItemLabel(measure, { viewer: ctx.viewer, session: ctx.session, schema: () => DEFAULT_SCHEMA });
        sizeLikePotree(measure, ctx.camera);
        ctx.frame();
        return ctx;
    }
    const expectStackedOver = (card, value) => {
        // The card's bottom edge is 4 px over the value's top edge, centred over it
        expect(value.top - card.bottom).toBeCloseTo(4, 3);
        expect((card.left + card.right) / 2).toBeCloseTo((value.left + value.right) / 2, 3);
    };

    it('stands over the length of a distance, at any zoom: zoomed out it no longer covers it', () => {
        for (const distance of [30, 300, 3000]) {
            const measure = measureOf([[-10, 0, 0], [10, 0, 0]], { showDistances: true, showArea: false, closed: false });
            const { camera } = render(measure, distance);
            expect(measure.edgeLabels[0].visible).toBe(true);
            expectStackedOver(boxOf(measure._itemLabel, camera), boxOf(measure.edgeLabels[0], camera));
        }
    });

    it('stands over the area of an area, and over the height of a height', () => {
        const area = measureOf([[-10, -10, 0], [10, -10, 0], [0, 10, 0]], { showDistances: true, showArea: true, closed: true });
        const one = render(area, 100);
        expect(area.areaLabel.visible).toBe(true);
        expectStackedOver(boxOf(area._itemLabel, one.camera), boxOf(area.areaLabel, one.camera));

        const height = measureOf([[0, 0, 0], [5, 0, 3]], { showDistances: false, showHeight: true, showArea: false, closed: false });
        const two = render(height, 100);
        expect(height.heightLabel.visible).toBe(true);
        expectStackedOver(boxOf(height._itemLabel, two.camera), boxOf(height.heightLabel, two.camera));
    });

    it('stands over the middle length of a line of several sides', () => {
        const measure = measureOf([[-30, 0, 0], [-10, 0, 0], [10, 0, 0], [30, 0, 0]], { showDistances: true, showArea: false, closed: false });
        const { camera } = render(measure, 100);
        expectStackedOver(boxOf(measure._itemLabel, camera), boxOf(measure.edgeLabels[1], camera));
    });

    it('stands 12 px over the middle of the line when its values are not shown', () => {
        const measure = measureOf([[-10, 0, 0], [10, 0, 0]], { showDistances: false, showArea: false, closed: false });
        const { camera } = render(measure, 100);
        expect(measure.edgeLabels[0].visible).toBe(false);
        const card = boxOf(measure._itemLabel, camera);
        expect(card.bottom).toBeCloseTo(400 - 12, 3);
        expect((card.left + card.right) / 2).toBeCloseTo(500, 3);
    });

    it('follows its value when a point of the measure moves', () => {
        const measure = measureOf([[-10, 0, 0], [10, 0, 0]], { showDistances: true, showArea: false, closed: false });
        const { camera, frame } = render(measure, 100);
        measure.setPosition(1, new globalThis.THREE.Vector3(30, 0, 0));
        sizeLikePotree(measure, camera);
        frame();
        expectStackedOver(boxOf(measure._itemLabel, camera), boxOf(measure.edgeLabels[0], camera));
        expect(boxOf(measure.edgeLabels[0], camera).left).toBeGreaterThan(500);
    });
});

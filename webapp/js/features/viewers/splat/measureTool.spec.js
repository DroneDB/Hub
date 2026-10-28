import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SplatMeasureTool } from './measureTool';

let canvas;
let overlay;
let host;
let tool;
let counts;
let hits;
let scale;
let up;

/** Mouse events on the canvas, 200 by 100 pixels at the origin of the page. */
const fire = (type, init = {}) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
function click(x = 100, y = 50) {
    fire('pointerdown', { clientX: x, clientY: y });
    fire('pointerup', { clientX: x, clientY: y });
}
/** The text of the labels of the shapes, in the order they were made. */
const labels = () => {
    const found = [];
    overlay.traverse(o => { if (o instanceof CSS2DObject && o.element.className.includes('splat-measure-label')) found.push(o.element.textContent); });
    return found;
};
const dots = () => {
    let n = 0;
    overlay.traverse(o => { if (o instanceof CSS2DObject && o.element.className === 'splat-vertex') n++; });
    return n;
};

beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
    overlay = new THREE.Group();
    hits = [];
    counts = [];
    scale = { metersPerUnit: 1, unit: 'm' };
    up = [0, 0, 1];
    host = {
        THREE, CSS2DObject, canvas,
        stage: { overlay, pickSplat: vi.fn(() => hits.shift() ?? null) },
        getUp: () => up,
        getScale: () => scale,
        listen: (target, type, fn) => target.addEventListener(type, fn),
        setNavigationEnabled: vi.fn(),
        onActive: vi.fn(),
        onChange: vi.fn(),
        onMiss: vi.fn()
    };
    tool = new SplatMeasureTool(host, n => counts.push(n));
});

const hit = (x, y, z) => ({ point: new THREE.Vector3(x, y, z), distance: 1 });
/** Picks these points, one per click. */
const pick = (...points) => points.forEach(p => { hits.push(hit(...p)); click(); });

describe('drawing a distance', () => {
    it('adds a point per click, labels every segment and the total, and ends with a right click', async () => {
        const drawing = tool.measure('distance');
        expect(tool.activeKind).toBe('distance');
        pick([0, 0, 0], [3, 4, 0], [3, 4, 12]);
        expect(dots()).toBe(3);
        expect(tool.measurements).toEqual([]);

        const end = fire('contextmenu');
        const measurement = await drawing;

        expect(end).toBe(false); // the page's own menu was prevented
        expect(measurement).toMatchObject({ kind: 'distance', points: [[0, 0, 0], [3, 4, 0], [3, 4, 12]] });
        expect(labels()).toEqual(['5.0 m', '12.0 m', 'Total 17.0 m']);
        expect(tool.activeKind).toBeNull();
        expect(counts).toEqual([1]);
        expect(host.onChange).toHaveBeenCalledWith([measurement]);
    });

    it('is cancelled by a right click that comes too early, or Escape, and keeps nothing', async () => {
        const first = tool.measure('distance');
        pick([0, 0, 0]);
        fire('contextmenu');
        expect(await first).toBeNull();

        const second = tool.measure('distance');
        pick([0, 0, 0], [1, 0, 0]);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(await second).toBeNull();
        expect(tool.measurements).toEqual([]);
        expect(dots()).toBe(0);
        expect(host.onChange).not.toHaveBeenCalled();
    });

    it('is ended by Enter', async () => {
        const drawing = tool.measure('distance');
        pick([0, 0, 0], [0, 0, 2]);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect((await drawing).points).toHaveLength(2);
    });

    it('is replaced by the next shape, which cancels it', async () => {
        const first = tool.measure('distance');
        pick([0, 0, 0]);
        const second = tool.measure('area');
        expect(await first).toBeNull();
        expect(tool.activeKind).toBe('area');
        expect(dots()).toBe(0);
        tool.cancel();
        expect(await second).toBeNull();
    });
});

describe('the other shapes', () => {
    it('end by themselves: a point after one click, a height after two', async () => {
        const point = tool.measure('point');
        pick([1, 2, 3]);
        expect(await point).toMatchObject({ kind: 'point', points: [[1, 2, 3]] });
        expect(labels()).toEqual(['1.00, 2.00, 3.00 m']);

        const height = tool.measure('height');
        pick([9, 9, 1], [0, 0, 4]);
        expect(await height).toMatchObject({ kind: 'height' });
        expect(labels()[1]).toBe('Height 3.0 m');
    });

    it('measure the height along the up of the scene, as it is when they are drawn', async () => {
        up = [0, 1, 0];
        const height = tool.measure('height');
        pick([0, 1, 5], [0, 4, 5]);
        await height;
        expect(labels()).toContain('Height 3.0 m');
    });

    it('need three points for an area, which is labelled with the area seen from above', async () => {
        const area = tool.measure('area');
        pick([0, 0, 0], [4, 0, 0]);
        fire('contextmenu');
        expect(await area).toBeNull();

        const again = tool.measure('area');
        pick([0, 0, 0], [4, 0, 5], [4, 3, 5], [0, 3, 0]);
        fire('contextmenu');
        expect(await again).toMatchObject({ kind: 'area' });
        expect(labels()).toEqual(['12 m²']);
    });

    it('ignores a kind it does not know', async () => {
        expect(await tool.measure('volume')).toBeNull();
        expect(tool.activeKind).toBeNull();
        expect(host.setNavigationEnabled).not.toHaveBeenCalled();
    });
});

describe('clicks', () => {
    it('are points in the frame of the file, which the overlay turns with the mesh', async () => {
        overlay.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        const drawing = tool.measure('point');
        // The point 1 up the world's y is 1 along the file's z, whichever way round the quarter turn goes
        const world = new THREE.Vector3(0, 1, 0);
        pick([0, 1, 0]);
        const expected = overlay.worldToLocal(world.clone()).toArray();
        const [point] = (await drawing).points;
        expect(point[0]).toBeCloseTo(expected[0], 9);
        expect(point[1]).toBeCloseTo(expected[1], 9);
        expect(point[2]).toBeCloseTo(expected[2], 9);
        expect(Math.abs(point[2])).toBeCloseTo(1, 9);
    });

    it('turn the position on the page into normalised coordinates, y up', async () => {
        tool.measure('point');
        click(150, 25);
        expect(host.stage.pickSplat).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
    });

    it('are not points when they are drags, or when they are not the main button', () => {
        tool.measure('point');
        fire('pointerdown', { clientX: 10, clientY: 10 });
        fire('pointerup', { clientX: 60, clientY: 10 });
        fire('pointerdown', { clientX: 10, clientY: 10, button: 2 });
        fire('pointerup', { clientX: 10, clientY: 10, button: 2 });
        expect(host.stage.pickSplat).not.toHaveBeenCalled();
    });

    it('say so when they find no splat, and leave the shape as it was', () => {
        tool.measure('distance');
        click();
        expect(host.onMiss).toHaveBeenCalledTimes(1);
        expect(dots()).toBe(0);
    });

    it('do nothing when no shape is being drawn', () => {
        click();
        fire('contextmenu');
        expect(host.stage.pickSplat).not.toHaveBeenCalled();
    });
});

describe('navigation', () => {
    it('is suspended while a shape is drawn and back when it ends or is cancelled', async () => {
        const drawing = tool.measure('point');
        expect(host.setNavigationEnabled).toHaveBeenLastCalledWith(false);
        expect(host.onActive).toHaveBeenLastCalledWith('point');
        pick([0, 0, 0]);
        await drawing;
        expect(host.setNavigationEnabled).toHaveBeenLastCalledWith(true);
        expect(host.onActive).toHaveBeenLastCalledWith(null);

        tool.measure('area');
        tool.cancel();
        expect(host.setNavigationEnabled).toHaveBeenLastCalledWith(true);
    });
});

describe('the scale', () => {
    it('picks two points and keeps nothing', async () => {
        const drawing = tool.measure('scale');
        pick([0, 0, 0], [0, 0, 4]);
        const picked = await drawing;
        expect(picked.points).toEqual([[0, 0, 0], [0, 0, 4]]);
        expect(tool.measurements).toEqual([]);
        expect(counts).toEqual([]);
        expect(host.onChange).not.toHaveBeenCalled();
        // The pair stays out of the scene
        expect(dots()).toBe(0);
        expect(labels()).toEqual([]);
    });

    it('changes the labels when the shapes are drawn again after a change of scale', async () => {
        const drawing = tool.measure('distance');
        pick([0, 0, 0], [0, 0, 2]);
        fire('contextmenu');
        await drawing;
        expect(labels()).toEqual(['2.0 m']);

        scale = { metersPerUnit: 1, unit: 'units' };
        tool.refresh();
        expect(labels()).toEqual(['2.00 units']);
        scale = { metersPerUnit: 0.5, unit: 'm' };
        tool.refresh();
        expect(labels()).toEqual(['1.0 m']);
    });
});

describe('the shapes that are shown', () => {
    const saved = [
        { id: 1, kind: 'distance', points: [[0, 0, 0], [0, 0, 5]] },
        { id: 2, kind: 'point', points: [[1, 1, 1]] }
    ];

    it('are drawn from the saved ones without being reported as a change', () => {
        tool.show(saved);
        expect(labels()).toEqual(['5.0 m', '1.00, 1.00, 1.00 m']);
        expect(counts).toEqual([2]);
        expect(host.onChange).not.toHaveBeenCalled();
    });

    it('are all removed, labels and dots included, by clear, which reports the change', () => {
        tool.show(saved);
        const elements = [];
        overlay.traverse(o => { if (o instanceof CSS2DObject) { document.body.append(o.element); elements.push(o.element); } });
        tool.clear();
        expect(overlay.children).toEqual([]);
        expect(elements.every(e => !e.isConnected)).toBe(true);
        expect(counts).toEqual([2, 0]);
        expect(host.onChange).toHaveBeenCalledWith([]);
    });

    it('are replaced by the next ones shown', () => {
        tool.show(saved);
        tool.show([saved[1]]);
        expect(labels()).toEqual(['1.00, 1.00, 1.00 m']);
    });

    it('are released with the tool, which then draws nothing', async () => {
        tool.show(saved);
        const drawing = tool.measure('point');
        tool.dispose();
        expect(await drawing).toBeNull();
        expect(overlay.children).toEqual([]);
        expect(await tool.measure('point')).toBeNull();
    });
});

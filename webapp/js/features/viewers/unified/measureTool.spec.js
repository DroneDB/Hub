import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeasureTool, trimDrawnPoints } from './measureTool';

const p = (x, y = 0, z = 0) => ({ x, y, z });

describe('3D viewer measure tool', () => {
    it('writes the labels of its shapes again when asked (a change of units)', () => {
        const instance = { notifyChange: vi.fn() };
        const tool = new MeasureTool({ instance, mercatorScale: 1 }, () => {});
        const shapes = [{ rebuildLabels: vi.fn() }, { rebuildLabels: vi.fn() }];
        tool.shapes.push(...shapes);
        tool.relabel();
        shapes.forEach(s => expect(s.rebuildLabels).toHaveBeenCalledTimes(1));
        expect(instance.notifyChange).toHaveBeenCalled();
    });

    it('does nothing without a scene', () => {
        const tool = new MeasureTool({ instance: null, mercatorScale: 1 }, () => {});
        expect(() => tool.relabel()).not.toThrow();
    });
});

describe('trimDrawnPoints', () => {
    it('takes out the last point, the one that followed the pointer', () => {
        expect(trimDrawnPoints([p(0), p(3), p(3.2)], false)).toEqual([p(0), p(3)]);
    });

    it('takes out a last segment of length 0 too (two clicks on one spot)', () => {
        expect(trimDrawnPoints([p(0), p(3), p(3), p(3)], false)).toEqual([p(0), p(3)]);
    });

    it('of a ring, takes out the point before the closing one', () => {
        expect(trimDrawnPoints([p(0), p(4), p(4, 3), p(2, 2), p(0)], true)).toEqual([p(0), p(4), p(4, 3)]);
    });

    it('keeps at least the first point', () => {
        expect(trimDrawnPoints([p(1), p(1)], false)).toEqual([p(1)]);
        expect(trimDrawnPoints([], false)).toEqual([]);
    });
});

// A stand-in for Giro3D's DrawTool that ends a shape as the real one does: it hands every mouse event to
// the end condition of the options, a click adds a point to the points it keeps with a last one that follows the pointer
let domElement;
let shape;
let instance;
let scene;
let tool;
let counts;
let created;

class FakeDrawTool {
    create(options, minPoints, maxPoints) {
        const clicked = [];
        const points = [p(0)];
        shape = { points, setPoints: vi.fn(function (list) { shape.points = list; }), makeClosed: vi.fn(), rebuildLabels: vi.fn() };
        created.push(options);
        return new Promise((resolve, reject) => {
            const handle = e => {
                if (options.endCondition(e)) {
                    domElement.removeEventListener(e.type, handle);
                    if (clicked.length >= minPoints) {
                        shape.points = [...clicked.map(x => p(x)), p(clicked.at(-1) + 0.2)];
                        if (options.closeRing) shape.points.push(shape.points[0]);
                        resolve(shape);
                    } else {
                        resolve(null);
                    }
                } else if (e.type === 'click' && e.detail === 1) {
                    clicked.push(clicked.length * 3);
                    options.onPointCreated?.(shape, clicked.length - 1, p(clicked.length));
                    if (clicked.length === maxPoints) resolve(shape);
                }
            };
            ['mousedown', 'mousemove', 'mouseup', 'dblclick', 'click'].forEach(type => domElement.addEventListener(type, handle, { signal: options.signal }));
            options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
    }
    createPoint(options) { return this.create(options, 1, 1); }
    createLineString(options) { return this.create(options, 2, Infinity); }
    createPolygon(options) { return this.create({ ...options, closeRing: true }, 3, Infinity); }
    dispose() {}
}

const fire = (type, init = {}) => domElement.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail: 1, ...init }));
const click = () => { fire('mousedown'); fire('mouseup'); fire('click'); };
const rightClick = (x = 10, y = 10, upX = x, upY = y) => {
    fire('mousedown', { button: 2, clientX: x, clientY: y });
    fire('mouseup', { button: 2, clientX: upX, clientY: upY });
};
const key = (k, on = document.body) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    domElement = document.createElement('div');
    document.body.appendChild(domElement);
    created = [];
    counts = [];
    instance = { domElement, notifyChange: vi.fn(), remove: vi.fn() };
    scene = {
        instance, mercatorScale: 1, view: { activeTool: null }, setNavigationEnabled: vi.fn(),
        libs: { DrawTool: FakeDrawTool }
    };
    tool = new MeasureTool(scene, n => counts.push(n));
});
afterEach(() => { tool.dispose(); domElement.remove(); });

describe('drawing a distance (FR-VWR-10, D-027)', () => {
    it('is ended by a right click: the points that were clicked, without the one that followed the pointer', async () => {
        const drawing = tool.measure('distance');
        expect(scene.view.activeTool).toBe('distance');
        click(); click(); click();
        rightClick();
        await drawing;
        expect(shape.setPoints).toHaveBeenCalledTimes(1);
        expect(shape.points).toEqual([p(0), p(3), p(6)]);
        expect(counts).toEqual([1]);
        expect(tool.shapes).toEqual([shape]);
        expect(scene.view.activeTool).toBeNull();
        expect(shape.rebuildLabels).toHaveBeenCalled();
    });

    it('is not ended by a right-drag of 20 px, which pans the view, and is by a release 4 px from the press', async () => {
        const drawing = tool.measure('distance');
        click(); click();
        rightClick(100, 100, 120, 100);
        expect(tool.activeKind).toBe('distance');
        expect(tool.shapes).toEqual([]);
        rightClick(100, 100, 103, 102);
        await drawing;
        expect(tool.shapes).toEqual([shape]);
    });

    it('is ended by a double click, with one length: no segment of length 0', async () => {
        const drawing = tool.measure('distance');
        click(); click();
        fire('dblclick');
        await drawing;
        expect(shape.points).toEqual([p(0), p(3)]);
        expect(counts).toEqual([1]);
    });

    it('is ended by Enter, once it has two points; with fewer, Enter goes on', async () => {
        const drawing = tool.measure('distance');
        click();
        key('Enter');
        expect(tool.activeKind).toBe('distance');
        click();
        key('Enter');
        await drawing;
        expect(shape.points).toEqual([p(0), p(3)]);
        expect(tool.activeKind).toBeNull();
    });

    it('is dropped by Escape: nothing is kept, and the tool is free again', async () => {
        const drawing = tool.measure('distance');
        click(); click();
        key('Escape');
        await drawing;
        expect(tool.shapes).toEqual([]);
        expect(counts).toEqual([]);
        expect(scene.view.activeTool).toBeNull();
        // Escape with nothing drawn does nothing
        expect(() => key('Escape')).not.toThrow();
    });

    it('is dropped by Cancel, and by a right click that comes too early', async () => {
        const first = tool.measure('distance');
        click(); click();
        tool.cancel();
        await first;
        expect(tool.shapes).toEqual([]);

        const second = tool.measure('distance');
        click();
        rightClick();
        await second;
        expect(tool.shapes).toEqual([]);
    });

    it('leaves Enter and Escape to a field', async () => {
        const drawing = tool.measure('distance');
        click(); click();
        const input = document.body.appendChild(document.createElement('input'));
        key('Escape', input);
        key('Enter', input);
        expect(tool.activeKind).toBe('distance');
        input.remove();
        tool.cancel();
        await drawing;
    });

    it('keeps the navigation on while it is drawn, so a right-drag pans', async () => {
        const drawing = tool.measure('distance');
        expect(scene.setNavigationEnabled).not.toHaveBeenCalled();
        tool.cancel();
        await drawing;
        expect(scene.setNavigationEnabled).not.toHaveBeenCalled();
    });

    it('labels its segments with the shared formatter', async () => {
        tool.measure('distance');
        // The shared measureFormatters (FR-XC-08), not a text of its own
        expect(created[0].segmentLabelFormatter).toBe(tool.format.length);
        tool.cancel();
    });
});

describe('the other shapes', () => {
    it('an area is closed again after its temporary point is out: its corners, and nothing else', async () => {
        const drawing = tool.measure('area');
        click(); click(); click();
        rightClick();
        await drawing;
        expect(shape.points).toEqual([p(0), p(3), p(6)]);
        expect(shape.makeClosed).toHaveBeenCalledTimes(1);
        expect(counts).toEqual([1]);
    });

    it('an area with two corners is dropped by the right click, and removed from the scene', async () => {
        const drawing = tool.measure('area');
        click(); click();
        rightClick();
        await drawing;
        expect(tool.shapes).toEqual([]);
    });

    it('a point ends with its click, as before, and is not trimmed', async () => {
        const drawing = tool.measure('point');
        click();
        await drawing;
        expect(shape.setPoints).not.toHaveBeenCalled();
        expect(tool.shapes).toEqual([shape]);
    });

    it('Enter does nothing for a point', async () => {
        const drawing = tool.measure('point');
        key('Enter');
        expect(tool.activeKind).toBe('point');
        click();
        await drawing;
    });

    it('a kind it does not know draws nothing', async () => {
        await tool.measure('volume');
        expect(scene.view.activeTool).toBeNull();
    });
});

describe('Clear, and a new shape', () => {
    it('Clear takes the shapes and the one being drawn, and is not undone by the one that was cancelled', async () => {
        const first = tool.measure('distance');
        click(); click();
        rightClick();
        await first;
        const second = tool.measure('distance');
        click();
        tool.clear();
        await second;
        expect(tool.shapes).toEqual([]);
        expect(counts).toEqual([1, 0]);
        expect(instance.remove).toHaveBeenCalledTimes(1);
        expect(scene.view.activeTool).toBeNull();
    });

    it('a new shape replaces the one being drawn, which does not take the tool from it', async () => {
        const first = tool.measure('distance');
        click();
        const second = tool.measure('area');
        await first;
        expect(scene.view.activeTool).toBe('area');
        expect(tool.activeKind).toBe('area');
        tool.cancel();
        await second;
        expect(scene.view.activeTool).toBeNull();
    });

    it('stops listening for keys when it is over', async () => {
        const drawing = tool.measure('distance');
        tool.cancel();
        await drawing;
        click();
        await settle();
        expect(tool.activeKind).toBeNull();
    });
});

describe('label size and line width follow the canvas (FR-VWR-37)', () => {
    const height = px => Object.defineProperty(domElement, 'clientHeight', { configurable: true, value: px });

    it('on a canvas 2104 CSS px high every kind gets fontSize 18 and lineWidth 3', async () => {
        height(2104);
        const drawing = tool.measure('distance');
        expect(created[0]).toMatchObject({ fontSize: 18, lineWidth: 3 });
        tool.cancel();
        await drawing;
        tool.measure('area');
        expect(created[1]).toMatchObject({ fontSize: 18, lineWidth: 3 });
        tool.measure('point');
        expect(created[2]).toMatchObject({ fontSize: 18, lineWidth: 3 });
    });

    it('on a canvas 1080 px high the label is 12 px (it was 12 px before), the line 3', () => {
        height(1080);
        tool.measure('distance');
        expect(created[0]).toMatchObject({ fontSize: 12, lineWidth: 3 });
    });

    it('a shape drawn earlier takes the size of the view when the next one starts', async () => {
        height(1080);
        const first = tool.measure('distance');
        click(); click();
        rightClick();
        await first;
        height(1440);
        tool.measure('distance');
        expect(tool.shapes[0]).toMatchObject({ fontSize: 16, lineWidth: 3 });
    });
});

/**
 * The drawing session of the 2D map tools (FR-XC-17, D-027): Esc abandons the shape, Enter, a double click and
 * a right click finish it, a right-drag does not, Space adds the point of the crosshair, and the tool lock
 * is taken once and given back once. It runs on a real OpenLayers map.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Draw from 'ol/interaction/Draw';
import DragPan from 'ol/interaction/DragPan';
import { Vector as VectorSource } from 'ol/source';
import { createToolLock, startDrawingSession } from './drawingSession';

let map;
let target;
let source;
let toolbar;
let session;

beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [1000, 2000], zoom: 3 }) });
    source = new VectorSource();
    toolbar = { setToolsDisabled: vi.fn() };
});
afterEach(() => {
    session?.end();
    session = null;
    map.setTarget(undefined);
    target.remove();
});

const start = (options = {}) => {
    session = startDrawingSession({ map, type: 'LineString', source, toolbar, ...options });
    return session;
};
const drawOf = () => map.getInteractions().getArray().find(i => i instanceof Draw);
const key = (k, on = document.body, init = {}) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const pointer = (type, x, y, button = 2) => map.getViewport().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true }));
const rightClick = (x = 50, y = 50, upX = x, upY = y) => { pointer('pointerdown', x, y); pointer('pointerup', upX, upY); };
// The user's two first points of a line, from the keyboard (the same code path as the points of a click)
const addPoint = (x, y) => session.draw.appendCoordinates([[x, y]]);
const geometries = () => source.getFeatures().map(f => f.getGeometry().getCoordinates());

describe('the session', () => {
    it('adds the Draw interaction, locks the toolbar once, and takes both away at the end', () => {
        start();
        expect(drawOf()).toBe(session.draw);
        expect(toolbar.setToolsDisabled).toHaveBeenCalledTimes(1);
        expect(toolbar.setToolsDisabled).toHaveBeenLastCalledWith(true);
        const onEnd = vi.fn();
        session.options.onEnd = onEnd;
        session.end();
        session.end();
        expect(drawOf()).toBeUndefined();
        expect(toolbar.setToolsDisabled).toHaveBeenCalledTimes(2);
        expect(toolbar.setToolsDisabled).toHaveBeenLastCalledWith(false);
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(onEnd).toHaveBeenCalledWith('abort');
    });

    it('shows the crosshair at the centre of the map while it runs, and makes the map reachable with Tab', () => {
        start();
        expect(map.getViewport().querySelector('.map-crosshair')).not.toBeNull();
        expect(map.getViewport().getAttribute('tabindex')).toBe('0');
        session.end();
        expect(map.getViewport().querySelector('.map-crosshair')).toBeNull();
        expect(map.getViewport().hasAttribute('tabindex')).toBe(false);
    });

    it('says how to finish and cancel (one hint text)', () => {
        start();
        expect(session.hint).toBe('Click the points of the line. Double-click, right-click or Enter finishes; Esc cancels. Space adds the point at the crosshair.');
    });
});

describe('the tool lock', () => {
    it('is held once and released once however it is asked', () => {
        const t = { setToolsDisabled: vi.fn() };
        const lock = createToolLock(() => t);
        lock.hold();
        lock.hold();
        expect(t.setToolsDisabled).toHaveBeenCalledTimes(1);
        lock.release();
        lock.release();
        expect(t.setToolsDisabled.mock.calls).toEqual([[true], [false]]);
    });

    it('does nothing without a toolbar', () => {
        const lock = createToolLock(null);
        lock.hold();
        expect(lock.held).toBe(false);
        expect(() => lock.release()).not.toThrow();
    });
});

describe('Esc (abandon)', () => {
    it('drops the half-drawn line: the source has no new feature, and the session ends', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        expect(session.drawing).toBe(true);
        key('Escape');
        expect(source.getFeatures()).toHaveLength(0);
        expect(session.active).toBe(false);
        expect(drawOf()).toBeUndefined();
        expect(toolbar.setToolsDisabled).toHaveBeenLastCalledWith(false);
    });

    it('works with the focus anywhere, also in a field', () => {
        start();
        const input = document.body.appendChild(document.createElement('input'));
        key('Escape', input);
        expect(session.active).toBe(false);
        input.remove();
    });

    it('abortDrawing() drops the shape and leaves the session armed', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        session.abortDrawing();
        expect(session.drawing).toBe(false);
        expect(session.active).toBe(true);
        expect(source.getFeatures()).toHaveLength(0);
    });
});

describe('finishing', () => {
    it('Enter finishes the line with the points placed: one feature, no point that followed the pointer', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        addPoint(30, 25);
        key('Enter');
        expect(geometries()).toEqual([[[10, 10], [20, 20], [30, 25]]]);
        expect(session.drawing).toBe(false);
        expect(session.active).toBe(true);
    });

    it('a right click (a release within 4 px of the press) finishes the line', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        rightClick(50, 50, 52, 53);
        expect(geometries()).toEqual([[[10, 10], [20, 20]]]);
    });

    it('a right-drag of 20 px does not finish it', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        rightClick(50, 50, 70, 50);
        expect(source.getFeatures()).toHaveLength(0);
        expect(session.drawing).toBe(true);
    });

    it('a left click does not finish it', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        pointer('pointerdown', 50, 50, 0);
        pointer('pointerup', 50, 50, 0);
        expect(source.getFeatures()).toHaveLength(0);
    });

    it('a double click finishes the line that is still open', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        map.dispatchEvent({ type: 'dblclick', map, coordinate: [0, 0], pixel: [0, 0] });
        expect(geometries()).toEqual([[[10, 10], [20, 20]]]);
    });

    it('a line of one point is dropped, not kept: a feature that has no length', () => {
        start();
        addPoint(10, 10);
        key('Enter');
        expect(source.getFeatures()).toHaveLength(0);
        expect(session.drawing).toBe(false);
        start();
        addPoint(10, 10);
        rightClick();
        expect(source.getFeatures()).toHaveLength(0);
    });

    it('a polygon needs three points', () => {
        // The map has no size here: a pixel is a tenth of a map unit, as OpenLayers asks for it to snap to a vertex
        map.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        start({ type: 'Polygon' });
        addPoint(0, 0);
        addPoint(1000, 0);
        key('Enter');
        expect(source.getFeatures()).toHaveLength(0);
        addPoint(0, 0);
        addPoint(1000, 0);
        addPoint(1000, 1000);
        key('Enter');
        expect(geometries()).toEqual([[[[0, 0], [1000, 0], [1000, 1000], [0, 0]]]]);
    });

    it('with once, the session ends after the shape', async () => {
        const onEnd = vi.fn();
        start({ once: true, onEnd });
        addPoint(10, 10);
        addPoint(20, 20);
        key('Enter');
        expect(onEnd).toHaveBeenCalledWith('finish');
        expect(session.active).toBe(false);
        expect(toolbar.setToolsDisabled).toHaveBeenLastCalledWith(false);
        await vi.waitFor(() => expect(drawOf()).toBeUndefined());
    });

    it('tells the owner when a shape ends, before the source has it', () => {
        const seen = [];
        start({ onDrawEnd: e => seen.push([e.feature.getGeometry().getCoordinates(), source.getFeatures().length]) });
        addPoint(10, 10);
        addPoint(20, 20);
        key('Enter');
        expect(seen).toEqual([[[[10, 10], [20, 20]], 0]]);
    });
});

describe('the keyboard crosshair', () => {
    it('Space adds the centre of the view as the next vertex', () => {
        start();
        key(' ');
        map.getView().setCenter([1500, 2500]);
        key(' ');
        key('Enter');
        expect(geometries()).toEqual([[[1000, 2000], [1500, 2500]]]);
    });

    it('Space on a Point tool places the centre as the point; Enter does too', () => {
        const points = [];
        start({ type: 'Point', source: undefined, onDrawEnd: e => points.push(e.feature.getGeometry().getCoordinates()) });
        key(' ');
        map.getView().setCenter([5, 6]);
        key('Enter');
        expect(points).toEqual([[1000, 2000], [5, 6]]);
    });

    it('Space and Enter on a box: the first corner, then the opposite one', () => {
        start({ type: 'Box' });
        key(' ');
        expect(session.drawing).toBe(true);
        map.getView().setCenter([1100, 2050]);
        key('Enter');
        expect(source.getFeatures()).toHaveLength(1);
        expect(source.getFeatures()[0].getGeometry().getExtent()).toEqual([1000, 2000, 1100, 2050]);
        expect(session.drawing).toBe(false);
    });

    it('leaves Space and Enter to the control that has the focus', () => {
        start();
        const button = document.body.appendChild(document.createElement('button'));
        key(' ', button);
        key('Enter', button);
        expect(session.drawing).toBe(false);
        button.remove();
    });

    it('takes the keys when the map has the focus', () => {
        start();
        key(' ', map.getViewport());
        expect(session.drawing).toBe(true);
    });

    it('does not take Space without the crosshair', () => {
        start({ crosshair: false });
        key(' ');
        expect(session.drawing).toBe(false);
        expect(map.getViewport().querySelector('.map-crosshair')).toBeNull();
    });
});

describe('the context menu', () => {
    it('is still kept from the page when the right click that ends a once session sends its contextmenu after the release', () => {
        start({ once: true });
        addPoint(10, 10);
        addPoint(20, 20);
        rightClick();
        expect(session.active).toBe(false);
        const late = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        map.getViewport().dispatchEvent(late);
        expect(late.defaultPrevented).toBe(true);
        // Only that one: the next menu is the page's
        const next = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        map.getViewport().dispatchEvent(next);
        expect(next.defaultPrevented).toBe(false);
    });

    it('stays away from the map while the session runs and comes back after it', () => {
        start();
        const during = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        map.getViewport().dispatchEvent(during);
        expect(during.defaultPrevented).toBe(true);
        session.end();
        const after = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        map.getViewport().dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });
});

/**
 * The same session on a map that is rendered (a size, a frame) and real pointer events, through OpenLayers' own
 * handling of the pointer: a view of 400 × 300 px at 1 map unit per pixel centred on [0, 0], so the pixel [x, y]
 * is the coordinate [x - 200, 150 - y].
 */
describe('on a rendered map, with the pointer', () => {
    beforeEach(() => {
        // OpenLayers tells a click from a double click with a timer of 250 ms
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        map.getView().setResolution(1);
        map.getView().setCenter([0, 0]);
        map.setSize([400, 300]);
        map.getViewport().getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON() {} });
        map.renderSync();
    });
    afterEach(() => vi.useRealTimers());

    const ptr = (type, x, y, button, buttons) => map.getViewport().dispatchEvent(new PointerEvent(type, {
        pointerId: 1, isPrimary: true, pointerType: 'mouse', button, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    const leftClick = (x, y) => {
        ptr('pointermove', x, y, -1, 0);
        ptr('pointerdown', x, y, 0, 1);
        ptr('pointerup', x, y, 0, 0);
        vi.advanceTimersByTime(300);
    };
    const rightPress = (x, y) => ptr('pointerdown', x, y, 2, 2);
    const rightRelease = (x, y) => ptr('pointerup', x, y, 2, 0);
    const realRightClick = (x, y) => { rightPress(x, y); rightRelease(x, y); vi.advanceTimersByTime(300); };
    const rightDrag = (x, y, ...moves) => {
        rightPress(x, y);
        moves.forEach(([mx, my]) => ptr('pointermove', mx, my, -1, 2));
        const [ux, uy] = moves.at(-1);
        rightRelease(ux, uy);
        vi.advanceTimersByTime(300);
    };

    it('clicks of the main button draw the line, and a right click finishes it and starts no other', () => {
        start();
        leftClick(100, 100);
        leftClick(200, 100);
        realRightClick(250, 150);
        expect(geometries()).toEqual([[[-100, 50], [0, 50]]]);
        // The right button did not start the next line where it was pressed
        expect(session.drawing).toBe(false);
        expect(session.sketch).toBeNull();
        expect(session.active).toBe(true);
    });

    it('a right click places no point (Inspect, the point annotation, the eraser), a left click does', () => {
        const points = [];
        start({ type: 'Point', source: undefined, onDrawEnd: e => points.push(e.feature.getGeometry().getCoordinates()) });
        realRightClick(100, 100);
        expect(points).toEqual([]);
        leftClick(300, 50);
        expect(points).toEqual([[100, 100]]);
    });

    it('a right-drag pans the map while a line is drawn, and does not finish it', () => {
        start();
        leftClick(100, 100);
        leftClick(200, 100);
        // Pressed at 300, then 330 and 360: the map follows the pointer from its first move, 30 px to the right
        rightDrag(300, 150, [330, 150], [360, 150]);
        expect(map.getView().getCenter()).toEqual([-30, 0]);
        expect(source.getFeatures()).toHaveLength(0);
        expect(session.drawing).toBe(true);
    });

    it('the pan of the right button goes with the session', () => {
        start();
        expect(map.getInteractions().getArray().filter(i => i instanceof DragPan)).toHaveLength(2);
        session.end();
        expect(map.getInteractions().getArray().filter(i => i instanceof DragPan)).toHaveLength(1);
        rightDrag(300, 150, [330, 150], [360, 150]);
        expect(map.getView().getCenter()).toEqual([0, 0]);
    });
});

describe('Esc and the page', () => {
    it('is left to a dialog: the shape and the session stay, the key is not taken', () => {
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        const dialog = document.body.appendChild(document.createElement('div'));
        dialog.setAttribute('role', 'dialog');
        const button = dialog.appendChild(document.createElement('button'));
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(session.active).toBe(true);
        expect(session.drawing).toBe(true);
        dialog.setAttribute('aria-modal', 'true');
        dialog.removeAttribute('role');
        key('Escape', button);
        expect(session.active).toBe(true);
        dialog.remove();
    });

    it('still cancels when the map itself is in the dialog', () => {
        const dialog = document.body.appendChild(document.createElement('div'));
        dialog.setAttribute('role', 'dialog');
        dialog.appendChild(target);
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        key('Escape', map.getViewport());
        expect(session.active).toBe(false);
        expect(source.getFeatures()).toHaveLength(0);
        document.body.appendChild(target);
        dialog.remove();
    });

    it('with a shape drawn, the key is the shape\'s; with none, the tool ends and the page hears the key too', () => {
        const heard = vi.fn();
        document.addEventListener('keydown', heard);
        start();
        addPoint(10, 10);
        addPoint(20, 20);
        const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.body.dispatchEvent(first);
        expect(first.defaultPrevented).toBe(true);
        expect(heard).not.toHaveBeenCalled();
        expect(session.active).toBe(false);

        start();
        const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.body.dispatchEvent(second);
        expect(session.active).toBe(false);
        expect(second.defaultPrevented).toBe(false);
        expect(heard).toHaveBeenCalledTimes(1);
        document.removeEventListener('keydown', heard);
    });
});

describe('one session per map', () => {
    it('a session that starts ends the one that runs on its map, which hears "stop"', () => {
        const onEnd = vi.fn();
        const first = startDrawingSession({ map, type: 'Polygon', source, toolbar, onEnd });
        const second = start({ type: 'Point', source: undefined });
        expect(first.active).toBe(false);
        expect(onEnd).toHaveBeenCalledWith('stop');
        expect(map.getInteractions().getArray().filter(i => i instanceof Draw)).toEqual([second.draw]);
        // The lock: taken by the first, given back, taken by the second
        expect(toolbar.setToolsDisabled.mock.calls).toEqual([[true], [false], [true]]);
        // Ending the first again does nothing to the second
        first.end();
        expect(second.active).toBe(true);
        expect(drawOf()).toBe(second.draw);
    });

    it('a session on another map is left alone', () => {
        const otherTarget = document.body.appendChild(document.createElement('div'));
        const other = new OlMap({ target: otherTarget, view: new View({ center: [0, 0], zoom: 2 }) });
        const there = startDrawingSession({ map: other, type: 'LineString' });
        start();
        expect(there.active).toBe(true);
        expect(session.active).toBe(true);
        there.end();
        other.setTarget(undefined);
        otherTarget.remove();
    });
});

/**
 * The gesture rule on the point-cloud viewer's measures, against a stand-in of Potree 1.8's measuring
 * tool that ends a measure the way the vendored one does: a left release adds a marker, a right release of
 * any move ends it (taking the marker that follows the pointer out of an open measure), and a measure of a
 * fixed number of markers ends by itself. The input handler comes first on the canvas, then the tools, and it
 * works as the vendored one (potree.js InputHandler): a press with nothing in hand takes the camera's drag, a move
 * drags what it holds (a marker follows the pointer; with nothing held the controls rotate with the left button and
 * pan with the right one), a release lets go, and a double click goes to the controls (which fly the camera to it).
 * The measure tells what Potree's Measure tells: a marker added (then moved where it begins), a marker moved onto the cloud
 * by the pick under the pointer, and a marker the release of the input handler dropped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PotreeMeasureGestures, MEASURE_TOOLS } from './measureGestures';

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}

let canvas;
let viewer;
let measures;
let active;
let discarded;
let gestures;
let timers;
let tracked;
let controls;
// The height of the cloud under the pointer: where a marker that follows it is
let pointerZ = 0;
// No point of the cloud under the pointer (the empty sky): a marker that follows it does not move
let pointerMisses = false;

function makeViewer() {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const scene = new Dispatcher();
    scene.measurements = [];
    scene.removeMeasurement = m => {
        scene.measurements = scene.measurements.filter(x => x !== m);
        scene.dispatchEvent({ type: 'measurement_removed', measurement: m });
    };
    // Potree's startDragging: the drag of nothing (null) is the camera's
    const inputHandler = { drag: null, last: { x: 0, y: 0 }, startDragging(object) { this.drag = { object, mouse: 0 }; } };
    controls = { doubleClockZoomEnabled: true, zooms: [], pans: [], rotations: [] };
    // Potree's input handler is on the canvas before any tool
    canvas.addEventListener('mousedown', () => { if (!inputHandler.drag) inputHandler.startDragging(null); });
    canvas.addEventListener('mousemove', e => {
        const dx = e.clientX - inputHandler.last.x;
        inputHandler.last = { x: e.clientX, y: e.clientY };
        const drag = inputHandler.drag;
        if (!drag) return;
        drag.mouse = e.buttons;
        if (drag.object) {
            if (!pointerMisses) drag.object.measure.setPosition(drag.object, { x: e.clientX, y: e.clientY, z: pointerZ });
        }
        else if (e.buttons === 1) controls.rotations.push(dx);
        else if (e.buttons === 2) controls.pans.push(dx);
    });
    canvas.addEventListener('mouseup', () => {
        const object = inputHandler.drag?.object;
        if (object) object.measure.dispatchEvent({ type: 'marker_dropped', index: object.measure.spheres.indexOf(object) });
        inputHandler.drag = null;
    });
    // A touch gives Potree's input handler no mouse events: it lets go of what it drags at touchstart, and again at touchend
    canvas.addEventListener('touchstart', () => inputHandler.startDragging(null));
    canvas.addEventListener('touchend', () => { inputHandler.drag = null; });
    canvas.addEventListener('dblclick', e => { if (controls.doubleClockZoomEnabled) controls.zooms.push([e.clientX, e.clientY]); });
    const v = new Dispatcher();
    Object.assign(v, { scene, inputHandler, renderer: { domElement: canvas } });
    // A pointer position the markers read: the marker that follows the pointer is at it
    v.pointer = { x: 0, y: 0 };
    const tool = new Dispatcher();
    tool.startInsertion = (args = {}) => {
        const measure = Object.assign(new Dispatcher(), { points: [], spheres: [], name: args.name || 'Measurement', maxMarkers: args.maxMarkers ?? Infinity });
        measure.setPosition = (sphere, position) => {
            Object.assign(sphere.point.position, position);
            measure.dispatchEvent({ type: 'marker_moved', index: measure.spheres.indexOf(sphere) });
        };
        measure.addMarker = position => {
            const point = { position: { ...position } };
            measure.points.push(point);
            const sphere = { id: measure.spheres.length, point, measure };
            measure.spheres.push(sphere);
            measure.dispatchEvent({ type: 'marker_added', sphere });
            measure.setPosition(sphere, position);
        };
        measure.removeMarker = i => { measure.points.splice(i, 1); measure.spheres.splice(i, 1); };
        tool.dispatchEvent({ type: 'start_inserting_measurement', measure });
        // What the measuring tool does when one starts: the insertion before ends
        v.dispatchEvent({ type: 'cancel_insertions' });
        const cancel = { removeLast: measure.maxMarkers > 3 };
        const insert = e => {
            if (e.button === 0) {
                measure.addMarker(measure.points[measure.points.length - 1].position);
                if (measure.points.length >= measure.maxMarkers) cancel.callback();
                inputHandler.startDragging(measure.spheres[measure.spheres.length - 1]);
            } else if (e.button === 2) {
                cancel.callback();
            }
        };
        cancel.callback = () => {
            if (cancel.removeLast) measure.removeMarker(measure.points.length - 1);
            canvas.removeEventListener('mouseup', insert);
            v.removeEventListener('cancel_insertions', cancel.callback);
        };
        if (measure.maxMarkers > 1) {
            v.addEventListener('cancel_insertions', cancel.callback);
            canvas.addEventListener('mouseup', insert);
        }
        measure.addMarker({ x: 0, y: 0, z: 0 });
        inputHandler.startDragging(measure.spheres[0]);
        scene.measurements.push(measure);
        measures.push(measure);
        return measure;
    };
    v.measuringTool = tool;
    return v;
}

const fire = (type, init = {}) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
/**
 * A click at a point of the cloud (x, y on the screen, z the height there): the pointer moves there, then clicks.
 * `detail` is the browser's count of the clicks in a row (2: the second click of a double click).
 */
function click(x, y, z = 0, detail = 0) {
    pointerZ = z;
    fire('mousemove', { clientX: x, clientY: y, buttons: 0 });
    fire('mousedown', { clientX: x, clientY: y, buttons: 1, detail });
    fire('mouseup', { clientX: x, clientY: y, detail });
}
const rightClick = (x = 5, y = 5, upX = x, upY = y) => {
    fire('mousedown', { clientX: x, clientY: y, button: 2, buttons: 2 });
    fire('mouseup', { clientX: upX, clientY: upY, button: 2 });
};
/** A drag of a button through the points of the screen, released at the last. */
const drag = (button, [x, y], ...moves) => {
    const buttons = button === 2 ? 2 : 1;
    fire('mousemove', { clientX: x, clientY: y, buttons: 0 });
    fire('mousedown', { clientX: x, clientY: y, button, buttons });
    moves.forEach(([mx, my]) => fire('mousemove', { clientX: mx, clientY: my, buttons }));
    const [ux, uy] = moves.at(-1);
    fire('mouseup', { clientX: ux, clientY: uy, button });
};
const key = (k, on = document.body) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const flushTimers = () => { const run = timers.splice(0); run.forEach(fn => fn()); };
const coords = m => m.points.map(p => [p.position.x, p.position.y, p.position.z]);

beforeEach(() => {
    pointerMisses = false;
    measures = [];
    active = [];
    discarded = [];
    timers = [];
    tracked = [];
    viewer = makeViewer();
    gestures = new PotreeMeasureGestures({
        viewer,
        session: { track: (target, type, fn, options) => { target.addEventListener(type, fn, options); tracked.push([target, type, fn, options]); } },
        onActive: kind => active.push(kind),
        discard: m => { discarded.push(m); viewer.scene.removeMeasurement(m); },
        later: fn => timers.push(fn)
    });
});
// What a PotreeSession does when the viewer closes
afterEach(() => { tracked.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options)); canvas.remove(); });

describe('a distance', () => {
    beforeEach(() => { gestures.start('distance'); flushTimers(); });

    it('starts as the Potree icon does, and says which kind is being drawn', () => {
        expect(MEASURE_TOOLS.distance).toEqual({ showDistances: true, showArea: false, closed: false, name: 'Distance' });
        expect(gestures.activeKind).toBe('distance');
        expect(active).toContain('distance');
    });

    it('is ended by a right click: the points clicked, none that followed the pointer', () => {
        click(0, 0); click(3, 4); click(3, 8);
        rightClick();
        expect(coords(measures[0])).toEqual([[0, 0, 0], [3, 4, 0], [3, 8, 0]]);
        expect(gestures.activeKind).toBeNull();
        expect(active.at(-1)).toBeNull();
        expect(discarded).toEqual([]);
        expect(viewer.scene.measurements).toEqual([measures[0]]);
    });

    it('is not ended by a right-drag of 20 px, and is by a release 4 px from the press', () => {
        click(0, 0); click(3, 4);
        rightClick(100, 100, 120, 100);
        expect(gestures.activeKind).toBe('distance');
        expect(measures[0].points).toHaveLength(3);
        rightClick(100, 100, 103, 102);
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[0])).toEqual([[0, 0, 0], [3, 4, 0]]);
    });

    it('keeps a right-drag from Potree: its own handler would have ended the measure', () => {
        click(0, 0); click(3, 4);
        rightClick(100, 100, 130, 100);
        // Still being drawn: another click adds a point
        click(6, 8);
        expect(measures[0].points).toHaveLength(4);
    });

    it('is ended by Enter, and by a double click, with no segment of length 0', () => {
        click(0, 0); click(3, 4);
        key('Enter');
        expect(coords(measures[0])).toEqual([[0, 0, 0], [3, 4, 0]]);
        expect(gestures.activeKind).toBeNull();

        gestures.start('distance');
        flushTimers();
        click(0, 0);
        // A double click on the last point: two clicks on one spot, then the dblclick
        click(5, 5); click(5, 5);
        fire('dblclick');
        expect(coords(measures[1])).toEqual([[0, 0, 0], [5, 5, 0]]);
        expect(gestures.activeKind).toBeNull();
    });

    it('is ended by a double click whose second click moved 1-2 px: no extra point, no extra segment', () => {
        click(0, 0);
        // The two clicks of the double click: (5, 5), then (6, 7), 2.24 px away
        click(5, 5); click(6, 7);
        fire('dblclick', { clientX: 6, clientY: 7 });
        expect(coords(measures[0])).toEqual([[0, 0, 0], [5, 5, 0]]);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.inputHandler.drag.object).toBeNull();
    });

    it('a double click takes out the point of its second click when the browser counts it as one (detail 2), 6 px away', () => {
        click(0, 0); click(10, 0);
        click(20, 0, 0, 1); click(26, 0, 0, 2);
        fire('dblclick', { clientX: 26, clientY: 0 });
        expect(coords(measures[0])).toEqual([[0, 0, 0], [10, 0, 0], [20, 0, 0]]);
    });

    it('a double click that leaves a point too few takes its second point out and the measure goes on', () => {
        click(0, 0); click(1, 1);
        fire('dblclick', { clientX: 1, clientY: 1 });
        expect(gestures.activeKind).toBe('distance');
        // The point placed, and the marker that follows the pointer
        expect(coords(measures[0])).toEqual([[0, 0, 0], [1, 1, 0]]);
        click(8, 6);
        key('Enter');
        expect(coords(measures[0])).toEqual([[0, 0, 0], [8, 6, 0]]);
    });

    it('is dropped by Escape: it is removed, the history of the measures is not asked', () => {
        click(0, 0); click(3, 4);
        key('Escape');
        expect(viewer.scene.measurements).toEqual([]);
        expect(discarded).toEqual([measures[0]]);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.inputHandler.drag.object).toBeNull();
    });

    it('is dropped by a right click or Enter with a point too few: Enter goes on, a right click ends it', () => {
        click(0, 0);
        key('Enter');
        expect(gestures.activeKind).toBe('distance');
        expect(viewer.scene.measurements).toHaveLength(1);
        rightClick();
        expect(viewer.scene.measurements).toEqual([]);
        expect(discarded).toHaveLength(1);
    });

    it('leaves Enter and Escape to a field', () => {
        click(0, 0); click(3, 4);
        const input = document.body.appendChild(document.createElement('input'));
        key('Escape', input);
        key('Enter', input);
        expect(gestures.activeKind).toBe('distance');
        input.remove();
    });

    it('leaves Enter to a focused button or link (it presses it), and Escape still drops the measure', () => {
        click(0, 0); click(3, 4);
        const button = document.body.appendChild(document.createElement('button'));
        const link = document.body.appendChild(document.createElement('a'));
        link.href = '#help';
        key('Enter', button);
        key('Enter', link);
        expect(gestures.activeKind).toBe('distance');
        expect(measures[0].points).toHaveLength(3);
        key('Escape', button);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);
        button.remove();
        link.remove();
    });
});

describe('with no measure being drawn', () => {
    it('Escape, Enter, a right click and a double click do nothing, and a right-drag is left to Potree', () => {
        gestures.cancel();
        key('Escape');
        key('Enter');
        rightClick();
        fire('dblclick');
        const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, clientX: 50 });
        const heard = vi.fn();
        canvas.addEventListener('mouseup', heard);
        canvas.dispatchEvent(up);
        expect(heard).toHaveBeenCalledTimes(1);
        expect(active).toEqual([]);
        expect(discarded).toEqual([]);
    });
});

describe('an area', () => {
    it('keeps its corners with a right click, and needs three', () => {
        gestures.start('area');
        flushTimers();
        click(0, 0); click(4, 0);
        rightClick();
        expect(viewer.scene.measurements).toEqual([]);

        gestures.start('area');
        flushTimers();
        click(0, 0); click(4, 0); click(4, 3);
        rightClick();
        expect(coords(measures[1])).toEqual([[0, 0, 0], [4, 0, 0], [4, 3, 0]]);
    });
});

describe('the shapes of a fixed number of points', () => {
    it('a point ends with its click, and the tool says so', () => {
        gestures.start('point');
        flushTimers();
        expect(gestures.activeKind).toBe('point');
        click(1, 2, 3);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[0])).toEqual([[1, 2, 3]]);
    });

    it('a height ends with its second click', () => {
        gestures.start('height');
        flushTimers();
        click(0, 0, 0);
        flushTimers();
        expect(gestures.activeKind).toBe('height');
        click(0, 0, 5);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[0])).toEqual([[0, 0, 0], [0, 0, 5]]);
    });

    it('a double click on a height keeps both of its points: its second click placed none of its own', () => {
        gestures.start('height');
        flushTimers();
        click(1, 1, 0);
        click(2, 2, 4, 2);
        fire('dblclick', { clientX: 2, clientY: 2 });
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[0])).toEqual([[1, 1, 0], [2, 2, 4]]);
    });

    it('Escape drops a height after its first click', () => {
        gestures.start('height');
        flushTimers();
        click(0, 0, 0);
        key('Escape');
        expect(viewer.scene.measurements).toEqual([]);
    });
});

describe('a measure that Potree starts', () => {
    it('is followed too: an icon of its sidebar gets the same gestures, with its kind read once it is named', () => {
        viewer.measuringTool.startInsertion({ showDistances: true, closed: false, name: 'Distance' });
        expect(gestures.activeKind).toBeNull();
        flushTimers();
        expect(gestures.activeKind).toBe('distance');
        click(0, 0); click(2, 0);
        rightClick();
        expect(coords(measures[0])).toEqual([[0, 0, 0], [2, 0, 0]]);
    });

    it('a tool the toolbar does not have is "other"', () => {
        viewer.measuringTool.startInsertion({ maxMarkers: 3, name: 'Angle' });
        flushTimers();
        expect(gestures.activeKind).toBe('other');
    });

    it('starting another measure ends the one being drawn with its points', () => {
        gestures.start('distance');
        flushTimers();
        click(0, 0); click(2, 0);
        gestures.start('area');
        flushTimers();
        expect(coords(measures[0])).toEqual([[0, 0, 0], [2, 0, 0]]);
        expect(gestures.activeKind).toBe('area');
    });

    it('a measure removed by something else (undo, the delete tool) ends the drawing', () => {
        gestures.start('distance');
        flushTimers();
        click(0, 0); click(2, 0);
        viewer.scene.removeMeasurement(measures[0]);
        expect(gestures.activeKind).toBeNull();
    });
});

describe('the pan of the right button while a measure is drawn', () => {
    beforeEach(() => { gestures.start('distance'); flushTimers(); });

    it('pans the camera, and the next click places its point where it is made', () => {
        click(0, 0); click(3, 4);
        drag(2, [100, 100], [115, 100], [130, 100]);
        // The controls had the drag: 30 px to the right, in two moves
        expect(controls.pans).toEqual([15, 15]);
        expect(gestures.activeKind).toBe('distance');
        // The marker follows the pointer again: the click at (6, 8) is a point at (6, 8), not where the drag ended
        click(6, 8);
        key('Enter');
        expect(coords(measures[0])).toEqual([[0, 0, 0], [3, 4, 0], [6, 8, 0]]);
    });

    it('a height: the pan between its two clicks keeps the second one where it is clicked', () => {
        gestures.start('height');
        flushTimers();
        click(1, 1, 0);
        flushTimers();
        drag(2, [50, 50], [90, 50]);
        expect(controls.pans).toEqual([40]);
        click(1, 1, 7);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[1])).toEqual([[1, 1, 0], [1, 1, 7]]);
    });
});

describe('the double click of a measure', () => {
    it('ends it and does not fly the camera; nothing else on the canvas hears it', () => {
        const other = vi.fn();
        canvas.addEventListener('dblclick', other);
        gestures.start('distance');
        flushTimers();
        click(0, 0);
        click(5, 5); click(5, 5);
        fire('dblclick', { clientX: 5, clientY: 5 });
        expect(coords(measures[0])).toEqual([[0, 0, 0], [5, 5, 0]]);
        expect(controls.zooms).toEqual([]);
        expect(other).not.toHaveBeenCalled();
        // With no measure drawn the double click is the view's again
        fire('dblclick', { clientX: 9, clientY: 9 });
        expect(controls.zooms).toEqual([[9, 9]]);
        expect(other).toHaveBeenCalledTimes(1);
        canvas.removeEventListener('dblclick', other);
    });

    it('with a point too few, the measure goes on and the camera still stays', () => {
        gestures.start('distance');
        flushTimers();
        click(0, 0);
        fire('dblclick', { clientX: 0, clientY: 0 });
        expect(gestures.activeKind).toBe('distance');
        expect(controls.zooms).toEqual([]);
    });
});

describe('after a measure ends', () => {
    it('the input handler holds nothing: the next drag rotates the camera, and no marker moves', () => {
        gestures.start('distance');
        flushTimers();
        click(0, 0); click(3, 4);
        key('Enter');
        expect(viewer.inputHandler.drag.object).toBeNull();
        drag(0, [10, 10], [30, 10]);
        expect(controls.rotations).toEqual([20]);
        expect(coords(measures[0])).toEqual([[0, 0, 0], [3, 4, 0]]);
    });

    it('also after a right click', () => {
        gestures.start('area');
        flushTimers();
        click(0, 0); click(4, 0); click(4, 3);
        rightClick();
        drag(0, [10, 10], [25, 10]);
        expect(controls.rotations).toEqual([15]);
        expect(coords(measures[0])).toEqual([[0, 0, 0], [4, 0, 0], [4, 3, 0]]);
    });
});

// A finger sends pointer events, then touch events (Potree's input handler hears those): no mouse events at all
describe('a measure drawn with a finger', () => {
    const pointer = (type, x, y, init = {}) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, ...init }));
    const touch = type => canvas.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    /** A tap at a point of the cloud (z the height there) */
    function tap(x, y, z = 0) {
        pointerZ = z;
        pointer('pointerdown', x, y);
        touch('touchstart');
        pointer('pointerup', x, y);
        touch('touchend');
    }
    /** A finger that moves the view: down, a drag of 40 px, up */
    function pan(x = 100, y = 100) {
        pointer('pointerdown', x, y);
        touch('touchstart');
        pointer('pointermove', x + 40, y);
        touch('touchmove');
        pointer('pointerup', x + 40, y);
        touch('touchend');
    }

    it('a tap places a point of a distance where it is made, and the marker follows again for the next tap', () => {
        gestures.start('distance');
        flushTimers();
        tap(1, 1, 5);
        tap(2, 2, 6);
        tap(3, 3, 7);
        expect(measures[0].points).toHaveLength(4);
        expect(viewer.inputHandler.drag.object).toBe(measures[0].spheres.at(-1));
        key('Enter');
        expect(coords(measures[0])).toEqual([[1, 1, 5], [2, 2, 6], [3, 3, 7]]);
    });

    it('a tap places a point, which then ends by itself, at the point of the cloud under the finger and not at the origin', () => {
        gestures.start('point');
        flushTimers();
        tap(30, 40, 9);
        flushTimers();
        expect(coords(measures[0])).toEqual([[30, 40, 9]]);
        expect(gestures.activeKind).toBeNull();
    });

    it('a height ends with its second tap', () => {
        gestures.start('height');
        flushTimers();
        tap(1, 1, 0);
        flushTimers();
        expect(gestures.activeKind).toBe('height');
        tap(1, 1, 8);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(measures[0])).toEqual([[1, 1, 0], [1, 1, 8]]);
    });

    it('Done on a Point nobody placed ends the tool and keeps nothing: the marker at the origin is not a placement', () => {
        gestures.start('point');
        flushTimers();
        // The finger only moved the view: Potree let go of the marker, which stays where it began
        pan();
        expect(gestures.placed(measures[0])).toBe(0);
        expect(gestures.finish({ dropShort: false })).toBe(true);
        expect(gestures.activeKind).toBeNull();
        expect(discarded).toEqual([measures[0]]);
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('Done on a Distance with one tap placed ends nothing (two points are needed), and with two keeps them', () => {
        gestures.start('distance');
        flushTimers();
        tap(1, 1);
        expect(gestures.finish({ dropShort: false })).toBe(false);
        tap(5, 5);
        expect(gestures.finish({ dropShort: false })).toBe(true);
        expect(coords(measures[0])).toEqual([[1, 1, 0], [5, 5, 0]]);
    });

    it('a tap on no point of the cloud places nothing and keeps the marker in hand', () => {
        gestures.start('distance');
        flushTimers();
        tap(1, 1, 2);
        pointerMisses = true;
        tap(50, 50);
        pointerMisses = false;
        expect(measures[0].points).toHaveLength(2);
        expect(viewer.inputHandler.drag.object).toBe(measures[0].spheres.at(-1));
        tap(4, 4, 3);
        key('Enter');
        expect(coords(measures[0])).toEqual([[1, 1, 2], [4, 4, 3]]);
    });

    it('a drag of the view between taps places nothing, and the next tap places its point where it is made', () => {
        gestures.start('distance');
        flushTimers();
        tap(1, 1);
        pan();
        expect(measures[0].points).toHaveLength(2);
        expect(viewer.inputHandler.drag.object).toBe(measures[0].spheres.at(-1));
        tap(6, 8);
        key('Enter');
        expect(coords(measures[0])).toEqual([[1, 1, 0], [6, 8, 0]]);
    });

    it('a pinch of two fingers places nothing', () => {
        gestures.start('distance');
        flushTimers();
        pointer('pointerdown', 10, 10, { pointerId: 1 });
        touch('touchstart');
        pointer('pointerdown', 20, 20, { pointerId: 2 });
        pointer('pointerup', 10, 10, { pointerId: 1 });
        pointer('pointerup', 20, 20, { pointerId: 2 });
        touch('touchend');
        expect(measures[0].points).toHaveLength(1);
        expect(viewer.inputHandler.drag.object).toBe(measures[0].spheres[0]);
    });

    // An Apple Pencil or a pen on Android is a 'pen' that sends touch events: Potree's touchstart lets go of the marker
    it('a tap of a stylus that sends touch events places a point', () => {
        gestures.start('point');
        flushTimers();
        pointerZ = 4;
        pointer('pointerdown', 12, 14, { pointerType: 'pen' });
        touch('touchstart');
        pointer('pointerup', 12, 14, { pointerType: 'pen' });
        touch('touchend');
        flushTimers();
        expect(coords(measures[0])).toEqual([[12, 14, 4]]);
        expect(gestures.activeKind).toBeNull();
    });

    // A pen on Windows is a 'pen' that sends mouse events, which place the point as a mouse does
    it('a tap of a pen that sends mouse events places one point', () => {
        gestures.start('distance');
        flushTimers();
        const penTap = (x, y, z) => {
            pointerZ = z;
            pointer('pointermove', x, y, { pointerType: 'pen' });
            fire('mousemove', { clientX: x, clientY: y, buttons: 0 });
            pointer('pointerdown', x, y, { pointerType: 'pen' });
            fire('mousedown', { clientX: x, clientY: y, buttons: 1 });
            pointer('pointerup', x, y, { pointerType: 'pen' });
            fire('mouseup', { clientX: x, clientY: y });
        };
        penTap(7, 9, 2);
        // The placed point and the marker that follows the pointer: one point per tap
        expect(measures[0].points).toHaveLength(2);
        penTap(20, 21, 3);
        key('Enter');
        expect(coords(measures[0])).toEqual([[7, 9, 2], [20, 21, 3]]);
    });

    it('a touch that is cancelled places nothing and gives the marker back', () => {
        gestures.start('distance');
        flushTimers();
        pointer('pointerdown', 10, 10);
        touch('touchstart');
        pointer('pointercancel', 10, 10);
        expect(measures[0].points).toHaveLength(1);
        expect(viewer.inputHandler.drag.object).toBe(measures[0].spheres[0]);
    });

    it('leaves the pointer events of a mouse alone: a click places one point, not two', () => {
        gestures.start('distance');
        flushTimers();
        const mouse = (type, x, y) => pointer(type, x, y, { pointerType: 'mouse' });
        pointerZ = 0;
        fire('mousemove', { clientX: 5, clientY: 5, buttons: 0 });
        mouse('pointerdown', 5, 5);
        fire('mousedown', { clientX: 5, clientY: 5, buttons: 1 });
        mouse('pointerup', 5, 5);
        fire('mouseup', { clientX: 5, clientY: 5 });
        expect(measures[0].points).toHaveLength(2);
    });

    it('does nothing with no measure being drawn', () => {
        tap(1, 1);
        pan();
        expect(measures).toEqual([]);
        expect(viewer.inputHandler.drag).toBeNull();
    });
});

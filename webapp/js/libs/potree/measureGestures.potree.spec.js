/**
 * The gesture rule of the measures with the real measuring tool and input handler of the vendored Potree: a point counts as
 * placed only when a release put it on the cloud. Potree adds a measure to the scene as soon as it starts, with a marker at
 * the origin of the coordinates that follows the pointer; a finger never moves it (Potree's touchstart lets go of it), and a
 * click where no point of the cloud is drops it where it is. Such a marker is not a point of the measure: Done, a right click
 * or Save never keeps it, so no measure ends up at the origin of the CRS, thousands of kilometres from the cloud.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadPotree } from './potreeLibs.fixtures';
import { createMeasuringViewer, inputOn } from './potreeMeasuring.fixtures';
import { PotreeMeasureGestures } from './measureGestures';

beforeAll(() => { loadPotree({ internals: ['InputHandler'] }); });

let viewer;
let cloud;
let input;
let gestures;
let tracked;
let timers;
const flushTimers = () => timers.splice(0).forEach(fn => fn());
const coords = measure => measure.points.map(p => p.position.toArray());
const atOrigin = () => viewer.scene.measurements.filter(m => m.points.some(p => p.position.x === 0 && p.position.y === 0 && p.position.z === 0));

beforeEach(() => {
    let canvas;
    ({ viewer, canvas, cloud } = createMeasuringViewer());
    input = inputOn(canvas);
    tracked = [];
    timers = [];
    gestures = new PotreeMeasureGestures({
        viewer,
        session: { track: (target, type, fn, options) => { target.addEventListener(type, fn, options); tracked.push([target, type, fn, options]); } },
        later: fn => timers.push(fn)
    });
    // The cloud lies 500 m away from the origin of its coordinates, as a cloud in a UTM zone does
    cloud.at = (x, y) => ({ x: 500 + x, y: 500 + y, z: 10 });
});
afterEach(() => {
    tracked.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options));
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a point with the real Potree', () => {
    beforeEach(() => { gestures.start('point'); flushTimers(); });

    it('starts as Potree does: in the scene at once, with a marker at the origin that follows the pointer', () => {
        expect(viewer.scene.measurements).toHaveLength(1);
        expect(coords(viewer.scene.measurements[0])).toEqual([[0, 0, 0]]);
        expect(gestures.activeKind).toBe('point');
    });

    it('Done with no point placed ends the tool and keeps nothing', () => {
        expect(gestures.finish({ dropShort: false })).toBe(true);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('Done after a touch that only moved the view ends the tool and keeps nothing', () => {
        input.swipe([100, 100], [300, 200]);
        expect(gestures.activeKind).toBe('point');
        gestures.finish({ dropShort: false });
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('a right click, or another tool that starts, with no point placed keeps nothing at the origin', () => {
        input.rightClick(10, 10);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);

        gestures.start('point'); flushTimers();
        // The clip tools end the measure being drawn as a right click does
        gestures.finish({ dropShort: true });
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('a tap on the cloud places the point under the finger, and the tool ends with it', () => {
        input.tap(206, 460);
        flushTimers();
        expect(viewer.scene.measurements).toHaveLength(1);
        expect(coords(viewer.scene.measurements[0])).toEqual([[706, 960, 10]]);
        expect(gestures.activeKind).toBeNull();
    });

    it('a tap where no point of the cloud is places nothing: Done then keeps nothing', () => {
        cloud.at = () => null;
        input.tap(206, 460);
        flushTimers();
        expect(gestures.activeKind).toBe('point');
        gestures.finish({ dropShort: false });
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('a click where no point of the cloud is places nothing: the marker still follows the pointer, and the next click on the cloud places it', () => {
        cloud.at = () => null;
        input.click(50, 50);
        flushTimers();
        expect(gestures.activeKind).toBe('point');
        expect(atOrigin()).toHaveLength(1);
        expect(viewer.inputHandler.drag?.object).toBe(viewer.scene.measurements[0].spheres[0]);

        cloud.at = (x, y) => ({ x: 500 + x, y: 500 + y, z: 10 });
        input.click(60, 70);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(viewer.scene.measurements[0])).toEqual([[560, 570, 10]]);
    });

    it('a click on the cloud places it, as Potree does', () => {
        input.click(20, 30);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(viewer.scene.measurements[0])).toEqual([[520, 530, 10]]);
    });
});

describe('a distance and a height with the real Potree', () => {
    it('Done on a distance with no point placed ends it and keeps nothing; with one point it goes on', () => {
        gestures.start('distance'); flushTimers();
        gestures.finish({ dropShort: false });
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);

        gestures.start('distance'); flushTimers();
        input.tap(10, 10);
        expect(gestures.finish({ dropShort: false })).toBe(false);
        expect(gestures.activeKind).toBe('distance');
        input.tap(40, 50);
        expect(gestures.finish({ dropShort: false })).toBe(true);
        expect(coords(viewer.scene.measurements[0])).toEqual([[510, 510, 10], [540, 550, 10]]);
        expect(atOrigin()).toEqual([]);
    });

    it('a distance whose first click was where no point of the cloud is has no point at the origin', () => {
        gestures.start('distance'); flushTimers();
        cloud.at = () => null;
        input.click(5, 5);
        cloud.at = (x, y) => ({ x: 500 + x, y: 500 + y, z: 10 });
        input.click(10, 10);
        input.click(40, 50);
        input.rightClick(40, 50);
        expect(gestures.activeKind).toBeNull();
        expect(coords(viewer.scene.measurements[0])).toEqual([[510, 510, 10], [540, 550, 10]]);
    });

    it('a height ended by a right click after its first point keeps no point that only followed the pointer', () => {
        gestures.start('height'); flushTimers();
        input.click(10, 10);
        input.move(80, 90);
        input.rightClick(80, 90);
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('a height placed with two taps keeps both, and ends', () => {
        gestures.start('height'); flushTimers();
        input.tap(10, 10);
        input.tap(80, 90);
        flushTimers();
        expect(gestures.activeKind).toBeNull();
        expect(coords(viewer.scene.measurements[0])).toEqual([[510, 510, 10], [580, 590, 10]]);
    });
});

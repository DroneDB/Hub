/**
 * Edit mode of the measure control: on every measurement (the toolbar's Edit), or on the features it is given (the
 * stockpile panel's Edit outline, which edits one pile); the owner is told when the user changed a geometry (a vertex,
 * a move, an undo) and when the mode ends.
 *
 * The map is rendered at 400 x 300 px, one map unit per pixel, centred on [0, 0]: the pixel [x, y] is the coordinate
 * [x - 200, 150 - y]. Its measurement layer is not drawn (there is no canvas to draw on), so the pointer reaches the
 * vertices (Modify finds them in the source) and the end of a move of a whole feature is told by the interaction itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Collection from 'ol/Collection';
import { Polygon } from 'ol/geom';
import { TranslateEvent } from 'ol/interaction/Translate';
import MeasureControls from './measureControl';
import { _resetPrefListenersForTests } from '@/libs/preferences';

let control;
let map;
let onFeatureModified;
let onExit;

const square = (id, [x, y]) => {
    const f = new Feature(new Polygon([[[x, y], [x + 50, y], [x + 50, y + 50], [x, y + 50], [x, y]]]));
    f.setProperties({ id, measurementType: 'stockpile', netVolume: 10, unitSystem: 'metric' });
    return f;
};
// Two piles apart: the corners of A are at x -100 and -50, those of B at x 50 and 100
let pileA;
let pileB;

const pixel = ([x, y]) => [x + 200, 150 - y];
const ptr = (type, [x, y], button, buttons, extra = {}) => map.getViewport().dispatchEvent(new PointerEvent(type, {
    pointerId: 1, isPrimary: true, pointerType: 'mouse', button, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true, ...extra
}));
/** Press on a map coordinate, move to another and release: a drag of a vertex */
const drag = (from, to, extra = {}) => {
    const start = pixel(from);
    const end = pixel(to);
    ptr('pointermove', start, -1, 0, extra);
    ptr('pointerdown', start, 0, 1, extra);
    ptr('pointermove', end, -1, 1, extra);
    ptr('pointermove', pixel([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), -1, 1, extra);
    ptr('pointermove', end, -1, 1, extra);
    ptr('pointerup', end, 0, 0, extra);
    vi.advanceTimersByTime(300);
};
/** The interaction's own end of a move of a whole feature */
const movedWhole = feature => control.translateInteraction.dispatchEvent(
    new TranslateEvent('translateend', new Collection([feature]), [0, 0], [0, 0], undefined));
const cornersOf = feature => feature.getGeometry().getCoordinates()[0].slice(0, 4).map(c => c.map(Math.round));

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onFeatureModified = vi.fn();
    onExit = vi.fn();
    control = new MeasureControls({ onFeatureModified });
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [0, 0], resolution: 1 }) });
    map.setSize([400, 300]);
    map.getViewport().getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON() {} });
    control.setMap(map);
    pileA = square('a', [-100, -50]);
    pileB = square('b', [50, -50]);
    control.source.addFeatures([pileA, pileB]);
    map.renderSync();
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
    vi.useRealTimers();
    _resetPrefListenersForTests();
});

describe('edit mode on every measurement (the toolbar)', () => {
    it('moves a vertex of any of them, and tells the owner which feature changed', () => {
        control.enableEditMode(map);
        drag([-100, -50], [-120, -70]);
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
        expect(onFeatureModified.mock.calls[0][0]).toBe(pileA);
        expect(cornersOf(pileA)[0]).toEqual([-120, -70]);

        drag([50, -50], [30, -70]);
        expect(onFeatureModified.mock.calls[1][0]).toBe(pileB);
        expect(cornersOf(pileB)[0]).toEqual([30, -70]);
    });

    it('tells the owner when a feature is moved whole (the end of the translate)', () => {
        control.enableEditMode(map);
        movedWhole(pileA);
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
        expect(onFeatureModified.mock.calls[0][0]).toBe(pileA);
    });

    it('tells the owner when a change is undone, with the geometry it had before', () => {
        control.enableEditMode(map);
        drag([-100, -50], [-120, -70]);
        onFeatureModified.mockClear();
        control.undo();
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
        expect(onFeatureModified.mock.calls[0][0]).toBe(pileA);
        expect(cornersOf(pileA)[0]).toEqual([-100, -50]);
    });
});

describe('edit mode on given features (Edit outline of a pile)', () => {
    it('edits the vertices of those features only', () => {
        control.enableEditMode(map, { features: [pileA] });
        drag([50, -50], [30, -70]);
        // B is not editable: its corner stays and nobody is told
        expect(cornersOf(pileB)[0]).toEqual([50, -50]);
        expect(onFeatureModified).not.toHaveBeenCalled();

        drag([-100, -50], [-120, -70]);
        expect(cornersOf(pileA)[0]).toEqual([-120, -70]);
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
        expect(onFeatureModified.mock.calls[0][0]).toBe(pileA);
    });

    it('tells the owner when one of them is moved whole', () => {
        control.enableEditMode(map, { features: [pileA] });
        movedWhole(pileA);
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
        expect(onFeatureModified.mock.calls[0][0]).toBe(pileA);
    });

    it('adds a vertex where the middle of an edge is dragged', () => {
        control.enableEditMode(map, { features: [pileA] });
        // The middle of the bottom edge of A
        drag([-75, -50], [-75, -80]);
        expect(pileA.getGeometry().getCoordinates()[0]).toHaveLength(6);
        expect(onFeatureModified).toHaveBeenCalledTimes(1);
    });

    it('says how in the help of the map', () => {
        control.helpTooltipElement = document.createElement('div');
        control.enableEditMode(map, { features: [pileA] });
        expect(control.helpTooltipElement.innerHTML).toContain('Alt+click removes a vertex');
    });

    it('tells the one that started it, once, when it ends (Esc, the toolbar, the map going away)', () => {
        control.enableEditMode(map, { features: [pileA], onExit });
        expect(onExit).not.toHaveBeenCalled();
        control.disableEditMode();
        expect(onExit).toHaveBeenCalledTimes(1);
        control.disableEditMode();
        expect(onExit).toHaveBeenCalledTimes(1);

        // The next edit mode, whoever starts it, does not call the first one's callback
        control.enableEditMode(map);
        control.disableEditMode();
        expect(onExit).toHaveBeenCalledTimes(1);

        control.enableEditMode(map, { features: [pileA], onExit });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(onExit).toHaveBeenCalledTimes(2);
        expect(control.isEditMode).toBe(false);
    });
});

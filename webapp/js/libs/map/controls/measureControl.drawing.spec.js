/**
 * The measure tools run in the shared drawing session (FR-MAP-14, D-027): Esc and Stop Measuring cancel the
 * measurement in progress (nothing is added), a right click, Enter and a double click finish it, a right-drag does
 * not, and the sketch leaves no feature without a measurementType.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Draw from 'ol/interaction/Draw';
import MeasureControls from './measureControl';

let control;
let map;

beforeEach(() => {
    control = new MeasureControls({});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [1000, 2000], zoom: 10 }) });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

const drawOf = () => map.getInteractions().getArray().find(i => i instanceof Draw);
const key = (k, on = document.body) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const pointer = (type, x, y, button = 2) => map.getViewport().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true }));
const rightClick = (x = 50, y = 50, upX = x, upY = y) => { pointer('pointerdown', x, y); pointer('pointerup', upX, upY); };
const addPoints = (...points) => points.forEach(p => control.draw.appendCoordinates([p]));
const types = () => control.source.getFeatures().map(f => f.get('measurementType'));

describe('Measure Length', () => {
    beforeEach(() => control.btnLength.click());

    it('Esc after two points: the source has no new feature, and the tool is deselected', () => {
        expect(control.selectedTool).toBe('length');
        addPoints([0, 0], [100, 0], [200, 0]);
        key('Escape');
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(control.selectedTool).toBeNull();
        expect(drawOf()).toBeUndefined();
        expect(control.btnStop.style.display).toBe('none');
    });

    it('Stop Measuring cancels it as Esc does', () => {
        addPoints([0, 0], [100, 0]);
        control.btnStop.click();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(control.selectedTool).toBeNull();
        expect(drawOf()).toBeUndefined();
    });

    it('right click after two points: one feature, a length', () => {
        addPoints([0, 0], [100, 0]);
        rightClick();
        expect(types()).toEqual(['length']);
        expect(control.source.getFeatures()[0].getGeometry().getCoordinates()).toEqual([[0, 0], [100, 0]]);
        // The tool stays armed for the next line
        expect(control.selectedTool).toBe('length');
    });

    it('a right-drag of 20 px does not finish it', () => {
        addPoints([0, 0], [100, 0]);
        rightClick(50, 50, 70, 50);
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(control.session.drawing).toBe(true);
    });

    it('Enter finishes it, with the points that were placed', () => {
        addPoints([0, 0], [100, 0], [100, 100]);
        key('Enter');
        expect(types()).toEqual(['length']);
        expect(control.source.getFeatures()[0].getGeometry().getCoordinates()).toEqual([[0, 0], [100, 0], [100, 100]]);
    });

    it('a line of one point is dropped by a right click, and leaves nothing behind', () => {
        addPoints([0, 0]);
        rightClick();
        expect(control.source.getFeatures()).toHaveLength(0);
    });

    it('a line of two equal points (a double click on one spot) leaves no feature without a type', async () => {
        addPoints([0, 0], [0, 0]);
        key('Enter');
        await Promise.resolve();
        expect(control.source.getFeatures()).toHaveLength(0);
    });

    it('Space adds the centre of the view as a point of the line', () => {
        key(' ');
        map.getView().setCenter([1100, 2000]);
        key(' ');
        key('Enter');
        expect(control.source.getFeatures()[0].getGeometry().getCoordinates()).toEqual([[1000, 2000], [1100, 2000]]);
    });

    it('the hint says how to finish and cancel', () => {
        expect(control.session.hint).toContain('Double-click, right-click or Enter finishes');
        expect(control.session.hint).toContain('Esc cancels');
    });
});

describe('Measure Area', () => {
    it('Esc after three points adds nothing, and Stop does the same', () => {
        map.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        control.btnArea.click();
        addPoints([0, 0], [1000, 0], [1000, 1000]);
        key('Escape');
        expect(control.source.getFeatures()).toHaveLength(0);
        control.btnArea.click();
        addPoints([0, 0], [1000, 0], [1000, 1000]);
        control.btnStop.click();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(control.selectedTool).toBeNull();
    });

    it('a right click finishes it: one area', () => {
        map.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        control.btnArea.click();
        addPoints([0, 0], [1000, 0], [1000, 1000]);
        rightClick();
        expect(types()).toEqual(['area']);
    });
});

describe('the tool lock and the other tools', () => {
    it('selecting another tool cancels the shape in progress', () => {
        control.btnLength.click();
        addPoints([0, 0], [100, 0]);
        control.btnArea.click();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(control.selectedTool).toBe('area');
        expect(drawOf()).toBe(control.session.draw);
    });

    it('Esc with no tool armed does nothing', () => {
        key('Escape');
        expect(control.selectedTool).toBeNull();
    });
});

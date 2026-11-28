/**
 * The radius label of Potree's circle measure: the radius of the circle through its three points, in the display unit
 * with its symbol (Potree writes a bare number of the cloud's coordinates). The real Potree draws the measure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadPotree } from './potreeLibs.fixtures';
import { labelCircleRadii, circleRadiusText } from './circleRadiusLabel';

// The sprites of the labels draw their text on a canvas: a context that takes everything and draws nothing (happy-dom
// has no 2D context)
const context2d = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 10 }) : () => {}),
    set: (target, key, value) => { target[key] = value; return true; }
});

let Potree;
let getContext;
beforeAll(() => {
    Potree = loadPotree();
    labelCircleRadii(Potree);
    getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === '2d' ? context2d : getContext.call(this, type, ...args); };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = getContext; });

const FEET = { code: 'ft', unitspermeter: 1 / 0.3048 };
const METRES = { code: 'm', unitspermeter: 1 };

function circle(points, lengthUnit, lengthUnitDisplay) {
    const measure = new Potree.Measure();
    measure.showCircle = true;
    measure.showDistances = false;
    for (const [x, y, z] of points) measure.addMarker(new THREE.Vector3(x, y, z));
    Object.assign(measure, { lengthUnit, lengthUnitDisplay });
    measure.update();
    return measure;
}

describe('the radius label of a circle', () => {
    it('is the radius of the circle Potree draws, in the display unit, named', () => {
        // A circle of 10 ft through three points of a cloud in feet, shown in metres
        const measure = circle([[10, 0, 0], [0, 10, 0], [-10, 0, 0]], FEET, METRES);
        expect(measure.circleRadiusLabel.text).toBe('3.05 m');
        // The same circle in feet
        expect(circle([[10, 0, 0], [0, 10, 0], [-10, 0, 0]], FEET, FEET).circleRadiusLabel.text).toBe('10.00 ft');
    });

    it('is the circle through the three points, not the distance of the first two', () => {
        expect(circle([[5, 0, 0], [0, 5, 0], [-5, 0, 0]], METRES, METRES).circleRadiusLabel.text).toBe('5.00 m');
    });

    it('is no text for a measure that shows no circle, and the wrapping is done once', () => {
        expect(circleRadiusText({ showCircle: false, points: [] }, t => t)).toBeNull();
        expect(circleRadiusText({ showCircle: true, points: [{}, {}] }, t => t)).toBeNull();
        const update = Potree.Measure.prototype.update;
        labelCircleRadii(Potree);
        expect(Potree.Measure.prototype.update).toBe(update);
    });
});

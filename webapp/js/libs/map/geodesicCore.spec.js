/**
 * Lengths and areas of longitude / latitude coordinates on the WGS84 ellipsoid, with no map library.
 * The closed-form values: the quadrant of the meridian is 10,001,965.729 m and the surface of the
 * ellipsoid 510,065,621,724,088.5 m2, of which the triangle equator / 90°E / North Pole is one eighth.
 */
import { describe, it, expect } from 'vitest';
import { normaliseLon, linesLength, polygonArea, lonLatLength, lonLatArea } from './geodesicCore';

const OCTANT = 510065621724088.5 / 8;

/** A small square of about 111 m from its south-west corner, counter-clockwise, closed */
const squareAt = (lon, lat, d = 0.001) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];

describe('normaliseLon', () => {
    it.each([
        [0, 0], [180, 180], [-180, -180], [190, -170], [-190, 170], [540, 180], [-540, -180], [370, 10]
    ])('gives %s as %s', (lon, expected) => {
        expect(normaliseLon(lon)).toBe(expected);
    });
});

describe('lonLatLength', () => {
    it('measures the quadrant of the WGS84 meridian from the equator to the pole', () => {
        expect(lonLatLength([[0, 0], [0, 90]])).toBeCloseTo(10001965.729, 3);
    });

    it('sums the segments of a line and the lines of several', () => {
        const a = lonLatLength([[0, 0], [0, 45]]);
        const b = lonLatLength([[0, 45], [0, 90]]);
        expect(lonLatLength([[0, 0], [0, 45], [0, 90]])).toBeCloseTo(a + b, 6);
        expect(lonLatLength([[[0, 0], [0, 45]], [[0, 45], [0, 90]]])).toBeCloseTo(a + b, 6);
        expect(linesLength([[[0, 0], [0, 45]], [[0, 45], [0, 90]]])).toBeCloseTo(a + b, 6);
    });

    it('measures a line over the antimeridian the same with longitudes past 180 and as -180..180', () => {
        const past = lonLatLength([[179.99, 10], [180.01, 10]]);
        expect(past).toBeCloseTo(lonLatLength([[179.99, 10], [-179.99, 10]]), 6);
        expect(past).toBeLessThan(2500);
    });

    it('leaves out positions that are not finite numbers', () => {
        expect(lonLatLength([[0, 0], [NaN, 5], [0, 90], [0, Infinity]])).toBeCloseTo(10001965.729, 3);
    });

    it('is 0 for fewer than two positions and for anything that is not coordinates', () => {
        for (const input of [[], [[0, 0]], [[]], null, undefined, 'line', {}]) {
            expect(lonLatLength(input)).toBe(0);
        }
    });
});

describe('lonLatArea', () => {
    it('measures one eighth of the ellipsoid for the triangle equator / 90°E / North Pole', () => {
        expect(lonLatArea([[0, 0], [90, 0], [0, 90]])).toBeCloseTo(OCTANT, -1);
    });

    it('does not depend on the winding nor on a duplicated closing vertex', () => {
        const square = squareAt(9, 56);
        const area = lonLatArea(square);
        expect(area).toBeGreaterThan(6000);
        expect(lonLatArea(square.slice().reverse())).toBeCloseTo(area, 6);
        expect(lonLatArea(square.slice(0, -1))).toBeCloseTo(area, 6);
    });

    it('takes the holes of a polygon off its outer ring, whatever their winding', () => {
        const outer = squareAt(9, 56, 0.002);
        const hole = squareAt(9.0005, 56.0005, 0.001);
        const expected = lonLatArea(outer) - lonLatArea(hole);
        expect(lonLatArea([outer, hole])).toBeCloseTo(expected, 6);
        expect(lonLatArea([outer, hole.slice().reverse()])).toBeCloseTo(expected, 6);
        expect(polygonArea([outer, hole])).toBeCloseTo(expected, 6);
    });

    it('measures the same area one world to the east (longitudes past 180 are normalised)', () => {
        const square = squareAt(9, 56);
        expect(lonLatArea(square.map(([lon, lat]) => [lon + 360, lat]))).toBeCloseTo(lonLatArea(square), 6);
    });

    it('measures a square over the antimeridian like the same square far from it', () => {
        const over = squareAt(179.9995, 10);
        expect(lonLatArea(over)).toBeCloseTo(lonLatArea(squareAt(9, 10)), 3);
    });

    it('is 0 for fewer than three distinct positions and for anything that is not coordinates', () => {
        for (const input of [[], [[0, 0], [1, 1], [0, 0]], [[[0, 0], [1, 1]]], null, undefined, 'ring', {}]) {
            expect(lonLatArea(input)).toBe(0);
        }
        expect(polygonArea([])).toBe(0);
    });
});

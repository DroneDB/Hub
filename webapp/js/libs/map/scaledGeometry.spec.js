/**
 * Lengths, areas, radii and angles of measured points, each axis scaled to the unit of the result first.
 */
import { describe, it, expect } from 'vitest';
import { pathLength, groundArea, surfaceArea, circumradius, angleAt, heightDifference } from './scaledGeometry';

const FT_US = 1200 / 3937;

describe('scaledGeometry', () => {
    it('measures a path in 3-D, each axis in its unit', () => {
        expect(pathLength([[0, 0, 0], [3, 4, 0], [3, 4, 12]])).toBe(17);
        expect(pathLength([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }], [1, 1, FT_US])).toBeCloseTo(30.48006, 5);
    });

    it('measures the ground area (x and y) and the area of a sloped surface', () => {
        const square = [[0, 0, 0], [10, 0, 0], [10, 10, 10], [0, 10, 10]];
        expect(groundArea(square)).toBe(100);
        expect(surfaceArea(square)).toBeCloseTo(100 * Math.SQRT2, 9);
        // The same slope with its heights in feet: 10 m up is 32.8 ft
        expect(surfaceArea(square.map(([x, y, z]) => [x, y, z / FT_US]), [1, 1, FT_US])).toBeCloseTo(100 * Math.SQRT2, 9);
        // A closed ring (its first point again at the end) has the same area
        expect(surfaceArea([...square, square[0]])).toBeCloseTo(100 * Math.SQRT2, 9);
    });

    it('gives the radius of the circle through three points, 0 on a line', () => {
        expect(circumradius([5, 0, 0], [0, 5, 0], [-5, 0, 0])).toBeCloseTo(5, 12);
        expect(circumradius([1, 2, 3], [4, 5, 6], [7, 8, 9])).toBe(0);
    });

    it('gives the angle at a vertex, in degrees', () => {
        expect(angleAt([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90, 12);
        expect(angleAt([0, 0, 0], [0, 0, 0], [0, 1, 0])).toBe(0);
        // 1 m across and 3.28 ft up is 45 degrees once the heights are in metres
        expect(angleAt([1, 0, 0], [0, 0, 0], [1, 0, 1 / FT_US], [1, 1, FT_US])).toBeCloseTo(45, 9);
    });
});

describe('heightDifference', () => {
    it('is the highest z less the lowest, whatever the distance on the ground', () => {
        expect(heightDifference([[0, 0, 10], [6, 8, 12.5]])).toBe(2.5);
        expect(heightDifference([[6, 8, 12.5], [0, 0, 10], [100, 0, 11]])).toBe(2.5);
    });

    it('scales the heights to the unit of the frame, and is 0 with no points', () => {
        expect(heightDifference([[0, 0, 0], [0, 0, 100]], [1, 1, 0.3048])).toBeCloseTo(30.48, 9);
        expect(heightDifference([])).toBe(0);
    });
});

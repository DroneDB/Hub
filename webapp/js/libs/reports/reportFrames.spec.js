/**
 * Where a report snapshot looks: the extent of what it draws and its frame.
 */
import { describe, it, expect } from 'vitest';
import { extentOf, frameOf, FRAME_PADDING, MIN_FRAME_METRES } from './reportFrames';

describe('extentOf', () => {
    it('is the bounding box of the positions of every geometry', () => {
        const geometries = [
            { type: 'Point', coordinates: [9, 45] },
            { type: 'LineString', coordinates: [[8, 44, 100], [10, 46, 5]] },
            { type: 'Polygon', coordinates: [[[9, 45], [11, 45], [11, 47], [9, 45]]] }
        ];
        expect(extentOf(geometries)).toEqual([8, 44, 11, 47]);
    });

    it('is null when there is no position', () => {
        expect(extentOf([])).toBeNull();
        expect(extentOf([null, { type: 'Point', coordinates: [] }])).toBeNull();
    });
});

describe('frameOf', () => {
    it('adds 25 % of the extent on each side', () => {
        const [west, south, east, north] = /** @type {number[]} */ (frameOf([9, 45, 9.01, 45.01]));
        expect(east - west).toBeCloseTo(0.01 * (1 + 2 * FRAME_PADDING), 9);
        expect(north - south).toBeCloseTo(0.01 * (1 + 2 * FRAME_PADDING), 9);
        expect((west + east) / 2).toBeCloseTo(9.005, 9);
    });

    it('is at least 40 m wide and high on the ground: a point gets a square of 40 m', () => {
        const [west, south, east, north] = /** @type {number[]} */ (frameOf([9, 45, 9, 45]));
        expect((north - south) * 111320).toBeCloseTo(MIN_FRAME_METRES, 6);
        expect((east - west) * 111320 * Math.cos((45 * Math.PI) / 180)).toBeCloseTo(MIN_FRAME_METRES, 6);
    });

    it('stays on the map near the poles', () => {
        const frame = /** @type {number[]} */ (frameOf([0, 85.05, 0.0001, 85.0511]));
        expect(frame[3]).toBeLessThanOrEqual(85.0511287798);
    });

    it('is null without an extent', () => {
        expect(frameOf(null)).toBeNull();
    });
});

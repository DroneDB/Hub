/**
 * The fit options of the maps: the pins of the dataset locations keep their closest scale, the files of a map do not.
 */
import { describe, it, expect } from 'vitest';
import { transformExtent } from 'ol/proj';
import { FIT_OPTIONS, FILE_FIT_OPTIONS, POINT_FIT_MIN_RESOLUTION, overviewFitPadding, bboxExtent } from './mapUtils';

describe('the fit options of a map', () => {
    it('stop a cluster of pins at half a metre per pixel', () => {
        expect(FIT_OPTIONS).toEqual({ padding: [40, 40, 40, 40], duration: 500, minResolution: 0.5, maxZoom: 22 });
    });

    it('have the same room and animation for files, and no minimum resolution', () => {
        expect(FILE_FIT_OPTIONS).toEqual({ padding: [40, 40, 40, 40], duration: 500, maxZoom: 22 });
        expect(FILE_FIT_OPTIONS).not.toHaveProperty('minResolution');
        expect(POINT_FIT_MIN_RESOLUTION).toBe(0.5);
    });
});

describe('overviewFitPadding', () => {
    it('leaves 10% of the map on every side, plus the rail on the right and the controls at the bottom', () => {
        expect(overviewFitPadding([1000, 500], { rail: 64, bottom: 64 })).toEqual([50, 164, 114, 100]);
        expect(overviewFitPadding([390, 600], { rail: 56, bottom: 48 })).toEqual([60, 95, 108, 39]);
    });
});

describe('bboxExtent', () => {
    it('is the box in Web Mercator', () => {
        const [a, b, c, d] = bboxExtent([10, 40, 12, 42]);
        const expected = transformExtent([10, 40, 12, 42], 'EPSG:4326', 'EPSG:3857');
        expect([a, b, c, d]).toEqual(expected);
    });

    it('stays finite at the poles', () => {
        expect(bboxExtent([-180, -90, 180, 90]).every(Number.isFinite)).toBe(true);
    });

    it('keeps a layer of the whole world (down to the South Pole) inside the square world of Web Mercator', () => {
        // The countries of the world: -180, -90 to 180, 83.6
        const [minX, minY, maxX, maxY] = bboxExtent([-180, -90, 180, 83.6]);
        const half = 20037508.342789244;
        expect(minX).toBeCloseTo(-half, 0);
        expect(maxX).toBeCloseTo(half, 0);
        expect(minY).toBeCloseTo(-half, 0);
        expect(maxY).toBeLessThan(half);
        // Its middle is near the equator, not in the Southern Ocean
        expect(Math.abs((minY + maxY) / 2)).toBeLessThan(half * 0.05);
    });
});

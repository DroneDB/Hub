/**
 * The fit options of the maps (FR-MAP-28): the pins of the dataset locations keep their closest scale, the files of a map do not.
 */
import { describe, it, expect } from 'vitest';
import { FIT_OPTIONS, FILE_FIT_OPTIONS, POINT_FIT_MIN_RESOLUTION, overviewFitPadding } from './mapUtils';

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

describe('overviewFitPadding (FR-ORG-09)', () => {
    it('leaves 10% of the map on every side, plus the rail on the right and the controls at the bottom', () => {
        expect(overviewFitPadding([1000, 500], { rail: 64, bottom: 64 })).toEqual([50, 164, 114, 100]);
        expect(overviewFitPadding([390, 600], { rail: 56, bottom: 48 })).toEqual([60, 95, 108, 39]);
    });
});

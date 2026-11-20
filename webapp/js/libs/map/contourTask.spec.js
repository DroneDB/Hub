/**
 * The contour lines as a task (FR-RAS-11): the parameters of the task, the estimate of the levels (the warning above 50 of
 * them) and what a result cut at the cap of the server says. Expected values are written by hand: the Hat Creek mosaic
 * (range 145 to 402) at the default interval of 1 asks for 257 levels.
 */
import { describe, it, expect } from 'vitest';
import {
    CONTOUR_TOOL_ID, CONTOUR_LEVEL_WARNING, contourTaskParams, estimateContourLevels, contourLevelsWarning, contourTruncation
} from './contourTask';

describe('the contour task', () => {
    it('is the tool raster-contours, and warns above 50 levels', () => {
        expect(CONTOUR_TOOL_ID).toBe('raster-contours');
        expect(CONTOUR_LEVEL_WARNING).toBe(50);
    });

    it('takes the options of the dialog as its parameters', () => {
        expect(contourTaskParams({ interval: 5, count: null, baseOffset: 2, minElev: 10, maxElev: null, simplifyTolerance: 0.5 })).toEqual({
            interval: 5, count: null, baseOffset: 2, minElev: 10, maxElev: null, simplifyTolerance: 0.5, bandIndex: 1
        });
        expect(contourTaskParams({ count: 20 })).toEqual({
            interval: null, count: 20, baseOffset: 0, minElev: null, maxElev: null, simplifyTolerance: 0, bandIndex: 1
        });
    });

    it('adds the NoData value and the formula of the layer when it has them', () => {
        expect(contourTaskParams({ interval: 1 }, { nodata: '0', formula: 'CELSIUS' })).toMatchObject({ nodata: 0, formula: 'CELSIUS' });
        const none = contourTaskParams({ interval: 1 }, { nodata: '', formula: null });
        expect(none).not.toHaveProperty('nodata');
        expect(none).not.toHaveProperty('formula');
        expect(contourTaskParams({ interval: 1 }, { nodata: 'abc' })).not.toHaveProperty('nodata');
    });
});

describe('estimateContourLevels', () => {
    const range = { min: 145, max: 402 };

    it('is the range over the interval: 257 levels for an interval of 1, 6 for 50', () => {
        expect(estimateContourLevels({ interval: 1 }, range)).toBe(257);
        expect(estimateContourLevels({ interval: 50 }, range)).toBe(6);
    });

    it('rounds up, so a long run is never taken for a short one', () => {
        expect(estimateContourLevels({ interval: 100 }, range)).toBe(3);
        expect(estimateContourLevels({ interval: 0.5 }, { min: 0, max: 100.2 })).toBe(201);
    });

    it('narrows the range with the elevation limits, never beyond the raster', () => {
        expect(estimateContourLevels({ interval: 1, minElev: 200, maxElev: 300 }, range)).toBe(100);
        expect(estimateContourLevels({ interval: 1, minElev: 0, maxElev: 1000 }, range)).toBe(257);
        expect(estimateContourLevels({ interval: 1, minElev: 300 }, range)).toBe(102);
    });

    it('is the count of a target count', () => {
        expect(estimateContourLevels({ count: 20 }, range)).toBe(20);
        expect(estimateContourLevels({ interval: 0, count: 8.9 }, range)).toBe(8);
    });

    it('cannot be told without an interval and a count, or without a range', () => {
        expect(estimateContourLevels({}, range)).toBeNull();
        expect(estimateContourLevels({ interval: 1 }, {})).toBeNull();
        expect(estimateContourLevels({ interval: 1 }, { min: 5, max: 5 })).toBeNull();
        expect(estimateContourLevels({ interval: 1, minElev: 400, maxElev: 300 }, range)).toBeNull();
    });
});

describe('contourLevelsWarning', () => {
    it('says the levels for more than 50, in the number format of the browser', () => {
        expect(contourLevelsWarning(257)).toContain('About 257 contour levels');
        expect(contourLevelsWarning(1200)).toContain('About 1,200 contour levels');
    });

    it('says the levels asked for in count mode, and asks for fewer levels', () => {
        expect(contourLevelsWarning(51, 'count')).toBe('About 51 contour levels. A large raster can take several minutes, and the result is limited in size. Use fewer levels, or limit the elevation range, to make it faster.');
        expect(contourLevelsWarning(50, 'count')).toBe('');
    });

    it('names the value range of a raster that is not an elevation model (FR-RAS-25)', () => {
        expect(contourLevelsWarning(51, 'count', 'value')).toBe('About 51 contour levels. A large raster can take several minutes, and the result is limited in size. Use fewer levels, or limit the value range, to make it faster.');
        expect(contourLevelsWarning(51, 'interval', 'value')).toBe('About 51 contour levels (the range divided by the interval). A large raster can take several minutes, and the result is limited in size. Use a larger interval, or limit the value range, to make it faster.');
    });

    it('says nothing for 50 or fewer, or for an estimate that cannot be made', () => {
        expect(contourLevelsWarning(50)).toBe('');
        expect(contourLevelsWarning(6)).toBe('');
        expect(contourLevelsWarning(null)).toBe('');
    });
});

describe('contourTruncation', () => {
    it('says the lines are truncated at N lines, N in the number format', () => {
        const cut = contourTruncation({ truncated: true, featureCap: 100000 });
        expect(cut.truncated).toBe(true);
        expect(cut.title).toBe('Contours truncated');
        expect(cut.message).toContain('truncated at 100,000 lines');
    });

    it('says it without a cap when the server gave none', () => {
        expect(contourTruncation({ truncated: true }).message).toContain('truncated at the most lines the server returns');
    });

    it('names the value range of a raster that is not an elevation model (FR-RAS-25)', () => {
        expect(contourTruncation({ truncated: true, featureCap: 100000 }, 'value').message).toBe('The contour lines are truncated at 100,000 lines: the rest of the raster has none. Use a larger interval, or limit the value range, and generate again.');
        expect(contourTruncation({ truncated: true, featureCap: 100000 }).message).toContain('limit the elevation range');
    });

    it('says nothing of a complete result, or of no result', () => {
        expect(contourTruncation({ truncated: false, featureCap: 100000 })).toEqual({ truncated: false, title: '', message: '' });
        expect(contourTruncation({})).toEqual({ truncated: false, title: '', message: '' });
        expect(contourTruncation(null).truncated).toBe(false);
    });
});

/**
 * A pile found by a click is measured from the best-fit plane, a drawn one from the lowest
 * perimeter, and either from the base the user picked.
 */
import { describe, it, expect } from 'vitest';
import { BASE_METHODS, PILE_OUTLINE, baseMethodFor, baseMethodName, isBaseMethod } from './stockpileBase';

describe('baseMethodFor', () => {
    it('is the best-fit plane for a detected pile and the lowest perimeter for a drawn one', () => {
        expect(baseMethodFor(PILE_OUTLINE.DETECTED)).toBe('best_fit');
        expect(baseMethodFor(PILE_OUTLINE.DRAWN)).toBe('lowest_perimeter');
    });

    it('is the base the user picked, whatever the outline', () => {
        expect(baseMethodFor(PILE_OUTLINE.DETECTED, 'lowest_perimeter')).toBe('lowest_perimeter');
        expect(baseMethodFor(PILE_OUTLINE.DRAWN, 'flat')).toBe('flat');
    });

    it('ignores a pick that is not a base', () => {
        expect(baseMethodFor(PILE_OUTLINE.DETECTED, 'auto')).toBe('best_fit');
        expect(baseMethodFor(PILE_OUTLINE.DRAWN, null)).toBe('lowest_perimeter');
    });
});

describe('the base methods', () => {
    it("are libddb's, with the names the Hub shows", () => {
        expect(BASE_METHODS.map(m => m.id)).toEqual(['lowest_perimeter', 'average_perimeter', 'best_fit', 'flat']);
        expect(baseMethodName('best_fit')).toBe('Best-fit plane');
        // The detector's own base is not one the volume can be asked for
        expect(isBaseMethod('auto')).toBe(false);
    });
});

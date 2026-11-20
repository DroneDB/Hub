import { describe, it, expect } from 'vitest';
import { rowsThatFit, pageStart, pageAfterResize, pageSizeOptions, pageSizeChoices, isPageSize, PAGE_SIZE_MIN, PAGE_SIZE_MAX } from './pageSize';

describe('rowsThatFit (FR-XC-34, FR-ORG-25)', () => {
    it('holds the rows that the height holds, with a row of 48 px', () => {
        // 1850 / 48 = 38.5: 38 whole rows
        expect(rowsThatFit({ height: 1850, rowHeight: 48 })).toBe(38);
        expect(rowsThatFit({ height: 480, rowHeight: 48 })).toBe(10);
        expect(rowsThatFit({ height: 528, rowHeight: 48 })).toBe(11);
        expect(rowsThatFit({ height: 527.9, rowHeight: 48 })).toBe(10);
    });

    it('never holds less than 10 rows: a short list scrolls', () => {
        expect(PAGE_SIZE_MIN).toBe(10);
        expect(rowsThatFit({ height: 400, rowHeight: 48 })).toBe(10);
        expect(rowsThatFit({ height: 0, rowHeight: 48 })).toBe(10);
        expect(rowsThatFit({ height: 1850, rowHeight: 0 })).toBe(10);
        expect(rowsThatFit({ height: NaN, rowHeight: 48 })).toBe(10);
    });

    it('never holds more than 100 rows', () => {
        expect(PAGE_SIZE_MAX).toBe(100);
        expect(rowsThatFit({ height: 100000, rowHeight: 48 })).toBe(100);
    });

    it('holds whole grid rows in a card grid: one row has the cards of one grid row', () => {
        // 6 grid rows of 3 cards
        expect(rowsThatFit({ height: 1000, rowHeight: 160, columns: 3 })).toBe(18);
        // 2 grid rows would be 6 cards: 4 rows of 3 are the 10 cards or more
        expect(rowsThatFit({ height: 330, rowHeight: 160, columns: 3 })).toBe(12);
        expect(rowsThatFit({ height: 100000, rowHeight: 160, columns: 3 })).toBe(99);
        expect(rowsThatFit({ height: 1850, rowHeight: 300, columns: 4 })).toBe(24);
    });
});

describe('pageStart and pageAfterResize: the page that holds the first item shown', () => {
    it('rounds the offset of the first item down to the start of its page', () => {
        expect(pageStart(30, 38)).toBe(0);
        expect(pageStart(40, 38)).toBe(38);
        expect(pageStart(76, 38)).toBe(76);
        expect(pageStart(77, 10)).toBe(70);
        expect(pageStart(0, 10)).toBe(0);
        expect(pageStart(-5, 10)).toBe(0);
        expect(pageStart(50, 0)).toBe(0);
    });

    it('has the page number of the new size that holds the first item of the page of the old one', () => {
        // page 3 of 10 starts at item 20: item 20 is on page 1 of 38 and on page 2 of 10
        expect(pageAfterResize(3, 10, 38)).toBe(1);
        // page 3 of 38 starts at item 76: page 8 of 10
        expect(pageAfterResize(3, 38, 10)).toBe(8);
        expect(pageAfterResize(1, 10, 38)).toBe(1);
        expect(pageAfterResize(5, 10, 10)).toBe(5);
        expect(pageAfterResize(4, 25, 50)).toBe(2);
    });
});

describe('pageSizeOptions', () => {
    it('lists the usual sizes with the calculated one and the chosen one, ascending, once', () => {
        expect(pageSizeOptions([10, 25, 50, 100], 38)).toEqual([10, 25, 38, 50, 100]);
        expect(pageSizeOptions([10, 25, 50, 100], 25)).toEqual([10, 25, 50, 100]);
        expect(pageSizeOptions([10, 25, 50, 100], 38, 7)).toEqual([7, 10, 25, 38, 50, 100]);
        expect(pageSizeOptions([5, 10, 25, 50, 100], 10, null)).toEqual([5, 10, 25, 50, 100]);
    });
});

describe('isPageSize', () => {
    it('accepts a whole number of rows from 1 to 100', () => {
        for (const ok of [1, 10, 38, 100]) expect(isPageSize(ok)).toBe(true);
        for (const bad of [0, -1, 101, 2.5, '10', null, undefined, NaN]) expect(isPageSize(bad)).toBe(false);
    });
});

describe('pageSizeChoices (FR-XC-34)', () => {
    it('labels the size that fits "N (fit)" and the others by their number', () => {
        expect(pageSizeChoices([10, 25, 50], 38)).toEqual([
            { value: 10, label: '10' }, { value: 25, label: '25' }, { value: 38, label: '38 (fit)' }, { value: 50, label: '50' }
        ]);
    });

    it('labels a usual size "(fit)" when it is the one that fits, and keeps the size chosen', () => {
        expect(pageSizeChoices([5, 10, 25], 10, 7)).toEqual([
            { value: 5, label: '5' }, { value: 7, label: '7' }, { value: 10, label: '10 (fit)' }, { value: 25, label: '25' }
        ]);
    });
});

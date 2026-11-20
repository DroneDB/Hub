/**
 * The Rescale range of the raster panels (FR-RAS-10, FR-RAS-20, D-025): two numbers typed the way the
 * user's locale writes them, Min below Max, sent as the machine value "min,max".
 */
import { describe, it, expect } from 'vitest';
import { rescaleErrors, rescaleProblem, rescaleValue, splitRescale } from './rescale';

describe('rescaleProblem', () => {
    it('refuses text that is not a number, at the field it is in', () => {
        expect(rescaleErrors('abc', '10')).toEqual({ min: 'Min must be a number', max: null });
        expect(rescaleErrors('1', 'x')).toEqual({ min: null, max: 'Max must be a number' });
        expect(rescaleProblem('abc', '10')).toBe('Min must be a number');
    });

    it('refuses one empty field: both are needed, or neither (the range is then automatic)', () => {
        expect(rescaleErrors('1', '')).toEqual({ min: null, max: 'Enter Max, or empty both fields for an automatic range' });
        expect(rescaleErrors('  ', '5')).toEqual({ min: 'Enter Min, or empty both fields for an automatic range', max: null });
        expect(rescaleProblem('', '')).toBeNull();
        expect(rescaleProblem(null, undefined)).toBeNull();
    });

    it('refuses a Min that is not less than Max', () => {
        expect(rescaleProblem('40', '10')).toBe('Min must be less than Max');
        expect(rescaleProblem('5', '5')).toBe('Min must be less than Max');
        expect(rescaleErrors('1', '-1')).toEqual({ min: 'Min must be less than Max', max: null });
        expect(rescaleProblem('-1', '1')).toBeNull();
    });
});

describe('rescaleValue', () => {
    it('reads "12,5" and "12.5" as the same number, and sends "." (D-025)', () => {
        expect(rescaleValue('0', '12,5')).toBe('0,12.5');
        expect(rescaleValue('0', '12.5')).toBe('0,12.5');
        expect(rescaleValue(' -1,5 ', ' 2,25')).toBe('-1.5,2.25');
    });

    it('is empty for the automatic range, and null for a range that is not valid', () => {
        expect(rescaleValue('', '')).toBe('');
        expect(rescaleValue('abc', '1')).toBeNull();
        expect(rescaleValue('1', '')).toBeNull();
        expect(rescaleValue('40', '10')).toBeNull();
    });
});

describe('splitRescale', () => {
    it('gives the two texts of the machine value, and empty texts for none', () => {
        expect(splitRescale('0.371,0.947')).toEqual({ min: '0.371', max: '0.947' });
        expect(splitRescale('-1, 1')).toEqual({ min: '-1', max: '1' });
        expect(splitRescale('')).toEqual({ min: '', max: '' });
        expect(splitRescale(undefined)).toEqual({ min: '', max: '' });
        expect(splitRescale('5')).toEqual({ min: '5', max: '' });
    });
});

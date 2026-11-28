import { describe, it, expect } from 'vitest';
import { compareText } from './compareText';

describe('compareText', () => {
    it('ignores case and accents', () => {
        expect(compareText('alpha', 'ALPHA')).toBe(0);
        expect(compareText('Élan', 'elan')).toBe(0);
        expect(compareText('Zebra', 'álamo')).toBeGreaterThan(0);
        expect(compareText('Ägir', 'Zed')).toBeLessThan(0);
    });

    it('compares runs of digits as numbers', () => {
        expect(compareText('Client 2', 'Client 10')).toBeLessThan(0);
        expect(compareText('Client 10', 'Client 2')).toBeGreaterThan(0);
        expect(['Client 10', 'Client 1', 'Client 2'].sort(compareText)).toEqual(['Client 1', 'Client 2', 'Client 10']);
    });

    it('reads a missing value as the empty text', () => {
        expect(compareText(null, '')).toBe(0);
        expect(compareText(undefined, 'a')).toBeLessThan(0);
        expect(compareText('a', null)).toBeGreaterThan(0);
    });

    it('compares numbers by their text', () => {
        expect(compareText(2, 10)).toBeLessThan(0);
    });
});

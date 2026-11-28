/**
 * The share of a count in its group, as the summary of a report writes it: a whole percentage that never says a part is
 * nothing or everything.
 */
import { describe, it, expect } from 'vitest';
import { shareText } from './reportTotals';

describe('the share of a count', () => {
    it('is a whole percentage of its group', () => {
        expect(shareText(5, 19)).toBe('26%');
        expect(shareText(10, 19)).toBe('53%');
        expect(shareText(1, 3)).toBe('33%');
        expect(shareText(1, 2)).toBe('50%');
    });

    it('is 100% only for the whole group, and "<1%" for a count above zero that would round to 0%', () => {
        expect(shareText(4, 4)).toBe('100%');
        expect(shareText(999, 1000)).toBe('99%');
        expect(shareText(1, 1000)).toBe('<1%');
        expect(shareText(1, 200)).toBe('1%');
    });

    it('is 0% for a group with no items', () => {
        expect(shareText(0, 0)).toBe('0%');
    });
});

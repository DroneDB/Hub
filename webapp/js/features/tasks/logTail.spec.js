import { describe, it, expect } from 'vitest';
import { droppedHeadLines, lineOffset } from './logTail';

describe('droppedHeadLines', () => {
    it('counts the lines a full tail dropped to make room for new ones', () => {
        expect(droppedHeadLines(['a', 'b', 'c', 'd'], ['c', 'd', 'e', 'f'])).toBe(2);
    });

    it('is 0 when lines were only added, or nothing changed', () => {
        expect(droppedHeadLines(['a', 'b'], ['a', 'b', 'c'])).toBe(0);
        expect(droppedHeadLines(['a', 'b'], ['a', 'b'])).toBe(0);
        expect(droppedHeadLines([], ['a'])).toBe(0);
    });

    it('takes the smallest drop when lines repeat', () => {
        expect(droppedHeadLines(['x', 'x', 'x'], ['x', 'x', 'x', 'y'])).toBe(0);
        expect(droppedHeadLines(['x', 'y', 'x', 'y'], ['x', 'y', 'z'])).toBe(2);
    });

    it('is null when the logs share no line (a log that started again)', () => {
        expect(droppedHeadLines(['a', 'b'], ['c', 'd'])).toBeNull();
        expect(droppedHeadLines(['a', 'b'], [])).toBeNull();
    });
});

describe('lineOffset', () => {
    it('is where a line begins in the text', () => {
        const text = 'ab\n\ncde\nf';
        const lines = text.split('\n');
        expect(lineOffset(lines, 0)).toBe(0);
        expect(lineOffset(lines, 2)).toBe(text.indexOf('cde'));
        expect(lineOffset(lines, 3)).toBe(text.indexOf('f'));
    });
});

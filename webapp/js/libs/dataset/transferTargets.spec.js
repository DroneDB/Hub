import { describe, it, expect } from 'vitest';
import { outermostItems, sameNameGroups, sameNameMessage } from './transferTargets';

const id = p => p;

describe('outermostItems', () => {
    it('drops what is inside another item of the list, at any depth, and keeps a sibling whose name starts the same', () => {
        expect(outermostItems(['a/b/c.jpg', 'a', 'ab/x.jpg', 'a/one.jpg', 'z'], id)).toEqual(['a', 'ab/x.jpg', 'z']);
    });
});

describe('sameNameGroups', () => {
    it('groups items of different folders with one name, letter case ignored as the Registry does', () => {
        expect(sameNameGroups(['a/x.jpg', 'b/X.jpg', 'c/y.jpg', 'x.jpg'], id)).toEqual([['a/x.jpg', 'b/X.jpg', 'x.jpg']]);
        expect(sameNameGroups(['a/x.jpg', 'b/y.jpg'], id)).toEqual([]);
    });

    it('names every clashing item in the message', () => {
        expect(sameNameMessage([['f1/images', 'f2/images'], ['a/x', 'b/x']])).toContain('f1/images, f2/images; a/x, b/x');
    });
});

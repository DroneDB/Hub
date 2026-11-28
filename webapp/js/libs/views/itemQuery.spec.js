import { describe, it, expect } from 'vitest';
import { ITEM_GONE, itemFromQuery } from './itemQuery';

describe('itemFromQuery', () => {
    it('is the id of the item key', () => {
        expect(itemFromQuery({ item: 'a1b2' })).toBe('a1b2');
    });

    it('is the first of a repeated key', () => {
        expect(itemFromQuery({ item: ['first', 'second'] })).toBe('first');
    });

    it('is empty when the address asks for none, or for something that is not an id', () => {
        expect(itemFromQuery({})).toBe('');
        expect(itemFromQuery(undefined)).toBe('');
        expect(itemFromQuery({ item: null })).toBe('');
        expect(itemFromQuery({ item: [null] })).toBe('');
    });
});

describe('ITEM_GONE', () => {
    it('is the notice both viewers show', () => {
        expect(ITEM_GONE).toBe('This item no longer exists');
    });
});

import { describe, it, expect } from 'vitest';
import { readTaskFilters, taskFilterKeys, hasTaskFilters, lastPageSkip } from './taskFilters';

describe('taskFilters', () => {
    it('reads the filters, the page and the order from the query', () => {
        expect(readTaskFilters({ toolId: 'zip', state: 'Failed', userId: 'u1', skip: '50', take: '25', sortField: 'state', sortOrder: 'asc' }))
            .toEqual({ toolId: 'zip', state: 'Failed', userId: 'u1', skip: 50, take: 25, sortField: 'state', sortOrder: 1 });
    });

    it('reads an offset inside a page as the start of that page', () => {
        expect(readTaskFilters({ skip: '7', take: '10' }).skip).toBe(0);
        expect(readTaskFilters({ skip: '27', take: '10' }).skip).toBe(20);
        expect(readTaskFilters({ skip: '20', take: '25' }).skip).toBe(0);
        expect(readTaskFilters({ skip: '1000', take: '50' }).skip).toBe(1000);
    });

    it('keeps the offset as written when no page size is in the address: the page rounds it to the size that fits (FR-XC-34)', () => {
        expect(readTaskFilters({ skip: '27' })).toMatchObject({ skip: 27, take: null });
        // An invalid page size is none
        expect(readTaskFilters({ skip: '35', take: '7' })).toMatchObject({ skip: 35, take: null });
        expect(readTaskFilters({ skip: '35', take: '38' })).toMatchObject({ skip: 35, take: null });
    });

    it('has the start of the last page for a list that ends before the offset', () => {
        expect(lastPageSkip(45, 10)).toBe(40);
        expect(lastPageSkip(40, 10)).toBe(30);
        expect(lastPageSkip(1, 25)).toBe(0);
        expect(lastPageSkip(0, 10)).toBe(0);
    });

    it('has the defaults for an empty or an invalid query', () => {
        const defaults = { toolId: '', state: '', userId: '', skip: 0, take: null, sortField: 'createdAt', sortOrder: -1 };
        expect(readTaskFilters({})).toEqual(defaults);
        expect(readTaskFilters({ skip: '-5', take: '7', sortField: 'path; drop', sortOrder: 'sideways' })).toEqual(defaults);
        expect(readTaskFilters({ toolId: ['a', 'b'] }).toolId).toBe('a');
    });

    it('writes only what is not the default, and a page size only when the user chose one', () => {
        expect(taskFilterKeys({ toolId: '', state: '', userId: '', skip: 0, take: null, sortField: 'createdAt', sortOrder: -1 }))
            .toEqual({ toolId: null, state: null, userId: null, skip: null, take: null, sortField: null, sortOrder: null });
        // The size that fits the height is not in the address; a chosen 10 is
        expect(taskFilterKeys({ toolId: '', state: '', userId: '', skip: 38, take: null, sortField: 'createdAt', sortOrder: -1 }))
            .toMatchObject({ skip: '38', take: null });
        expect(taskFilterKeys({ toolId: '', state: '', userId: '', skip: 0, take: 10, sortField: 'createdAt', sortOrder: -1 }).take).toBe('10');
        expect(taskFilterKeys({ toolId: 'zip', state: 'Failed', userId: '', skip: 10, take: 50, sortField: 'toolId', sortOrder: 1 }))
            .toEqual({ toolId: 'zip', state: 'Failed', userId: null, skip: '10', take: '50', sortField: 'toolId', sortOrder: 'asc' });
    });

    it('says whether a filter hides tasks, not the page or the order', () => {
        expect(hasTaskFilters({ toolId: '', state: '', userId: '' })).toBe(false);
        expect(hasTaskFilters({ toolId: '', state: 'Failed', userId: '' })).toBe(true);
    });
});

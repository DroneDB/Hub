import { describe, it, expect } from 'vitest';
import {
    ORG_SORT_FIELDS, ORG_SORT_OPTIONS, SORT_DIRECTIONS, organizationRow, sortOrganizations
} from './organizationList';

const org = (slug, extra = {}) => ({ slug, name: slug, creationDate: null, lastModified: null, datasetCount: null, ...extra });
const slugs = list => list.map(o => o.slug);

describe('sort fields', () => {
    it('are name, creation date, last modified and dataset count', () => {
        expect(ORG_SORT_FIELDS).toEqual(['name', 'creationDate', 'lastModified', 'datasetCount']);
        expect(ORG_SORT_OPTIONS.map(o => o.value)).toEqual([...ORG_SORT_FIELDS]);
        expect(ORG_SORT_OPTIONS.every(o => o.label)).toBe(true);
        expect(SORT_DIRECTIONS).toEqual(['asc', 'desc']);
    });
});

describe('sortOrganizations by name', () => {
    it('ignores case and accents', () => {
        const list = [org('b', { name: 'banana' }), org('a', { name: 'Árbol' }), org('c', { name: 'Cherry' }), org('d', { name: 'apple' })];
        expect(slugs(sortOrganizations(list, 'name', 'asc'))).toEqual(['d', 'a', 'b', 'c']);
        expect(slugs(sortOrganizations(list, 'name', 'desc'))).toEqual(['c', 'b', 'a', 'd']);
    });

    it('puts numbers in numeric order', () => {
        const list = [org('c10', { name: 'Client 10' }), org('c2', { name: 'Client 2' }), org('c1', { name: 'Client 1' })];
        expect(slugs(sortOrganizations(list, 'name', 'asc'))).toEqual(['c1', 'c2', 'c10']);
        expect(slugs(sortOrganizations(list, 'name', 'desc'))).toEqual(['c10', 'c2', 'c1']);
    });

    it('sorts an organization without a name as its slug, which is what its card shows', () => {
        const list = [org('zulu', { name: 'Alpha' }), org('bravo', { name: '' }), org('charlie', { name: null })];
        expect(slugs(sortOrganizations(list, 'name', 'asc'))).toEqual(['zulu', 'bravo', 'charlie']);
    });

    it('orders names that read the same by slug', () => {
        const list = [org('b', { name: 'Same' }), org('a', { name: 'SAME' }), org('c', { name: 'same' })];
        expect(slugs(sortOrganizations(list, 'name', 'asc'))).toEqual(['a', 'b', 'c']);
        expect(slugs(sortOrganizations(list, 'name', 'desc'))).toEqual(['a', 'b', 'c']);
    });

    it('sorts by name for no direction, an unknown direction or an unknown column', () => {
        const list = [org('b'), org('a')];
        expect(slugs(sortOrganizations(list, 'name', undefined))).toEqual(['a', 'b']);
        expect(slugs(sortOrganizations(list, 'name', 'sideways'))).toEqual(['a', 'b']);
        expect(slugs(sortOrganizations(list, 'entries', 'asc'))).toEqual(['a', 'b']);
        expect(slugs(sortOrganizations(list, undefined, 'desc'))).toEqual(['b', 'a']);
    });
});

describe.each(['creationDate', 'lastModified', 'datasetCount'])('sortOrganizations by %s', column => {
    it('orders ascending and descending, equal values by slug', () => {
        const list = [org('c', { [column]: 30 }), org('b', { [column]: 10 }), org('a', { [column]: 10 }), org('d', { [column]: 20 })];
        expect(slugs(sortOrganizations(list, column, 'asc'))).toEqual(['a', 'b', 'd', 'c']);
        expect(slugs(sortOrganizations(list, column, 'desc'))).toEqual(['c', 'd', 'a', 'b']);
    });

    it('puts an unknown value after the others in both directions, by slug', () => {
        const list = [
            org('n2', { [column]: null }), org('x', { [column]: 5 }), org('u', { [column]: undefined }),
            org('nan', { [column]: NaN }), org('y', { [column]: 7 }), org('n1', { [column]: null })
        ];
        expect(slugs(sortOrganizations(list, column, 'asc'))).toEqual(['x', 'y', 'n1', 'n2', 'nan', 'u']);
        expect(slugs(sortOrganizations(list, column, 'desc'))).toEqual(['y', 'x', 'n1', 'n2', 'nan', 'u']);
    });

    it('keeps a value of zero (0 is a value, not a missing one)', () => {
        const list = [org('missing', { [column]: null }), org('zero', { [column]: 0 }), org('one', { [column]: 1 })];
        expect(slugs(sortOrganizations(list, column, 'asc'))).toEqual(['zero', 'one', 'missing']);
        expect(slugs(sortOrganizations(list, column, 'desc'))).toEqual(['one', 'zero', 'missing']);
    });
});

describe('sortOrganizations in general', () => {
    it('does not change the list it is given', () => {
        const list = [org('b', { datasetCount: 1 }), org('a', { datasetCount: 2 })];
        const copy = [...list];
        const sorted = sortOrganizations(list, 'datasetCount', 'desc');
        expect(list).toEqual(copy);
        expect(list.every((o, i) => o === copy[i])).toBe(true);
        expect(sorted).not.toBe(list);
        expect(slugs(sorted)).toEqual(['a', 'b']);
    });

    it('does not change a frozen list', () => {
        const list = Object.freeze([org('b'), org('a')]);
        expect(slugs(sortOrganizations(list, 'name', 'asc'))).toEqual(['a', 'b']);
    });

    it('returns the same organization objects', () => {
        const a = org('a');
        expect(sortOrganizations([a], 'name', 'asc')[0]).toBe(a);
    });

    it('is stable: the same result for the same list, whatever order it was in', () => {
        const base = Array.from({ length: 40 }, (_, i) => org(`o${String(i).padStart(2, '0')}`, { datasetCount: i % 4 }));
        const reversed = [...base].reverse();
        expect(slugs(sortOrganizations(base, 'datasetCount', 'asc'))).toEqual(slugs(sortOrganizations(reversed, 'datasetCount', 'asc')));
    });

    it('keeps the order of entries that tie on everything, slug included', () => {
        const list = [org('same', { tag: 1 }), org('same', { tag: 2 }), org('same', { tag: 3 })];
        expect(sortOrganizations(list, 'lastModified', 'asc').map(o => o.tag)).toEqual([1, 2, 3]);
        expect(sortOrganizations(list, 'name', 'desc').map(o => o.tag)).toEqual([1, 2, 3]);
    });

    it('handles an empty list', () => {
        expect(sortOrganizations([], 'lastModified', 'desc')).toEqual([]);
    });
});

describe('organizationRow', () => {
    const dto = {
        slug: 'acme', name: 'Acme', description: 'd', creationDate: '2026-01-02T03:04:05Z', lastModified: '2026-03-04T05:06:07Z',
        datasetCount: 3, owner: 'ann', isPublic: true, permissions: { canRead: true }
    };

    it('maps the dates to milliseconds and keeps the count', () => {
        expect(organizationRow(dto)).toEqual({
            slug: 'acme', name: 'Acme', description: 'd', editing: false, deleting: false,
            creationDate: Date.parse('2026-01-02T03:04:05Z'), lastModified: Date.parse('2026-03-04T05:06:07Z'),
            datasetCount: 3, owner: 'ann', isPublic: true, permissions: { canRead: true }
        });
    });

    it('keeps an unknown date and count unknown (null), and a count of 0', () => {
        expect(organizationRow({ ...dto, lastModified: null, datasetCount: null })).toMatchObject({ lastModified: null, datasetCount: null });
        expect(organizationRow({ slug: 's' })).toMatchObject({ creationDate: null, lastModified: null, datasetCount: null });
        expect(organizationRow({ ...dto, datasetCount: 0 }).datasetCount).toBe(0);
        expect(organizationRow({ ...dto, lastModified: 'not a date' }).lastModified).toBeNull();
    });
});

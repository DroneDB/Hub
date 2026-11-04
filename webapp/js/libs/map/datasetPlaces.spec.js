import { describe, it, expect } from 'vitest';
import { isUsableBbox, unlocatedDatasets } from './datasetPlaces';

const group = (org, datasets, orgName) => ({ org, orgName, datasets });
const dataset = (slug, bbox, name) => ({ slug, name, bbox });

describe('isUsableBbox', () => {
    it('accepts a box inside the WGS84 range, a point included', () => {
        expect(isUsableBbox([10, 20, 11, 21])).toBe(true);
        expect(isUsableBbox([10, 20, 10, 20])).toBe(true);
        expect(isUsableBbox([-180, -90, 180, 90])).toBe(true);
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', '1,2,3,4'],
        ['too short', [1, 2, 3]],
        ['too long', [1, 2, 3, 4, 5, 6]],
        ['all zero', [0, 0, 0, 0]],
        ['not finite', [1, 2, NaN, 4]],
        ['infinite', [1, 2, 3, Infinity]],
        ['numbers as text', ['1', '2', '3', '4']],
        ['a minimum above the maximum', [12, 20, 11, 21]],
        ['longitude out of range', [10, 20, 181, 21]],
        ['latitude out of range', [10, 20, 11, 91]]
    ])('refuses %s', (_, bbox) => {
        expect(isUsableBbox(bbox)).toBe(false);
    });

    it('accepts a box that has a zero in it', () => {
        expect(isUsableBbox([0, 0, 1, 1])).toBe(true);
    });
});

describe('unlocatedDatasets', () => {
    it('lists the datasets with no usable box, in the order of the groups', () => {
        const groups = [
            group('acme', [
                dataset('ok', [1, 1, 2, 2], 'Ok'),
                dataset('none', null, 'None'),
                dataset('short', [1, 2, 3], 'Short'),
                dataset('zero', [0, 0, 0, 0], 'Zero')
            ], 'Acme'),
            group('beta', [dataset('nan', [1, 2, NaN, 4], 'Nan')], 'Beta')
        ];
        expect(unlocatedDatasets(groups)).toEqual([
            { org: 'acme', orgName: 'Acme', slug: 'none', name: 'None' },
            { org: 'acme', orgName: 'Acme', slug: 'short', name: 'Short' },
            { org: 'acme', orgName: 'Acme', slug: 'zero', name: 'Zero' },
            { org: 'beta', orgName: 'Beta', slug: 'nan', name: 'Nan' }
        ]);
    });

    it('names a dataset and an organization by their slugs when they have no name', () => {
        expect(unlocatedDatasets([group('acme', [dataset('b', null, '')])])).toEqual([{ org: 'acme', orgName: 'acme', slug: 'b', name: 'b' }]);
    });

    it('is empty when every dataset has a place, or there are none', () => {
        expect(unlocatedDatasets([group('a', [dataset('a1', [1, 1, 2, 2])]), group('b', [])])).toEqual([]);
        expect(unlocatedDatasets([{ org: 'c' }])).toEqual([]);
    });
});

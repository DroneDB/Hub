import { describe, it, expect } from 'vitest';
import { isSameDataset } from './datasetIdentity';

describe('isSameDataset', () => {
    it('is the same dataset for another object with the same key, by base address or by organization and name', () => {
        expect(isSameDataset({ baseApi: '/orgs/o/ds/d' }, { baseApi: '/orgs/o/ds/d', extra: 1 })).toBe(true);
        expect(isSameDataset({ org: 'o', ds: 'd' }, { org: 'o', ds: 'd' })).toBe(true);
    });

    it('is another dataset when the key differs, and never for a missing dataset', () => {
        expect(isSameDataset({ org: 'o', ds: 'd' }, { org: 'o', ds: 'e' })).toBe(false);
        expect(isSameDataset(null, null)).toBe(false);
        expect(isSameDataset({ org: 'o', ds: 'd' }, undefined)).toBe(false);
    });
});

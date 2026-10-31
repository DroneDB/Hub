import { describe, it, expect } from 'vitest';
import { DATASET_SORT_FIELDS, datasetListQuery } from './datasetList';

const view = extra => ({ page: 1, pageSize: 10, ...extra });

describe('DATASET_SORT_FIELDS', () => {
    it('includes the date of the last change', () => {
        expect(DATASET_SORT_FIELDS).toEqual(['name', 'creationDate', 'lastModified', 'entries', 'size', 'visibility']);
    });
});

describe('datasetListQuery', () => {
    it('sends every sort field as it is named', () => {
        for (const field of DATASET_SORT_FIELDS) expect(datasetListQuery(view({ sortColumn: field })).sort).toBe(field);
    });

    it('sorts the last change descending', () => {
        expect(datasetListQuery(view({ sortColumn: 'lastModified', sortDirection: 'desc' }))).toEqual({
            skip: 0, take: 10, sort: 'lastModified', desc: true
        });
    });

    it('sorts by name for an unknown column and ascending unless asked otherwise', () => {
        expect(datasetListQuery(view({ sortColumn: 'owner' }))).toMatchObject({ sort: 'name', desc: false });
        expect(datasetListQuery(view({}))).toMatchObject({ sort: 'name', desc: false });
    });

    it('pages and searches', () => {
        expect(datasetListQuery(view({ page: 3, pageSize: 25, search: '  ortho ' }))).toEqual({
            skip: 50, take: 25, q: 'ortho', sort: 'name', desc: false
        });
    });
});

/**
 * Which dataset covers the organisation page preloads: the server returns one page
 * (skip/take) with its covers checked, so the browser loads at most that page's covers.
 *
 * The component is heavy to mount (PrimeVue DataTable, router, dialogs), so this spec
 * exercises the preload policy of DatasetsPage.vue (preloadDatasetThumbnail
 * over the datasets of the page) with a counting Image stub.
 *
 * Run with: npx vitest run webapp/js/specs/datasetsPreload.spec.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datasetListQuery } from '@/libs/datasetList';

const DATASETS = 300;
const PAGE_SIZE = 10;

function makeDatasets(n) {
    return Array.from({ length: n }, (_, i) => ({ slug: `ds${i}`, hasThumbnail: true, thumbUrl: '/images/dataset-placeholder.svg', thumbLoaded: false }));
}

/** The logic of DatasetsPage.vue preloadDatasetThumbnail(). */
function preloadPolicy(datasets, getUrl) {
    datasets.forEach(ds => {
        if (!ds.hasThumbnail) return;
        const url = getUrl(ds);
        const img = new Image();
        img.onload = () => { ds.thumbUrl = url; ds.thumbLoaded = true; };
        img.src = url;
    });
}

describe('dataset cover preload policy', () => {
    let created;
    beforeEach(() => {
        created = [];
        vi.stubGlobal('Image', class { set src(v) { created.push(v); } });
    });
    afterEach(() => vi.unstubAllGlobals());

    // What GET /orgs/{org}/ds?skip&take answers (DatasetListQuery, name order)
    const serverPage = (datasets, q) => datasets.slice(q.skip, q.skip + q.take);

    it('covers are loaded for the page shown only (≤ page + next page)', () => {
        const datasets = makeDatasets(DATASETS);
        const query = datasetListQuery({ page: 1, pageSize: PAGE_SIZE, sortColumn: 'name', sortDirection: 'asc' });
        preloadPolicy(serverPage(datasets, query), ds => `/orgs/o/ds/${ds.slug}/thumb?size=150`);
        expect(created.length).toBeLessThanOrEqual(2 * PAGE_SIZE);
        expect(created.length).toBe(PAGE_SIZE);
    });

    it('follows the page, the search and the sort', () => {
        expect(datasetListQuery({ page: 3, pageSize: PAGE_SIZE })).toEqual({ skip: 20, take: 10, sort: 'name', desc: false });
        expect(datasetListQuery({ page: 1, pageSize: 25, search: '  survey ', sortColumn: 'size', sortDirection: 'desc' }))
            .toEqual({ skip: 0, take: 25, q: 'survey', sort: 'size', desc: true });
        // unknown sort columns fall back to the name; page and size never go below 1
        expect(datasetListQuery({ page: 0, pageSize: 0, sortColumn: 'owner' })).toEqual({ skip: 0, take: 1, sort: 'name', desc: false });
    });
});

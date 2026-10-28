import { describe, it, expect } from 'vitest';
import {
    formatSplatCount, formatShDegree, formatExtent, formatGeoreference, formatEstimatedUp, pagerState, formatLodState, splatInfoRows
} from './splatInfo';

const METRES = { metersPerUnit: 1, unit: 'm' };
const UNITS = { metersPerUnit: 1, unit: 'units' };
const bounds = { min: [-10, -5, 0], max: [11, 5.5, 3] };

describe('counts', () => {
    it('writes the splat count with separators and says unknown for no number', () => {
        expect(formatSplatCount(1234567)).toBe('1,234,567');
        expect(formatSplatCount(0)).toBe('0');
        for (const bad of [undefined, null, '12', NaN, -1]) expect(formatSplatCount(bad)).toBe('Unknown');
    });

    it('names the degree of the colour detail', () => {
        expect(formatShDegree(0)).toBe('0 (flat colour)');
        expect(formatShDegree(3)).toBe('3 (full)');
        for (const bad of [undefined, 4, -1, 1.5, '3']) expect(formatShDegree(bad)).toBe('Unknown');
    });
});

describe('size', () => {
    it('is the extent of the bounds in metres for a scene with a scale', () => {
        expect(formatExtent(bounds, METRES)).toBe('21.0 m × 10.5 m × 3.0 m');
    });

    it('is in the scene units, with the scale applied, for a scene without one', () => {
        expect(formatExtent(bounds, UNITS)).toBe('21.00 units × 10.50 units × 3.00 units');
        expect(formatExtent(bounds, { metersPerUnit: 0.5, unit: 'm' })).toBe('10.5 m × 5.3 m × 1.5 m');
    });

    it('is unknown without usable bounds', () => {
        for (const bad of [null, {}, { min: [0, 0, 0] }, { min: [0, 0], max: [1, 1, 1] }, { min: [0, 0, 'a'], max: [1, 1, 1] }]) {
            expect(formatExtent(bad, METRES)).toBe('Unknown');
        }
    });
});

describe('georeference', () => {
    it('says no unless the entry is georeferenced', () => {
        expect(formatGeoreference(undefined)).toBe('No');
        expect(formatGeoreference({})).toBe('No');
        expect(formatGeoreference({ georeferenced: false })).toBe('No');
    });

    it('says which frame it is', () => {
        expect(formatGeoreference({ georeferenced: true, georef: { kind: 'enu', origin: [44, 11, 30] } })).toContain('east-north-up');
        expect(formatGeoreference({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32632', offset: [0, 0, 0] } })).toBe('Yes (EPSG:32632, metres)');
        expect(formatGeoreference({ georeferenced: true, georef: { kind: 'projected', crs: 'PROJCS[' + 'x'.repeat(100) + ']' } })).toBe('Yes (projected coordinates, metres)');
        expect(formatGeoreference({ georeferenced: true })).toBe('Yes (metres)');
    });
});

describe('estimated up', () => {
    it('names an axis with the confidence and the source', () => {
        expect(formatEstimatedUp({ up: [0, 0, 1], upConfidence: 0.85, upSource: 'ground-plane' })).toBe('+Z, 85% sure (ground plane)');
        expect(formatEstimatedUp({ up: [0, -1, 0], upConfidence: 1, upSource: 'georef' })).toBe('-Y, 100% sure (georeferenced)');
    });

    it('gives a direction that is no axis as a vector, normalised', () => {
        expect(formatEstimatedUp({ up: [0, 3, 4], upConfidence: 0.7, upSource: 'pca' })).toBe('(0.00, 0.60, 0.80), 70% sure (principal axes)');
    });

    it('says what is missing: no estimate, no confidence, an unknown source', () => {
        expect(formatEstimatedUp(null)).toBe('Not estimated');
        expect(formatEstimatedUp({})).toBe('Not estimated');
        expect(formatEstimatedUp({ up: [0, 0, 0], upConfidence: 1 })).toBe('Not estimated');
        expect(formatEstimatedUp({ up: [0, 1, 0] })).toBe('+Y, confidence unknown');
        expect(formatEstimatedUp({ up: [0, 1, 0], upConfidence: 3, upSource: 'magic' })).toBe('+Y, 100% sure');
    });
});

describe('level-of-detail streaming', () => {
    const splats = {};
    const want = (...chunks) => chunks.map(chunk => ({ splats, chunk }));
    /**
     * A stub of Spark's pager with only its public members: the chunks in a page are `resident`
     * (chunk index -> page). Its private fetch queues are left out on purpose: they are not read.
     */
    const pagerOf = ({ resident = [], fetchPriority = [], maxPages = 256 }) => ({
        fetchPriority, maxPages,
        pageToSplatsChunk: resident.map(chunk => ({ splats, chunk })),
        getSplatsChunk: (s, chunk) => (s === splats && resident.includes(chunk) ? { page: resident.indexOf(chunk), lru: 0 } : undefined)
    });

    it('counts no wanted chunk that is already in a page, so a fully loaded file is up to date', () => {
        const state = pagerState(pagerOf({ resident: [0, 1, 2, 3], fetchPriority: want(0, 1, 2, 3) }));
        expect(state).toEqual({ pending: 0, pages: 4, maxPages: 256 });
        expect(formatLodState(true, state)).toBe('Up to date for this view (4 of 256 pages in memory)');
        const rows = splatInfoRows({ entry: { path: 'a.rad' }, bounds: null, scale: UNITS, streaming: true, lod: state });
        expect(rows.find(r => r.id === 'lod').value).toBe('Up to date for this view (4 of 256 pages in memory)');
    });

    it('counts every wanted chunk that is not in a page yet, each once', () => {
        const state = pagerState(pagerOf({ resident: [0], fetchPriority: want(0, 1, 2, 3, 4) }));
        expect(state?.pending).toBe(4);
    });

    it('does not count a wanted chunk that no longer fits in the pool, as the pager never fetches it', () => {
        const state = pagerState(pagerOf({ resident: [0, 1], fetchPriority: want(0, 1, 2, 3, 4), maxPages: 4 }));
        expect(state).toEqual({ pending: 2, pages: 2, maxPages: 4 });
    });

    it('counts nothing on the way when it cannot tell which chunks are resident', () => {
        const pager = { fetchPriority: want(0, 1, 2, 3), pageToSplatsChunk: [{}, undefined, {}, {}], maxPages: 256 };
        expect(pagerState(pager)).toEqual({ pending: 0, pages: 3, maxPages: 256 });
        expect(pagerState({})).toEqual({ pending: 0, pages: 0, maxPages: 0 });
        expect(pagerState(null)).toBeNull();
    });

    it('says streaming while chunks are on the way and up to date when none is', () => {
        expect(formatLodState(true, { pending: 3, pages: 3, maxPages: 256 })).toBe('Streaming (3 chunks on the way)');
        expect(formatLodState(true, { pending: 1, pages: 3, maxPages: 256 })).toBe('Streaming (1 chunk on the way)');
        expect(formatLodState(true, { pending: 0, pages: 3, maxPages: 256 })).toBe('Up to date for this view (3 of 256 pages in memory)');
        expect(formatLodState(true, { pending: 0, pages: 0, maxPages: 0 })).toBe('Up to date for this view');
        expect(formatLodState(true, null)).toBe('Starting');
    });

    it('says the file is whole for anything that is not paged', () => {
        expect(formatLodState(false, null)).toContain('Whole file');
    });
});

describe('rows', () => {
    const entry = { path: 'a.rad', properties: { splatCount: 2500000, shDegree: 3, georeferenced: true, georef: { kind: 'enu', origin: [0, 0, 0] } } };

    it('has one row per fact, from the entry, the bounds and the state', () => {
        const rows = splatInfoRows({
            entry, bounds: { ...bounds, up: [0, 0, 1], upConfidence: 1, upSource: 'georef' }, scale: METRES, streaming: true,
            lod: { pending: 0, pages: 4, maxPages: 256 }, quality: 'Auto (high)'
        });
        expect(Object.fromEntries(rows.map(r => [r.id, r.value]))).toEqual({
            splats: '2,500,000',
            sh: '3 (full)',
            size: '21.0 m × 10.5 m × 3.0 m',
            lod: 'Up to date for this view (4 of 256 pages in memory)',
            georef: 'Yes (local east-north-up frame, metres)',
            up: '+Z, 100% sure (georeferenced)',
            quality: 'Auto (high)'
        });
    });

    it('labels the size as scene units when the scene has no scale, and survives an entry with nothing', () => {
        const rows = splatInfoRows({ entry: { path: 'a.spz' }, bounds: null, scale: UNITS, streaming: false });
        expect(rows.find(r => r.id === 'size')).toEqual({ id: 'size', label: 'Size (scene units)', value: 'Unknown' });
        expect(rows.find(r => r.id === 'splats').value).toBe('Unknown');
        expect(rows.find(r => r.id === 'georef').value).toBe('No');
        expect(rows.find(r => r.id === 'up').value).toBe('Not estimated');
        expect(rows.some(r => r.id === 'quality')).toBe(false);
        expect(splatInfoRows({ entry: undefined, bounds: undefined, scale: UNITS, streaming: false })).toHaveLength(6);
    });
});

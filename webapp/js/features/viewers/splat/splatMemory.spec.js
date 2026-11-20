import { describe, it, expect } from 'vitest';
import {
    PAGE_SPLATS, pagedBytesPerSplat, pagedSplatBudget, pagerMemory, sceneMemoryOf, memoryRows
} from './splatMemory';
import { QUALITY_PRESETS } from './qualityPresets';

describe('pagedBytesPerSplat', () => {
    it('counts the packed and extended texels and one per colour texture, twice (Spark keeps a copy next to the GPU one)', () => {
        expect([0, 1, 2, 3].map(pagedBytesPerSplat)).toEqual([64, 96, 128, 192]);
    });

    it('takes the most when the degree is not known, and keeps a degree it is given inside the range', () => {
        expect(pagedBytesPerSplat(undefined)).toBe(192);
        expect(pagedBytesPerSplat('3')).toBe(192);
        expect(pagedBytesPerSplat(7)).toBe(192);
        expect(pagedBytesPerSplat(-2)).toBe(64);
    });
});

describe('pagedSplatBudget', () => {
    const FOUR_GB = { memoryGb: 4, mobile: false, shDegree: 3 };

    it('gives a 4 GB desktop 68 pages (4,456,448 splats, 816 MB) where Spark would allocate 256', () => {
        const budget = pagedSplatBudget(FOUR_GB);
        expect(budget).toEqual({
            pages: 68, maxPagedSplats: 4456448, bytes: 855638016, bytesPerSplat: 192, memoryGb: 4, mobile: false
        });
        // NFR-003: the pool of a 4 GB device is within a fifth of its memory
        expect(budget.bytes).toBeLessThanOrEqual(4 * 1024 ** 3 * 0.2);
        expect(budget.maxPagedSplats % PAGE_SPLATS).toBe(0);
    });

    it('narrows the pool in the lower presets, by the preset share', () => {
        const pages = scale => pagedSplatBudget({ ...FOUR_GB, scale }).pages;
        expect(pages(QUALITY_PRESETS.high.pagedScale)).toBe(68);
        expect(pages(QUALITY_PRESETS.medium.pagedScale)).toBe(51);
        expect(pages(QUALITY_PRESETS.low.pagedScale)).toBe(34);
    });

    it('takes less when the file has no colour detail, and never more than Spark would', () => {
        expect(pagedSplatBudget({ memoryGb: 4, mobile: false, shDegree: 0 }).pages).toBe(204);
        expect(pagedSplatBudget({ memoryGb: 8, mobile: false, shDegree: 0 }).pages).toBe(256);
        expect(pagedSplatBudget({ memoryGb: 8, mobile: true, shDegree: 0 }).pages).toBe(128);
    });

    it('gives a phone half the share of a desktop of the same memory', () => {
        expect(pagedSplatBudget({ memoryGb: 4, mobile: true, shDegree: 3 })).toMatchObject({ pages: 34, bytes: 427819008, mobile: true });
        expect(pagedSplatBudget({ memoryGb: 8, mobile: true, shDegree: 3 }).pages).toBe(68);
    });

    it('has a floor of 16 pages for a device with very little memory', () => {
        expect(pagedSplatBudget({ memoryGb: 2, mobile: true, scale: 0.5, shDegree: 3 }).pages).toBe(16);
        expect(pagedSplatBudget({ memoryGb: 0, mobile: false }).pages).toBe(16);
    });

    it('never allocates more than twice the splats of the scene, when it is known', () => {
        // 1.1 million splats (train.ply): 34 pages, not the 204 the device allows
        expect(pagedSplatBudget({ memoryGb: 4, mobile: false, shDegree: 0, splatCount: 1100000 }).pages).toBe(34);
        // a scene larger than the budget is held by the budget (the 3.4 GB scene)
        expect(pagedSplatBudget({ ...FOUR_GB, splatCount: 14000000 }).pages).toBe(68);
        // a count that is not a count is ignored
        expect(pagedSplatBudget({ ...FOUR_GB, splatCount: 'many' }).pages).toBe(68);
    });
});

describe('sceneMemoryOf', () => {
    it('reads the splat count and the colour degree of the entry, and leaves out what is not a number', () => {
        expect(sceneMemoryOf({ properties: { splatCount: 2500000, shDegree: 3 } })).toEqual({ splatCount: 2500000, shDegree: 3 });
        expect(sceneMemoryOf({ properties: { splatCount: 0, shDegree: 'x' } })).toEqual({});
        expect(sceneMemoryOf({ properties: { shDegree: 0 } })).toEqual({ shDegree: 0 });
        expect(sceneMemoryOf(undefined)).toEqual({});
    });
});

describe('pagerMemory', () => {
    const texture = bytes => ({ value: { image: { data: new Uint8Array(bytes) } } });

    it('adds up the arrays Spark allocated, twice, and counts the pages that hold a chunk', () => {
        const pager = {
            maxPages: 4,
            packedTexture: texture(1000), extTexture: texture(1000),
            shTextures: [texture(1000), texture(16), texture(16), texture(16)],
            pageToSplatsChunk: [{ chunk: 0 }, undefined, { chunk: 1 }]
        };
        expect(pagerMemory(pager)).toEqual({ bytes: 2 * 3048, pages: 2, maxPages: 4 });
    });

    it('is null without a pager and survives one that lacks members', () => {
        expect(pagerMemory(null)).toBeNull();
        expect(pagerMemory({})).toEqual({ bytes: 0, pages: 0, maxPages: 0 });
    });
});

describe('memoryRows', () => {
    const budget = pagedSplatBudget({ memoryGb: 4, mobile: false, shDegree: 3 });

    it('gives the budget with the device it derives from, and what is in use', () => {
        expect(memoryRows({ streaming: true, budget, pager: { bytes: 855638016, pages: 12, maxPages: 68 }, heapBytes: 1048576 * 900 })).toEqual([
            { id: 'memoryBudget', label: 'Splat memory budget', value: '816 MB (68 pages, 4 GB device)' },
            { id: 'memory', label: 'Splat memory in use', value: '816 MB of 816 MB, 12 of 68 pages filled' },
            { id: 'heap', label: 'Browser memory (JS heap)', value: '900 MB' }
        ]);
    });

    it('says when the memory of the device is assumed, and when nothing is allocated yet', () => {
        const rows = memoryRows({ streaming: true, budget, reported: false });
        expect(rows[0].value).toBe('816 MB (68 pages, 4 GB device, assumed: the browser does not report it)');
        expect(rows[1].value).toBe('Nothing allocated yet');
        expect(rows).toHaveLength(2);
    });

    it('says a phone is a phone, and that a file that is not paged has no budget', () => {
        const phone = pagedSplatBudget({ memoryGb: 4, mobile: true, shDegree: 3 });
        expect(memoryRows({ streaming: true, budget: phone })[0].value).toBe('408 MB (34 pages, 4 GB device, phone)');
        expect(memoryRows({ streaming: false, budget })).toEqual([
            { id: 'memoryBudget', label: 'Splat memory budget', value: 'Not paged (the whole file is held in memory)' }
        ]);
    });
});

// @ts-check
/**
 * The memory budget of the splat viewer (FR-VWR-22, NFR-003).
 *
 * A paged .rad streams through Spark's pager: one pool of pages (65536 splats each) that is
 * allocated whole, at its maximum size, when the first chunk is asked for, and then filled and
 * evicted as the view moves. Spark sizes the pool for a desktop (256 pages, 16.7 million splats)
 * whatever the scene or the device is. Each splat of the pool takes a packed texel and an extended
 * texel (16 bytes each) and, once the file has colour detail, one 16-byte texel per spherical-
 * harmonics texture (1, 2 or 4 for degree 1, 2 or 3). Spark keeps the array of every texture in
 * the page as well as the GPU copy of it (`uploadTextureLayer` writes into `image.data`), so the
 * pool takes twice that: 64 bytes a splat without colour detail, 192 with it. A measured pool of
 * 256 pages took 523 MB of JavaScript heap, and 1547 MB with the colour textures, before a single
 * splat was drawn.
 *
 * The viewer therefore passes the pool size itself (`maxPagedSplats`): a share of the memory of
 * the device (libs/responsive.js deviceMemoryGb(): what the browser reports, 4 GB when it does
 * not), smaller on a phone and in the low quality preset, never above what Spark would take
 * and never above what the scene could fill. The About panel shows the result.
 */
import { formatBytes } from '@/libs/format';

/** Splats in a page of Spark's pager (256 x 256). */
export const PAGE_SPLATS = 65536;
/** The pool Spark allocates by default: 256 pages on a desktop, 128 on other devices (96 on iOS). */
export const MAX_PAGES = 256;
export const MAX_PAGES_MOBILE = 128;
/** The smallest pool: a million splats, enough for a small view on a small device. */
export const MIN_PAGES = 16;

/** The share of the memory of the device the paged splats may take: a phone has more to share it with. */
export const MEMORY_SHARE = 0.2;
export const MEMORY_SHARE_MOBILE = 0.1;
/** A pool is never larger than this many times the splats of the scene (a level-of-detail file also holds its inner nodes). */
export const SCENE_HEADROOM = 2;

const GIB = 1024 ** 3;
/** The 16-byte texels a pool holds for each splat, by degree of colour detail: packed and extended, then one per SH texture. */
const TEXELS = [2, 3, 4, 6];
const TEXEL_BYTES = 16;
/** Spark keeps a copy of every texture in memory next to the one on the GPU. */
const COPIES = 2;
/** The degree of colour detail when the file does not say: the most, so the pool never grows past its budget when it appears. */
const MAX_SH = 3;

/**
 * The bytes the pool takes for each splat once it holds colour detail of this degree.
 * @param {unknown} shDegree  the degree of the file; anything else is the highest
 */
export function pagedBytesPerSplat(shDegree) {
    const degree = typeof shDegree === 'number' && Number.isInteger(shDegree) ? Math.min(MAX_SH, Math.max(0, shDegree)) : MAX_SH;
    return COPIES * TEXEL_BYTES * TEXELS[degree];
}

/**
 * @typedef {object} PagedBudget
 * @property {number} pages            pages of the pool
 * @property {number} maxPagedSplats   what to give Spark (a multiple of the page size)
 * @property {number} bytes            what the pool takes once allocated, the figure the About panel gives as the budget
 * @property {number} bytesPerSplat
 * @property {number} memoryGb         the memory of the device the budget derives from
 * @property {boolean} mobile
 */

/**
 * The pool of paged splats for a device, a quality preset and a scene.
 * @param {object} options
 * @param {number} options.memoryGb       deviceMemoryGb()
 * @param {boolean} options.mobile        isMobile()
 * @param {number} [options.scale]        the preset's share of the budget (QualityPreset.pagedScale), 1 by default
 * @param {number} [options.shDegree]     the degree of colour detail of the scene, when known
 * @param {number} [options.splatCount]   the splats of the scene, when known
 * @returns {PagedBudget}
 */
export function pagedSplatBudget({ memoryGb, mobile, scale = 1, shDegree, splatCount }) {
    const bytesPerSplat = pagedBytesPerSplat(shDegree);
    const share = mobile ? MEMORY_SHARE_MOBILE : MEMORY_SHARE;
    const allowed = Math.max(0, memoryGb) * GIB * share * (Number.isFinite(scale) ? Math.max(0, scale) : 1);
    const ceiling = mobile ? MAX_PAGES_MOBILE : MAX_PAGES;
    let pages = Math.min(ceiling, Math.floor(allowed / bytesPerSplat / PAGE_SPLATS));
    // A scene smaller than the pool never fills it
    if (typeof splatCount === 'number' && Number.isFinite(splatCount) && splatCount > 0) {
        pages = Math.min(pages, Math.ceil(splatCount * SCENE_HEADROOM / PAGE_SPLATS));
    }
    pages = Math.max(MIN_PAGES, pages);
    return { pages, maxPagedSplats: pages * PAGE_SPLATS, bytes: pages * PAGE_SPLATS * bytesPerSplat, bytesPerSplat, memoryGb, mobile };
}

/**
 * What the dataset entry says of the scene that sizes the pool (libddb writes `splatCount` and
 * `shDegree` at index time); a value that is missing or not a number is left out.
 * @param {any} entry
 * @returns {{ splatCount?: number, shDegree?: number }}
 */
export function sceneMemoryOf(entry) {
    const { splatCount, shDegree } = entry?.properties ?? {};
    return {
        ...(typeof splatCount === 'number' && Number.isFinite(splatCount) && splatCount > 0 ? { splatCount } : {}),
        ...(typeof shDegree === 'number' && Number.isInteger(shDegree) && shDegree >= 0 ? { shDegree } : {})
    };
}

/** @param {any} texture a DataArrayTexture of the pager, or a stand-in */
const textureBytes = texture => {
    const bytes = texture?.value?.image?.data?.byteLength;
    return typeof bytes === 'number' ? bytes : 0;
};

/**
 * What the pager of Spark holds now: the bytes of its textures (the arrays Spark allocated, twice:
 * the copy it keeps and the one on the GPU) and its pages. `null` without a pager. The empty
 * textures it shares for colour detail it has not allocated are a few bytes each.
 * @param {any} pager  spark.pager
 * @returns {{ bytes: number, pages: number, maxPages: number } | null}
 */
export function pagerMemory(pager) {
    if (!pager) return null;
    const textures = [pager.packedTexture, pager.extTexture, ...(Array.isArray(pager.shTextures) ? pager.shTextures : [])];
    const pages = Array.isArray(pager.pageToSplatsChunk) ? pager.pageToSplatsChunk.filter(Boolean).length : 0;
    return {
        bytes: COPIES * textures.reduce((sum, texture) => sum + textureBytes(texture), 0),
        pages,
        maxPages: typeof pager.maxPages === 'number' ? pager.maxPages : 0
    };
}

/** @param {PagedBudget} budget */
const deviceText = budget => `${budget.memoryGb} GB device${budget.mobile ? ', phone' : ''}`;

/**
 * The memory rows of the About panel: the budget with the memory it derives from, what the pager
 * holds, and the heap of the page when the browser reports it.
 * @param {object} state
 * @param {boolean} state.streaming                the scene is a paged .rad
 * @param {PagedBudget | null} state.budget        the stage's budget
 * @param {boolean} [state.reported]               whether the browser reported the memory of the device (else it is assumed)
 * @param {ReturnType<typeof pagerMemory>} [state.pager]
 * @param {number | null} [state.heapBytes]        performance.memory.usedJSHeapSize
 * @returns {{ id: string, label: string, value: string }[]}
 */
export function memoryRows({ streaming, budget, reported = true, pager = null, heapBytes = null }) {
    /** @type {{ id: string, label: string, value: string }[]} */
    const rows = [];
    if (!streaming) {
        rows.push({ id: 'memoryBudget', label: 'Splat memory budget', value: 'Not paged (the whole file is held in memory)' });
    } else if (budget) {
        const device = reported ? deviceText(budget) : `${deviceText(budget)}, assumed: the browser does not report it`;
        rows.push({ id: 'memoryBudget', label: 'Splat memory budget', value: `${formatBytes(budget.bytes, { decimals: 0 })} (${budget.pages} pages, ${device})` });
        rows.push({
            id: 'memory',
            label: 'Splat memory in use',
            value: pager ? `${formatBytes(pager.bytes, { decimals: 0 })} of ${formatBytes(budget.bytes, { decimals: 0 })}, ${pager.pages} of ${pager.maxPages} pages filled` : 'Nothing allocated yet'
        });
    }
    if (typeof heapBytes === 'number' && Number.isFinite(heapBytes)) {
        rows.push({ id: 'heap', label: 'Browser memory (JS heap)', value: formatBytes(heapBytes, { decimals: 0 }) });
    }
    return rows;
}

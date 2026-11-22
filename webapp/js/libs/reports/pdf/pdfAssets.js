// @ts-check
/**
 * The images of a PDF: what the model asks to be drawn (map snapshots, charts, 3D captures, photos, the logo) is
 * rendered or fetched, then made a JPEG within the size limits. Done one item at a time, so that the tab holds the
 * images of one item at once (a report of 50 items does not hold 50 canvases), and so that "rendered items / total"
 * means something. An image that cannot be made is not an error of the report: its place says why (a note under the
 * figure, a "Missing photo" tile); only a cancel stops the work.
 */
import { isDatasetPath } from '@/libs/reports/annotationPhotos';
import { figureBox } from '@/libs/reports/pdf/pdfLayout';
import { LOGO_MAX_SIDE, PHOTO_MAX_SIDE, SNAPSHOT_MAX_SIDE, prepareImage } from '@/libs/reports/pdf/pdfImages';

/**
 * @typedef {import('./pdfImages').PreparedImage} PreparedImage
 * @typedef {object} PdfAssets
 * @property {PreparedImage | null} logo
 * @property {Map<object, { image: PreparedImage | null, note: string | null }>} figures  by the block of the model
 * @property {Map<string, PreparedImage | null>} photos  by the path of the photo; null for one that cannot be shown
 * @typedef {{ done: number, total: number }} Progress
 */

/** What a failed render or read says under its figure ("Snapshot not available: ..."). @param {string} what @param {unknown} error */
const unavailable = (what, error) => `${what} not available: ${error instanceof Error && error.message ? error.message : String(error)}`;

/** The blocks that need an image, grouped by the item they belong to (the report's own, the cover and overview, form one group). @param {any} model */
export function planAssetWork(model) {
    /** @type {Map<string, any[]>} */
    const groups = new Map();
    for (const section of model.sections) {
        for (const block of section.blocks) {
            const needs = block.type === 'mapSnapshot' || block.type === 'chart' || (block.type === 'capture3d' && block.path) || (block.type === 'photoGrid' && block.photos.length);
            if (!needs) continue;
            const key = block.itemId ?? '';
            groups.set(key, [...(groups.get(key) ?? []), block]);
        }
    }
    return { groups: [...groups.values()], total: groups.size };
}

/**
 * The logo of the report: the one of its template (its own endpoint, with the session), else the instance's own, which
 * is a file of the site. None when the instance configures none: the bundled banner is not a report's.
 * @param {any} model
 * @param {{ appLogo?: string } | undefined} [hubOptions]  window.HubOptions
 * @returns {{ url: string, api: boolean } | null}
 */
export function logoRequest(model, hubOptions = typeof window === 'undefined' ? undefined : /** @type {any} */ (window).HubOptions) {
    if (model.logo) return { url: model.logo.url, api: model.logo.source === 'template' };
    const instance = hubOptions?.appLogo;
    return typeof instance === 'string' && instance ? { url: instance, api: false } : null;
}

/**
 * The bytes of an image: the Registry's own endpoints (a thumbnail, a stored capture, the logo of a template) with the
 * session of the user, any other address as the browser fetches it.
 * @param {any} dataset
 * @param {string} url
 * @param {{ api: boolean, signal?: AbortSignal }} options
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(dataset, url, { api, signal }) {
    const response = api ? await dataset.registry.fetchRaw(url, { signal }) : await fetch(url, { signal });
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    return response.blob();
}

/**
 * @typedef {object} AssetDeps
 * @property {{ renderMapSnapshot: Function, renderProfileChart: Function, capture3dImageUrl: Function }} renderers  libs/reports/snapshots
 * @property {{ run: <T>(fn: () => Promise<T>, options?: { signal?: AbortSignal }) => Promise<T> }} queue  the render queue
 * @property {(dataset: any, url: string, options: { api: boolean, signal?: AbortSignal }) => Promise<Blob>} [fetchBlob]
 * @property {(blob: Blob, options: { maxSide: number, signal?: AbortSignal }) => Promise<PreparedImage>} [prepare]
 */

/**
 * Makes the images of a report.
 * @param {any} model
 * @param {object} options
 * @param {any} options.dataset
 * @param {import('./pdfLayout').PageLayout} options.layout
 * @param {AssetDeps} options.deps
 * @param {AbortSignal} [options.signal]  aborting it stops the work (the promise rejects with the AbortError)
 * @param {(progress: Progress) => void} [options.onProgress]  called with 0 of N, then after each item
 * @returns {Promise<PdfAssets>}
 */
export async function loadAssets(model, { dataset, layout, deps, signal, onProgress = () => {} }) {
    const fetchBlob = deps.fetchBlob ?? fetchImageBlob;
    const prepare = deps.prepare ?? prepareImage;
    /** @type {PdfAssets} */
    const assets = { logo: null, figures: new Map(), photos: new Map() };
    const plan = planAssetWork(model);

    /** A failure that is the user's cancel stops everything; any other is the image's alone. @param {unknown} e */
    const stops = e => !!signal?.aborted || (e instanceof Error && e.name === 'AbortError');

    /**
     * @template T
     * @param {() => Promise<T>} make
     * @param {(e: unknown) => T} onFailure
     */
    async function attempt(make, onFailure) {
        try {
            return await make();
        } catch (e) {
            if (stops(e)) throw e;
            console.warn('An image of the report could not be made:', e);
            return onFailure(e);
        }
    }

    /** A figure from a renderer's answer ({ image: Blob | null, note }). @param {{ image: Blob | null, note: string | null }} rendered */
    async function figureOf(rendered) {
        return { image: rendered.image ? await prepare(rendered.image, { maxSide: SNAPSHOT_MAX_SIDE, signal }) : null, note: rendered.note ?? null };
    }

    /** @param {any} block */
    async function makeFigure(block) {
        const box = figureBox(layout, block);
        const request = { dataset, width: box.widthPx, height: box.heightPx, signal };
        if (block.type === 'capture3d') {
            const url = deps.renderers.capture3dImageUrl(block, dataset);
            if (!url) return;
            assets.figures.set(block, await attempt(
                async () => figureOf({ image: await fetchBlob(dataset, url, { api: true, signal }), note: null }),
                e => ({ image: null, note: unavailable('3D snapshot', e) })
            ));
            return;
        }
        const render = block.type === 'chart' ? deps.renderers.renderProfileChart : deps.renderers.renderMapSnapshot;
        assets.figures.set(block, await attempt(
            () => deps.queue.run(async () => figureOf(await render(block, request)), { signal }),
            e => ({ image: null, note: unavailable(block.type === 'chart' ? 'Chart' : 'Snapshot', e) })
        ));
    }

    /** @param {string} path */
    async function makePhoto(path) {
        if (assets.photos.has(path)) return;
        // Set first: the same photo in two places is read once, whichever finishes first
        assets.photos.set(path, null);
        if (!isDatasetPath(path)) return;
        assets.photos.set(path, await attempt(
            async () => prepare(await fetchBlob(dataset, dataset.thumbUrl(path, PHOTO_MAX_SIDE), { api: true, signal }), { maxSide: PHOTO_MAX_SIDE, signal }),
            () => null
        ));
    }

    onProgress({ done: 0, total: plan.total });
    const logo = logoRequest(model);
    if (logo) {
        assets.logo = await attempt(async () => prepare(await fetchBlob(dataset, logo.url, { api: logo.api, signal }), { maxSide: LOGO_MAX_SIDE, signal }), () => null);
    }
    let done = 0;
    for (const blocks of plan.groups) {
        signal?.throwIfAborted();
        await Promise.all(blocks.flatMap(block => (block.type === 'photoGrid' ? block.photos.map((/** @type {{ path: string }} */ p) => makePhoto(p.path)) : [makeFigure(block)])));
        onProgress({ done: ++done, total: plan.total });
    }
    signal?.throwIfAborted();
    return assets;
}

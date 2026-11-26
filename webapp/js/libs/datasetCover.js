// @ts-check
/**
 * The cover of a dataset (its thumbnail in the dataset list): a file in the dataset root whose name is one of the
 * server's candidates (`datasetThumbnailCandidates` of /sys/features; the server shows the first one the dataset has).
 * Every place that sets or removes a cover (the Edit dataset window, Dataset Settings, Set as Dataset Thumbnail) goes
 * through here, so a new cover is always the one the server shows.
 */
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { fetchImageBlob } from '@/libs/imageBlob';

/**
 * The server's default candidates, used only when the features did not load: the order is the server's (the first one
 * a dataset has is its cover). It is never read once the server's list is present.
 */
const FALLBACK_CANDIDATES = Object.freeze([
    'thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png', 'cover.webp', 'cover.jpg', 'cover.png'
]);

/** The file name extensions of each image type a cover can have. */
const EXTENSIONS_OF_TYPE = Object.freeze({
    'image/webp': ['webp'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png']
});

/** The image types a cover can be, for the `accept` of a file input. */
export const COVER_ACCEPT = Object.keys(EXTENSIONS_OF_TYPE).join(',');

/** The long side, in pixels, of the thumbnail of a file that becomes the cover. */
export const COVER_SOURCE_SIZE = 1024;

/** @param {string} name @returns {string} the extension of a file name, lowercase, without the dot ('' when none) */
const extensionOf = name => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

/** @returns {string[]} the names a cover can have, in the server's order */
export function coverCandidates() {
    const served = reg.features.value(Features.DATASET_THUMBNAIL_CANDIDATES);
    return Array.isArray(served) && served.length ? served : [...FALLBACK_CANDIDATES];
}

/**
 * Whether `path` is a cover file: a candidate name in the dataset root (any letter case).
 * @param {string | null | undefined} path
 */
export function isCoverPath(path) {
    if (!path || path.includes('/')) return false;
    const name = path.toLowerCase();
    return coverCandidates().some(c => c.toLowerCase() === name);
}

/**
 * The candidate a cover of this image type is written to: the first one with an extension of the type.
 * @param {string} type  the MIME type of the image
 * @returns {string}
 * @throws {Error} when the type is not one a cover can be, or the server takes no cover of that type
 */
export function coverNameFor(type) {
    const extensions = EXTENSIONS_OF_TYPE[/** @type {keyof typeof EXTENSIONS_OF_TYPE} */ ((type || '').toLowerCase())];
    if (!extensions) throw new Error('Choose a WebP, JPEG or PNG image');
    const name = coverCandidates().find(c => extensions.includes(extensionOf(c)));
    if (!name) throw new Error(`This server takes no ${extensions[0].toUpperCase()} cover`);
    return name;
}

/**
 * The cover files the dataset has.
 * @param {any} dataset
 * @returns {Promise<string[]>}
 */
export async function coverFiles(dataset) {
    return ((await dataset.list()) || []).map((/** @type {{ path: string }} */ e) => e.path).filter(isCoverPath);
}

/**
 * @typedef {{ file: Blob } | { entryPath: string } | { remove: true }} CoverChange
 *   `file`: an image the user chose; `entryPath`: a file of the dataset, whose thumbnail becomes the cover; `remove`:
 *   the dataset has no cover
 */

/**
 * @typedef {{ written: string | null, removed: string[] }} CoverResult
 *   `written`: the file the cover was saved as; `removed`: the cover files deleted
 */

/**
 * Makes `image` the cover: it is written first, then the other cover files are deleted (one of them would be shown in
 * its place), so a failure leaves the dataset with a cover.
 * @param {any} dataset
 * @param {Blob} image
 * @returns {Promise<CoverResult>}
 */
export async function setCover(dataset, image) {
    const name = coverNameFor(image.type);
    // Read before the write: the new file is one of them
    const existing = await coverFiles(dataset);
    await dataset.uploadObj(name, image instanceof File ? image : new File([image], name, { type: image.type }), { overwrite: true });
    const others = existing.filter(p => p.toLowerCase() !== name.toLowerCase());
    if (others.length) await dataset.deleteObjs(others);
    return { written: name, removed: others };
}

/**
 * Deletes every cover file of the dataset.
 * @param {any} dataset
 * @returns {Promise<CoverResult>}
 */
export async function removeCover(dataset) {
    const existing = await coverFiles(dataset);
    if (existing.length) await dataset.deleteObjs(existing);
    return { written: null, removed: existing };
}

/**
 * The thumbnail of a file of the dataset, as an image to make the cover.
 * @param {any} dataset
 * @param {string} path
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Blob>}
 */
export function entryCoverImage(dataset, path, { signal } = {}) {
    return fetchImageBlob(dataset, dataset.thumbUrl(path, COVER_SOURCE_SIZE), { api: true, signal });
}

/**
 * Applies a change of the cover.
 * @param {any} dataset
 * @param {CoverChange} change
 * @returns {Promise<CoverResult>}
 */
export async function applyCoverChange(dataset, change) {
    if ('remove' in change) return removeCover(dataset);
    const image = 'file' in change ? change.file : await entryCoverImage(dataset, change.entryPath);
    return setCover(dataset, image);
}

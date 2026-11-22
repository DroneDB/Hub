// @ts-check
/**
 * What the photos of an annotation need from the dataset: the entries of the photos (their dimensions, for the
 * marker, and their hash, for the thumbnail address), a search for images to pick, and the upload of an image next to
 * the measurement file. The rules of the paths and names are libs/reports/annotationPhotos.
 */
import pathutils from '@/libs/ddb/pathutils';
import entryApi from '@/libs/ddb/entry';
import { isNotFound, datasetBusyOf } from '@/libs/ddb/apiError';
import { annotationsFolder, nextUploadPath, uploadExtension } from '@/libs/reports/annotationPhotos';

/** The entry types that are pictures a person can pick as a photo. */
const IMAGE_TYPES = Object.freeze([entryApi.type.GEOIMAGE, entryApi.type.IMAGE]);
/** The most results of a search for images. */
export const PICK_LIMIT = 50;
/** The most conflicts one upload waits out: another session wrote a file with the name this one chose. */
const MAX_CONFLICTS = 20;

/**
 * The entries of some paths of the dataset, by path: one listing of each folder that holds them. A folder that cannot
 * be listed leaves its photos out of the answer (they are shown without a marker), it does not fail the rest.
 * @param {any} dataset
 * @param {Iterable<string>} paths
 * @returns {Promise<Map<string, any>>}
 */
export async function photoEntries(dataset, paths) {
    const wanted = new Set(paths);
    const folders = new Set([...wanted].map(path => pathutils.getParentFolder(path) ?? ''));
    /** @type {Map<string, any>} */
    const entries = new Map();
    await Promise.all([...folders].map(async folder => {
        try {
            for (const entry of (await dataset.list(folder)) || []) if (wanted.has(entry.path)) entries.set(entry.path, entry);
        } catch (e) {
            console.warn(`The folder ${folder || '/'} could not be listed:`, e);
        }
    }));
    return entries;
}

/**
 * The images of the dataset whose name has the text (any when it is empty), by path.
 * @param {any} dataset
 * @param {string} text
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<any[]>} at most PICK_LIMIT entries
 */
export async function findImages(dataset, text, { signal } = {}) {
    const query = `*${String(text || '').trim()}*`;
    const found = await Promise.all(IMAGE_TYPES.map(type => dataset.search(query, { recursive: true, type, signal })));
    return found.flat().sort((a, b) => a.path.localeCompare(b.path)).slice(0, PICK_LIMIT);
}

/**
 * The paths of the files that are in the folder of the uploaded photos of a measurement file ([] when it is not there yet).
 * @param {any} dataset
 * @param {string} measurementPath
 * @returns {Promise<string[]>}
 */
async function uploadedPaths(dataset, measurementPath) {
    try {
        return ((await dataset.list(annotationsFolder(measurementPath))) || []).map((/** @type {any} */ entry) => entry.path);
    } catch (e) {
        if (isNotFound(e)) return [];
        throw e;
    }
}

/**
 * Writes an image to `<folder of the measurement file>/annotations/<id>-<n>.<ext>`, `n` the lowest number from 1 that
 * no file has. The write never replaces a file: when another session wrote the name first, the Registry refuses it and
 * the name it says is taken is left out of the next choice.
 * @param {any} dataset
 * @param {{ measurementPath: string, id: string, file: File, taken?: Iterable<string> }} upload  `taken`: the paths
 *   that the annotation's photos use
 * @returns {Promise<string>} the path of the file written
 * @throws {Error} when the file is not an image that can be uploaded, or the write is refused
 */
export async function uploadPhoto(dataset, { measurementPath, id, file, taken = [] }) {
    const extension = uploadExtension(file.name);
    if (!extension) throw new Error('Choose a JPEG, PNG, WebP or GIF image');
    const used = new Set([...taken, ...(await uploadedPaths(dataset, measurementPath))]);
    for (let attempt = 0; attempt <= MAX_CONFLICTS; attempt++) {
        const path = nextUploadPath(measurementPath, id, extension, used);
        try {
            await dataset.writeObj(path, file);
            return path;
        } catch (e) {
            // A 409 of a busy dataset says nothing of the name
            if (/** @type {any} */ (e)?.status !== 409 || datasetBusyOf(e)) throw e;
            used.add(path);
        }
    }
    throw new Error('The name of the photo is taken: try again');
}

// @ts-check
/**
 * A search of the dataset for files to pick (a photo of an annotation, the cover of the dataset): by part of the name,
 * over the whole dataset, of some entry types.
 */
import entryApi from '@/libs/ddb/entry';

/** The entry types that are pictures a person can pick as a photo. */
export const IMAGE_TYPES = Object.freeze([entryApi.type.GEOIMAGE, entryApi.type.IMAGE]);
/** The most results of a search. */
export const PICK_LIMIT = 50;

/**
 * The entries of these types whose name has the text (any when it is empty), by path.
 * @param {any} dataset
 * @param {string} text
 * @param {{ types?: readonly number[], signal?: AbortSignal }} [options]  `types`: the images by default
 * @returns {Promise<any[]>} at most PICK_LIMIT entries
 */
export async function findEntries(dataset, text, { types = IMAGE_TYPES, signal } = {}) {
    const query = `*${String(text || '').trim()}*`;
    const found = await Promise.all(types.map(type => dataset.search(query, { recursive: true, type, signal })));
    return found.flat().sort((a, b) => a.path.localeCompare(b.path)).slice(0, PICK_LIMIT);
}

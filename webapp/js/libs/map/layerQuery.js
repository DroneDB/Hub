// @ts-check
/**
 * The layers added to a single-file map, as they sit in its `layer` query parameters:
 * `?layer=<base64url path>` repeated, in the order they were added. Links are edited by hand
 * and shared by other people, so what is read is checked and never throws.
 */
import { b64urlEncode, b64urlDecode } from '@/libs/base64';
import { isSafeLayerPath } from '@/libs/compare/compareState';

// Layers on top of the main file
export const MAX_ADDED_LAYERS = 3;

/** @param {string} path */
export function encodeLayerParam(path) {
    return b64urlEncode(path);
}

/**
 * The paths a value asks for, or null when it asks for none. A value may carry a suffix after "~"
 * (an opacity in links of other versions); only the part before it is the path.
 * @param {unknown} value
 */
function pathOf(value) {
    if (typeof value !== 'string') return null;
    try {
        const path = b64urlDecode(value.split('~')[0]);
        return isSafeLayerPath(path) ? path : null;
    } catch {
        return null;
    }
}

/**
 * The added layers of a query: the valid dataset-relative paths, in order, without the main file
 * and without repeats, at most MAX_ADDED_LAYERS. A value that cannot be read is ignored.
 * @param {string|(string|null)[]|null|undefined} values  the `layer` query value: one, several or none
 * @param {string} mainPath  the file the map is open on
 * @returns {string[]}
 */
export function parseLayerParams(values, mainPath) {
    const list = Array.isArray(values) ? values : values == null ? [] : [values];
    /** @type {string[]} */
    const paths = [];
    for (const value of list) {
        const path = pathOf(value);
        if (path === null || path === mainPath || paths.includes(path)) continue;
        paths.push(path);
        if (paths.length === MAX_ADDED_LAYERS) break;
    }
    return paths;
}

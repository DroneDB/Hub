// @ts-check
/**
 * The state of a georaster comparison and its URL form.
 *
 * A comparison is an ordered list of layers (index 0 is the leftmost band and the top layer)
 * with their opacity and plant-health parameters, the split mode and dividers, the view and
 * the basemap. The compare view keeps it in its URL so a link shows the same comparison:
 *
 *   ?p=<path>&p=<path>     the layers, everything else default (from the context menu)
 *   ?s=<state>             the whole working state
 *   ?c=<uid>               a saved comparison (dataset meta), with &s= when it has unsaved changes
 *   &pick=1                open the file picker once the first layer is on show
 *
 * Every value is base64url. A state read from a URL or the dataset meta is validated: links can
 * be edited by hand and saved comparisons are written by other users.
 */
import { b64urlEncode, b64urlDecode } from '@/libs/base64';

export const STATE_VERSION = 1;
export const MAX_LAYERS = 6;
// The `s` parameter: a shared link is loaded from the server, whose request line limit is 8 KB
export const MAX_STATE_PARAM = 6144;

/** @typedef {{ path: string, hash: string, opacity: number, vizParams: Record<string, any>|null }} Layer */
/** @typedef {{ center: number[], zoom: number, rotation: number }} View */
/**
 * @typedef {{ v: number, layers: Layer[], split: { enabled: boolean, positions: number[] },
 *             view: View|null, display: { basemap: string|null } }} ComparisonState
 */

const WORKING_KEYS = ['v', 'layers', 'split', 'view', 'display'];

/**
 * A dataset-relative path that cannot reach outside the dataset of the route.
 * @param {unknown} path
 */
export function isSafeLayerPath(path) {
    if (typeof path !== 'string' || !path.length || path.startsWith('/') || path.includes('://') || path.includes('\\')) return false;
    return path.split('/').every(segment => segment !== '..' && segment !== '');
}

/** Dividers that give n bands the same width. @param {number} n */
export function equalPositions(n) {
    return Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) / n);
}

/**
 * @param {string} path
 * @param {Partial<Layer>} [options]
 * @returns {Layer}
 */
export function newLayer(path, { hash = '', opacity = 1, vizParams = null } = {}) {
    return { path, hash, opacity, vizParams };
}

/**
 * A comparison of these files with the default settings: split on with equal bands from two layers.
 * @param {string[]} paths
 * @returns {ComparisonState}
 */
export function stateFromPaths(paths) {
    const n = paths.length;
    return {
        v: STATE_VERSION,
        layers: paths.map(p => newLayer(p)),
        split: { enabled: n >= 2, positions: n >= 2 ? equalPositions(n) : [] },
        view: null,
        display: { basemap: null }
    };
}

/** The working fields of a state or saved item (no identity, name or audit fields). @param {any} item */
export function workingState(item) {
    /** @type {any} */
    const state = {};
    for (const k of WORKING_KEYS) state[k] = item[k];
    return /** @type {ComparisonState} */ (state);
}

const isNumber = /** @param {unknown} x */ x => typeof x === 'number' && Number.isFinite(x);
const isObject = /** @param {unknown} x */ x => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Why `state` is not a valid comparison, or null when it is. A state of a later version is
 * not checked further: `newerVersion` says so.
 * @param {any} state
 * @returns {{ error: string|null, newerVersion: boolean }}
 */
export function validateState(state) {
    const fail = /** @param {string} error */ error => ({ error, newerVersion: false });
    if (!isObject(state)) return fail('not an object');
    if (!Number.isInteger(state.v) || state.v < 1) return fail('no version');
    if (state.v > STATE_VERSION) return { error: null, newerVersion: true };

    const { layers, split, view, display } = state;
    if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) return fail(`1 to ${MAX_LAYERS} layers`);
    const paths = new Set();
    for (const l of layers) {
        if (!isObject(l) || !isSafeLayerPath(l.path)) return fail('a layer path is not valid');
        if (paths.has(l.path)) return fail('a layer is listed twice');
        paths.add(l.path);
        if (typeof l.hash !== 'string') return fail('a layer hash is not valid');
        if (!isNumber(l.opacity) || l.opacity < 0 || l.opacity > 1) return fail('a layer opacity is not valid');
        if (l.vizParams !== null && !isObject(l.vizParams)) return fail('a layer style is not valid');
    }

    if (!isObject(split) || typeof split.enabled !== 'boolean' || !Array.isArray(split.positions)) return fail('split is not valid');
    if (split.enabled) {
        if (layers.length < 2 || split.positions.length !== layers.length - 1) return fail('split dividers do not match the layers');
        let previous = 0;
        for (const p of split.positions) {
            if (!isNumber(p) || p <= previous || p >= 1) return fail('split dividers are not valid');
            previous = p;
        }
    } else if (split.positions.length) {
        return fail('split dividers without split');
    }

    if (view !== null) {
        if (!isObject(view) || !Array.isArray(view.center) || view.center.length !== 2 || !view.center.every(isNumber)
            || !isNumber(view.zoom) || !isNumber(view.rotation)) return fail('view is not valid');
    }
    if (!isObject(display) || (display.basemap !== null && typeof display.basemap !== 'string')) return fail('display is not valid');
    return { error: null, newerVersion: false };
}

/** @param {ComparisonState} state */
export function encodeState(state) {
    return b64urlEncode(JSON.stringify(workingState(state)));
}

/**
 * @param {string} value
 * @returns {any} the parsed state, not validated
 */
export function decodeState(value) {
    return JSON.parse(b64urlDecode(value));
}

/** @param {unknown} value  a query value: the first one when repeated */
const single = value => (Array.isArray(value) ? value[0] : value);
/** @param {unknown} value */
const many = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * What a compare URL asks for. `state` is null when it names a saved comparison (`uid`) without
 * a working state: the caller resolves it from the saved list.
 * @param {Record<string, unknown>} query  route query
 * @returns {{ error: string } | { error: null, state: ComparisonState|null, uid: string|null, pick: boolean }}
 */
export function parseCompareQuery(query) {
    const uid = single(query.c);
    const s = single(query.s);
    const pick = single(query.pick) === '1';
    const cleanUid = typeof uid === 'string' && uid.length ? uid : null;

    if (typeof s === 'string' && s.length) {
        let state;
        try {
            state = decodeState(s);
        } catch {
            return { error: 'The comparison in this link cannot be read.' };
        }
        const check = validateState(state);
        if (check.newerVersion) return { error: 'This comparison was created by a newer version of the application.' };
        if (check.error) return { error: `The comparison in this link is not valid: ${check.error}.` };
        return { error: null, state: workingState(state), uid: cleanUid, pick };
    }
    if (cleanUid) return { error: null, state: null, uid: cleanUid, pick };

    const encoded = many(query.p);
    if (!encoded.length) return { error: 'This link does not name any raster to compare.' };
    if (encoded.length > MAX_LAYERS) return { error: `A comparison shows at most ${MAX_LAYERS} rasters.` };
    const paths = [];
    for (const p of encoded) {
        let path;
        try {
            path = b64urlDecode(String(p));
        } catch {
            return { error: 'A raster path in this link cannot be read.' };
        }
        if (!isSafeLayerPath(path)) return { error: 'A raster path in this link is not valid.' };
        if (!paths.includes(path)) paths.push(path);
    }
    return { error: null, state: stateFromPaths(paths), uid: null, pick };
}

/**
 * The query of the compare URL for a state: `c` alone for a saved comparison without changes,
 * else `s` (and `c` when saved). `tooLong` is set when `s` is over the limit: the URL cannot
 * hold the state and keeps `c` only.
 * @param {{ state: ComparisonState, uid?: string|null, clean?: boolean }} options
 * @returns {{ query: Record<string, string>, tooLong: boolean }}
 */
export function compareQuery({ state, uid = null, clean = false }) {
    /** @type {Record<string, string>} */
    const query = {};
    if (uid) query.c = uid;
    if (uid && clean) return { query, tooLong: false };
    const s = encodeState(state);
    if (s.length > MAX_STATE_PARAM) return { query, tooLong: true };
    query.s = s;
    return { query, tooLong: false };
}

/** @param {any} value */
function rounded(value) {
    if (typeof value === 'number') return Math.round(value * 1000) / 1000;
    if (Array.isArray(value)) return value.map(rounded);
    if (isObject(value)) {
        /** @type {Record<string, any>} */
        const out = {};
        for (const k of Object.keys(value).sort()) out[k] = rounded(value[k]);
        return out;
    }
    return value;
}

/**
 * Whether two states show the same comparison: the view (every pan and zoom) and the audit
 * fields do not count, numbers count to 3 decimals, and a state without a basemap matches any.
 * @param {ComparisonState} a @param {ComparisonState} b
 */
export function sameComparison(a, b) {
    // No basemap means the viewer's own: the map then shows (and reports) that one
    const anyBasemap = !a.display?.basemap || !b.display?.basemap;
    /** @param {ComparisonState} s */
    const strip = s => rounded({ ...workingState(s), view: null, display: anyBasemap ? null : s.display });
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Whether two views are the same (numbers to 3 decimals). @param {View|null} a @param {View|null} b */
export function sameView(a, b) {
    return JSON.stringify(rounded(a)) === JSON.stringify(rounded(b));
}

/**
 * Whether two states are the same, view included (numbers to 3 decimals).
 * @param {ComparisonState} a @param {ComparisonState} b
 */
export function sameState(a, b) {
    return JSON.stringify(rounded(workingState(a))) === JSON.stringify(rounded(workingState(b)));
}

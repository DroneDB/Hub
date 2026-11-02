// @ts-check
/**
 * The state of a map view: what the map viewer shows, and what a saved view keeps.
 *
 * A view is a base file (the file the viewer was opened on, any type the map shows), an ordered
 * list of georaster layers with their settings (index 0 is the top layer and the leftmost split
 * band), the split mode and dividers, the map position, the basemap and the elevation model of
 * the analysis tools.
 *
 * Whether the base file is a georaster is not stored: it is one exactly when `layers` lists it.
 * A georaster base is always one of the layers and a base of another type never is, so a state
 * with no layers has a base that is not a georaster. (The type of a file is not known here, so
 * a validator cannot tell a vector base with layers from a georaster base with the same
 * layers; the callers that know the type use `defaultState` and `buildEntryState`.)
 *
 * A state read from the dataset meta or from the browser history is validated before use: other
 * users write the meta and a history entry can be edited.
 */

export const VIEW_VERSION = 1;
export const MAX_LAYERS = 6;
export const MAX_NAME_LENGTH = 100;
// A saved view is one item of the dataset meta
export const MAX_VIEW_BYTES = 16 * 1024;
export const MAX_VIEWS = 100;

/** @typedef {{ path: string, hash: string, opacity: number, visible: boolean, vizParams: Record<string, any>|null }} Layer */
/** @typedef {{ path: string, hash: string }} BaseFile */
/** @typedef {{ center: number[], zoom: number, rotation: number }} MapPosition */
/**
 * @typedef {{ v: number, base: BaseFile, layers: Layer[], split: { enabled: boolean, positions: number[] },
 *             view: MapPosition|null, display: { basemap: string|null }, analysis: { target: string|null } }} ViewState
 */

const WORKING_KEYS = ['v', 'base', 'layers', 'split', 'view', 'display', 'analysis'];

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
export function newLayer(path, { hash = '', opacity = 1, visible = true, vizParams = null } = {}) {
    return { path, hash, opacity, visible, vizParams };
}

/**
 * The split of `count` layers: off, or on with equal bands (never below two layers).
 * @param {number} count @param {boolean} enabled
 */
export function splitFor(count, enabled) {
    const on = enabled && count >= 2;
    return { enabled: on, positions: on ? equalPositions(count) : [] };
}

/**
 * A file opened with the settings it has by default: its own georaster as the only layer, or no
 * layer when it is another type; split off, no saved position, the user's basemap and the
 * default elevation model.
 * @param {BaseFile} base
 * @param {{ baseIsGeoraster: boolean }} options
 * @returns {ViewState}
 */
export function defaultState(base, { baseIsGeoraster }) {
    return {
        v: VIEW_VERSION,
        base: { path: base.path, hash: base.hash },
        layers: baseIsGeoraster ? [newLayer(base.path, { hash: base.hash })] : [],
        split: splitFor(0, false),
        view: null,
        display: { basemap: null },
        analysis: { target: null }
    };
}

/**
 * The view that a file route opens with: the base file, then the files of the `add` values, in
 * order. A path that is not safe, repeats a layer (or is the base file when that is not a
 * georaster) or goes over the layer limit is left out. With two layers or more the split is on
 * with equal bands; an added file has no known hash yet.
 * @param {BaseFile} base
 * @param {unknown[]} addPaths  decoded dataset paths
 * @param {{ baseIsGeoraster: boolean }} options
 * @returns {ViewState}
 */
export function buildEntryState(base, addPaths, { baseIsGeoraster }) {
    const state = defaultState(base, { baseIsGeoraster });
    const seen = new Set([base.path]);
    for (const path of addPaths) {
        if (state.layers.length >= MAX_LAYERS) break;
        if (typeof path !== 'string' || !isSafeLayerPath(path) || seen.has(path)) continue;
        seen.add(path);
        state.layers.push(newLayer(path));
    }
    state.split = splitFor(state.layers.length, state.layers.length >= 2);
    return state;
}

/** The working fields of a state or saved item (no identity, name or audit fields). @param {any} item */
export function workingState(item) {
    /** @type {any} */
    const state = {};
    for (const k of WORKING_KEYS) state[k] = item[k];
    return /** @type {ViewState} */ (state);
}

const isNumber = /** @param {unknown} x */ x => typeof x === 'number' && Number.isFinite(x);
const isObject = /** @param {unknown} x */ x => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Why `state` is not a valid view, or null when it is. A state of a later version is not
 * checked further: `newerVersion` says so.
 * @param {any} state
 * @returns {{ error: string|null, newerVersion: boolean }}
 */
export function validateState(state) {
    const fail = /** @param {string} error */ error => ({ error, newerVersion: false });
    if (!isObject(state)) return fail('not an object');
    if (!Number.isInteger(state.v) || state.v < 1) return fail('no version');
    if (state.v > VIEW_VERSION) return { error: null, newerVersion: true };

    const { base, layers, split, view, display, analysis } = state;
    if (!isObject(base) || !isSafeLayerPath(base.path)) return fail('the base file path is not valid');
    if (typeof base.hash !== 'string') return fail('the base file hash is not valid');

    if (!Array.isArray(layers) || layers.length > MAX_LAYERS) return fail(`at most ${MAX_LAYERS} layers`);
    const paths = new Set();
    for (const l of layers) {
        if (!isObject(l) || !isSafeLayerPath(l.path)) return fail('a layer path is not valid');
        if (paths.has(l.path)) return fail('a layer is listed twice');
        paths.add(l.path);
        if (typeof l.hash !== 'string') return fail('a layer hash is not valid');
        if (!isNumber(l.opacity) || l.opacity < 0 || l.opacity > 1) return fail('a layer opacity is not valid');
        if (typeof l.visible !== 'boolean') return fail('a layer visibility is not valid');
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
            || !isNumber(view.zoom) || !isNumber(view.rotation)) return fail('the map position is not valid');
    }
    if (!isObject(display) || (display.basemap !== null && typeof display.basemap !== 'string')) return fail('display is not valid');
    if (!isObject(analysis) || (analysis.target !== null && !paths.has(analysis.target))) return fail('the elevation model is not one of the layers');
    return { error: null, newerVersion: false };
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
 * Whether two states show the same view: the map position and the audit fields do not count,
 * numbers count to 3 decimals, and a state without a basemap matches any (it uses the basemap
 * the user prefers, which the map then shows and reports).
 * @param {ViewState} a @param {ViewState} b
 */
export function sameView(a, b) {
    const anyBasemap = !a.display?.basemap || !b.display?.basemap;
    /** @param {ViewState} s */
    const strip = s => rounded({ ...workingState(s), view: null, display: anyBasemap ? null : s.display });
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Whether two map positions are the same (numbers to 3 decimals). @param {MapPosition|null} a @param {MapPosition|null} b */
export function samePosition(a, b) {
    return JSON.stringify(rounded(a)) === JSON.stringify(rounded(b));
}

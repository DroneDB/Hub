// @ts-check
/**
 * How a view's layers, split dividers, base file and elevation model change together. Every
 * layer change of the map viewer goes through these rules, so the bands always match the layers:
 *
 * - adding a layer puts it on top (index 0) and leaves the split as it is: off stays off, on
 *   stays on with equal bands for the new count (a view only starts split when it is opened
 *   from several files, see `startSplit`);
 * - removing a layer while split is on resets the bands to equal widths;
 * - removing down to one layer turns the split off and shows that layer;
 * - reordering and replacing a layer keep the band widths;
 * - the last layer stays, and so does a layer that would repeat another one;
 * - when the base file is removed or replaced, the base follows the layer that takes its place;
 * - the elevation model goes with its layer: it falls back to the default (null) when that
 *   layer is removed or replaced.
 *
 * Each function returns a new state, or the same one when the change is refused; the input is
 * not changed.
 */
import { MAX_LAYERS, newLayer, splitFor } from './viewState';

/** @typedef {import('./viewState').ViewState} ViewState */
/** @typedef {import('./viewState').Layer} Layer */

/**
 * @param {ViewState} state
 * @param {Layer[]} layers
 * @param {Partial<ViewState>} [changes]  other fields that change with the layers
 * @returns {ViewState}
 */
function withLayers(state, layers, changes = {}) {
    return { ...state, ...changes, layers, split: splitFor(layers.length, state.split.enabled) };
}

/**
 * The elevation model, unless it is the layer at `path`, which is going away.
 * @param {ViewState} state @param {string} path
 */
function analysisWithout(state, path) {
    return state.analysis.target === path ? { target: null } : state.analysis;
}

/**
 * Puts a layer on top.
 * @param {ViewState} state @param {{ path: string, hash?: string }} file
 */
export function addLayer(state, { path, hash = '' }) {
    if (state.layers.length >= MAX_LAYERS || state.layers.some(l => l.path === path)) return state;
    return withLayers(state, [newLayer(path, { hash }), ...state.layers]);
}

/**
 * Takes a layer out; refused for the last one. The base file removed makes the first remaining
 * layer the base file.
 * @param {ViewState} state @param {number} index
 */
export function removeLayer(state, index) {
    if (state.layers.length <= 1 || index < 0 || index >= state.layers.length) return state;
    const removed = state.layers[index];
    let layers = state.layers.filter((_, i) => i !== index);
    // One layer left is what the map shows: it cannot be hidden
    if (layers.length === 1) layers = [{ ...layers[0], visible: true }];
    const base = removed.path === state.base.path ? { path: layers[0].path, hash: layers[0].hash } : state.base;
    return withLayers(state, layers, { base, analysis: analysisWithout(state, removed.path) });
}

/** @param {ViewState} state @param {number} from @param {number} to */
export function moveLayer(state, from, to) {
    const n = state.layers.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
    const layers = [...state.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    return { ...state, layers };
}

/**
 * Puts another file in a layer's place (a missing file picked again): same place, opacity and
 * visibility; the plant-health parameters go, as the new file may have other bands.
 * @param {ViewState} state @param {number} index @param {{ path: string, hash?: string }} file
 */
export function replaceLayer(state, index, { path, hash = '' }) {
    if (index < 0 || index >= state.layers.length) return state;
    const old = state.layers[index];
    if (state.layers.some((l, i) => i !== index && l.path === path)) return state;
    const layers = state.layers.map((l, i) => (i === index ? newLayer(path, { hash, opacity: l.opacity, visible: l.visible }) : l));
    const changes = {
        base: old.path === state.base.path ? { path, hash } : state.base,
        // The same file picked again is still the elevation model
        analysis: path === old.path ? state.analysis : analysisWithout(state, old.path)
    };
    return { ...state, ...changes, layers };
}

/**
 * Turns the split on with equal bands, for a view that starts from several files; nothing
 * happens below two layers.
 * @param {ViewState} state
 */
export function startSplit(state) {
    if (state.layers.length < 2) return state;
    return { ...state, split: splitFor(state.layers.length, true) };
}

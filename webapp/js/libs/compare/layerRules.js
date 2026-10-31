// @ts-check
/**
 * How a comparison's layers and split dividers change together. Every layer change of the
 * compare view goes through these rules, so the bands always match the layers:
 *
 * - the second layer turns the split on, with equal bands;
 * - adding or removing a layer while split is on resets the bands to equal widths;
 * - removing down to one layer turns the split off;
 * - with split off, adding or removing leaves it off;
 * - reordering and replacing a layer keep the band widths.
 *
 * Each function returns a new state; the input is not changed.
 */
import { equalPositions, newLayer } from './compareState';

/** @typedef {import('./compareState').ComparisonState} ComparisonState */

/**
 * @param {ComparisonState} state
 * @param {import('./compareState').Layer[]} layers
 * @param {boolean} enabled  split on afterwards (ignored below two layers)
 * @returns {ComparisonState}
 */
function withLayers(state, layers, enabled) {
    const on = enabled && layers.length >= 2;
    return { ...state, layers, split: { enabled: on, positions: on ? equalPositions(layers.length) : [] } };
}

/**
 * Appends a layer as the rightmost band.
 * @param {ComparisonState} state @param {{ path: string, hash?: string }} file
 */
export function addLayer(state, { path, hash = '' }) {
    const layers = [...state.layers, newLayer(path, { hash })];
    return withLayers(state, layers, state.layers.length === 1 || state.split.enabled);
}

/** @param {ComparisonState} state @param {number} index */
export function removeLayer(state, index) {
    if (state.layers.length <= 1 || index < 0 || index >= state.layers.length) return state;
    const layers = state.layers.filter((_, i) => i !== index);
    return withLayers(state, layers, state.split.enabled);
}

/** @param {ComparisonState} state @param {number} from @param {number} to */
export function moveLayer(state, from, to) {
    const n = state.layers.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
    const layers = [...state.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    return { ...state, layers };
}

/**
 * Puts another file in a layer's place (a missing file picked again): same band and opacity;
 * the plant-health parameters go, as the new file may have other bands.
 * @param {ComparisonState} state @param {number} index @param {{ path: string, hash?: string }} file
 */
export function replaceLayer(state, index, { path, hash = '' }) {
    if (index < 0 || index >= state.layers.length) return state;
    const layers = state.layers.map((l, i) => (i === index ? newLayer(path, { hash, opacity: l.opacity }) : l));
    return { ...state, layers };
}

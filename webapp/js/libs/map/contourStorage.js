/**
 * Helpers for building OpenLayers / GeoJSON features for contour lines.
 *
 * Contour features piggyback on the shared measurements layer so they are
 * persisted with all the other measurements via the existing toolbar Save
 * button. They carry `measurementType: "contour"` for downstream styling
 * and an `unsaved` boolean flag that lets the composable selectively wipe
 * just the in-memory draft on regeneration. A file holds saved contours only:
 * the flag is never written, and a contour keeps its type and its level
 * (CONTOUR_PROPERTIES) through a save.
 */

import { newId } from '@/libs/ids';
import { formatRasterValue } from '@/libs/map/rasterUnit';

/**
 * What a contour has besides the properties of every measurement: its level, the unit of the level (the raster's,
 * not a unit of length), the step between the levels and whether it is a major line (every 5th level).
 */
export const CONTOUR_PROPERTIES = Object.freeze(['elev', 'unit', 'interval', 'isMajor']);

/** The flag of a contour that is not saved yet: generating the contours again replaces those. */
export const UNSAVED_FLAG = 'unsaved';

/**
 * Whether a feature of a file is a contour line: its type says so, or it is a contour that an older Hub saved as a
 * length (a line with the level and the major flag that only the Contours tool writes).
 * @param {any} feature  a GeoJSON feature
 */
function isStoredContour(feature) {
    const props = feature && typeof feature === 'object' ? feature.properties : null;
    if (!props || typeof props !== 'object') return false;
    if (props.measurementType === 'contour') return true;
    return props.measurementType === 'length' && feature.geometry?.type === 'LineString'
        && typeof props.elev === 'number' && typeof props.isMajor === 'boolean';
}

/**
 * The features of a file with every contour as a saved contour: of type contour, without the unsaved flag. An older
 * Hub saved a contour as a length, with the flag; a read repairs it, and the next save writes it so.
 * @param {any[]} features
 * @returns {any[]}  the same array when no feature needed it
 */
export function withSavedContours(features) {
    const needs = (/** @type {any} */ f) => isStoredContour(f) && (f.properties.measurementType !== 'contour' || UNSAVED_FLAG in f.properties);
    if (!features.some(needs)) return features;
    return features.map(f => {
        if (!needs(f)) return f;
        const properties = { ...f.properties, measurementType: 'contour' };
        delete properties[UNSAVED_FLAG];
        return { ...f, properties };
    });
}

// Default elevation color ramp (low -> high). Mirrors a terrain palette so
// users immediately recognize "low = blue/green, high = orange/white".
const ELEVATION_RAMP = [
    [0.00, [51, 51, 153]],   // deep blue
    [0.25, [0, 180, 180]],   // teal
    [0.50, [160, 217, 121]], // pale green
    [0.75, [236, 216, 122]], // sand
    [0.90, [169, 116, 67]],  // brown
    [1.00, [255, 255, 255]]  // snow
];

function lerp(a, b, t) { return a + (b - a) * t; }

function rampColor(t) {
    const x = Math.min(1, Math.max(0, t));
    for (let i = 1; i < ELEVATION_RAMP.length; i++) {
        const [hi, hiC] = ELEVATION_RAMP[i];
        if (x <= hi) {
            const [lo, loC] = ELEVATION_RAMP[i - 1];
            const k = hi === lo ? 0 : (x - lo) / (hi - lo);
            const r = Math.round(lerp(loC[0], hiC[0], k));
            const g = Math.round(lerp(loC[1], hiC[1], k));
            const b = Math.round(lerp(loC[2], hiC[2], k));
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    const [, last] = ELEVATION_RAMP[ELEVATION_RAMP.length - 1];
    return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

/**
 * Map an elevation to a color along the default terrain ramp.
 *
 * @param {number} elev - Elevation value
 * @param {number} min - Lower bound of the elevation range
 * @param {number} max - Upper bound of the elevation range
 */
export function colorForElevation(elev, min, max) {
    if (typeof elev !== 'number' || !isFinite(elev)) return rampColor(0.5);
    if (typeof min !== 'number' || typeof max !== 'number'
        || !isFinite(min) || !isFinite(max) || max <= min) {
        return rampColor(0.5);
    }
    return rampColor((elev - min) / (max - min));
}

/**
 * The text of the label of a contour: its level in the unit of the raster ("162.00 m", "29.1 °C"), as the
 * Raster Analysis panel writes a value of the raster. Null for a feature without a level.
 * @param {{ elev?: unknown, unit?: unknown }} properties  the properties of the contour feature
 * @returns {string|null}
 */
export function contourLevelText(properties) {
    const elev = properties && properties.elev;
    if (typeof elev !== 'number' || !Number.isFinite(elev)) return null;
    return formatRasterValue(elev, typeof properties.unit === 'string' ? properties.unit : '');
}

/**
 * Wrap a single contour LineString geometry into a measurement-shaped Feature.
 *
 * @param {Object} geometry - GeoJSON LineString geometry (WGS84).
 * @param {number} elev - Elevation value associated with the contour.
 * @param {Object} [extra] - Extra properties (e.g. interval, unit, isMajor,
 *   stroke - if provided, overrides the default contour stroke).
 * @returns {Object} GeoJSON Feature.
 */
export function buildContourFeature(geometry, elev, extra = {}) {
    if (!geometry || geometry.type !== 'LineString') {
        throw new Error('A LineString geometry is required.');
    }
    const isMajor = !!extra.isMajor;
    const now = new Date().toISOString();
    const stroke = extra.stroke || rampColor(0.5);
    // Format elevation with a sensible precision and add the unit if known.
    const elevLabel = (typeof elev === 'number' && isFinite(elev))
        ? (Math.abs(elev) >= 100 ? elev.toFixed(1) : elev.toFixed(2))
        : String(elev);
    const unitSuffix = extra.unit ? ` ${extra.unit}` : '';
    const name = extra.name || `Contour ${elevLabel}${unitSuffix}`;
    return {
        type: 'Feature',
        geometry,
        properties: {
            ...extra,
            id: extra.id || newId(),
            name,
            measurementType: 'contour',
            // Discriminator for the regeneration overwrite policy: only
            // features still flagged `unsaved` are removed when the user
            // generates a fresh batch.
            [UNSAVED_FLAG]: extra.unsaved !== undefined ? extra.unsaved : true,
            elev,
            stroke,
            'stroke-width': isMajor ? 2 : 1,
            createdAt: extra.createdAt || now
        }
    };
}

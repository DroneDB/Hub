/**
 * Helpers for building OpenLayers / GeoJSON features for contour lines.
 *
 * Contour features piggyback on the shared measurements layer so they are
 * persisted with all the other measurements via the existing toolbar Save
 * button. They carry `measurementType: "contour"` for downstream styling
 * and an `unsaved` boolean flag that lets the composable selectively wipe
 * just the in-memory draft on regeneration.
 */

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

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'ct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
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
            id: extra.id || makeId(),
            name,
            measurementType: 'contour',
            // Discriminator for the regeneration overwrite policy: only
            // features still flagged `unsaved` are removed when the user
            // generates a fresh batch.
            unsaved: extra.unsaved !== undefined ? extra.unsaved : true,
            elev,
            stroke,
            'stroke-width': isMajor ? 2 : 1,
            createdAt: extra.createdAt || now
        }
    };
}

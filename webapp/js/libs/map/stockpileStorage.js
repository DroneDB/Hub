/**
 * Persistent storage for stockpile volume polygons.
 *
 * Stockpiles are persisted side-by-side with regular 2D measurements in the same
 * `<basename>_measurements.geojson` file (the file MeasurementStorage uses).
 * Each stockpile is appended as a Feature with `measurementType === "stockpile"`
 * so it round-trips through `importFromGeoJSON()` and shows up in the
 * Measurement List dialog without any extra plumbing.
 *
 * Saves always APPEND a new feature - existing features (regular measurements
 * AND prior stockpiles) are preserved verbatim.
 */

const SUFFIX = '_measurements.geojson';
// Application id stamped on every file we own. Legacy values are still readable.
export const APP_ID = 'DroneDB Registry';
const LEGACY_APP_IDS = new Set([APP_ID, 'Registry-Stockpile', 'Registry-Orthophoto']);

/**
 * Build the storage path for a given raster file path.
 * @param {string} rasterPath - Dataset-relative path of the raster.
 * @returns {string|null} The storage path, or null if input is invalid.
 */
export function getStockpilePath(rasterPath) {
    if (!rasterPath) return null;
    if (rasterPath.endsWith(SUFFIX)) return rasterPath;
    const lastDot = rasterPath.lastIndexOf('.');
    const base = lastDot > 0 ? rasterPath.substring(0, lastDot) : rasterPath;
    return `${base}${SUFFIX}`;
}

/**
 * Just the file name (no directory) of the storage path. Useful for user-facing
 * "saved to <filename>" toast messages.
 */
export function getStockpileFileName(rasterPath) {
    const p = getStockpilePath(rasterPath);
    if (!p) return null;
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.substring(idx + 1) : p;
}

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'sp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function readExisting(dataset, path) {
    try {
        const content = await dataset.getFileContents(path);
        if (!content || (typeof content === 'string' && !content.trim())) return null;
        const fc = JSON.parse(content);
        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return null;
        if (fc.metadata && fc.metadata.application
            && !LEGACY_APP_IDS.has(fc.metadata.application)) {
            // Foreign file; refuse to merge to avoid corrupting unrelated data.
            console.warn('Refusing to merge stockpile into foreign GeoJSON file:',
                fc.metadata.application);
            return null;
        }
        return fc;
    } catch (e) {
        if (e && (e.status === 404 || /not found/i.test(String(e.message || '')))) return null;
        console.warn('Failed to read existing measurements file:', e);
        return null;
    }
}

function buildEmptyFC(rasterPath) {
    const now = new Date().toISOString();
    return {
        type: 'FeatureCollection',
        crs: { type: 'name', properties: { name: 'EPSG:4326' } },
        metadata: {
            version: '1.0',
            kind: 'measurements',
            rasterFile: rasterPath,
            createdAt: now,
            modifiedAt: now,
            application: APP_ID
        },
        features: []
    };
}

/**
 * Build a GeoJSON Feature for a stockpile polygon ready to be inserted into
 * the shared measurements FeatureCollection. Used both by `saveStockpile`
 * (persisted file) and by the in-memory adoption flow that puts the just-
 * computed polygon directly into the OL measurements layer (so the user can
 * persist it via the regular toolbar Save button instead of a dedicated one).
 *
 * @param {Object} polygon - GeoJSON Polygon geometry (WGS84).
 * @param {Object} [properties] - Property bag (material, notes, volumes, ...).
 * @returns {Object} GeoJSON Feature.
 */
export function buildStockpileFeature(polygon, properties = {}) {
    if (!polygon || polygon.type !== 'Polygon') {
        throw new Error('A Polygon geometry is required.');
    }
    const now = new Date().toISOString();
    return {
        type: 'Feature',
        geometry: polygon,
        properties: {
            ...properties,
            // Force the discriminators / styling regardless of caller input.
            id: properties.id || makeId(),
            measurementType: 'stockpile',
            stroke: properties.stroke || '#ff9800',
            'stroke-width': properties['stroke-width'] || 2,
            fill: properties.fill || 'rgba(255, 152, 0, 0.20)',
            'fill-opacity': properties['fill-opacity'] != null ? properties['fill-opacity'] : 0.2,
            createdAt: properties.createdAt || now,
            savedAt: now
        }
    };
}

/**
 * Persist a stockpile polygon + computed metrics by APPENDING a Feature to the
 * shared measurements file. Existing features (regular measurements and prior
 * stockpiles) are preserved.
 *
 * @returns {Promise<{path: string, fileName: string, feature: Object}>}
 */
export async function saveStockpile(dataset, rasterPath, polygon, properties = {}) {
    const path = getStockpilePath(rasterPath);
    if (!path) throw new Error('Cannot derive storage path for stockpile.');
    if (!dataset || typeof dataset.writeObj !== 'function') {
        throw new Error('Dataset is not available.');
    }

    const fc = (await readExisting(dataset, path)) || buildEmptyFC(rasterPath);
    fc.metadata = fc.metadata || {};
    fc.metadata.application = APP_ID;
    fc.metadata.modifiedAt = new Date().toISOString();
    if (!fc.metadata.createdAt) fc.metadata.createdAt = fc.metadata.modifiedAt;

    const feature = buildStockpileFeature(polygon, properties);

    fc.features.push(feature);

    const blob = new Blob([JSON.stringify(fc, null, 2)],
        { type: 'application/geo+json' });
    await dataset.writeObj(path, blob);

    return { path, fileName: getStockpileFileName(rasterPath), feature };
}

/**
 * Load the most recent stockpile feature (if any) from the shared measurements
 * file. Used to re-hydrate the Stockpile panel UI when the user reopens a
 * raster - the polygon itself is rendered by the regular measurements layer
 * (via importFromGeoJSON) when persisted with measurementType === 'stockpile'.
 *
 * @param {Object} dataset
 * @param {string} rasterPath
 * @param {Set<string>|Array<string>} [excludeIds] - Feature IDs to skip while
 *   walking the file in reverse. Used to avoid re-hydrating piles the user
 *   has just removed via the Measurement List dialog (the deletion is not
 *   persisted to disk until the next "Save").
 * @returns {Promise<{polygon: Object, properties: Object}|null>}
 */
export async function loadStockpile(dataset, rasterPath, excludeIds) {
    const path = getStockpilePath(rasterPath);
    if (!path) return null;
    const fc = await readExisting(dataset, path);
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return null;
    const exclude = excludeIds instanceof Set
        ? excludeIds
        : (Array.isArray(excludeIds) ? new Set(excludeIds) : null);
    const isStockpileFeature = f =>
        f && f.geometry && f.geometry.type === 'Polygon'
        && f.properties && f.properties.measurementType === 'stockpile';
    const isExcluded = f => exclude
        && f.properties && f.properties.id
        && exclude.has(f.properties.id);

    // Walk in reverse so we pick the most recent non-excluded stockpile.
    let feature = null;
    for (let i = fc.features.length - 1; i >= 0; i--) {
        const f = fc.features[i];
        if (isStockpileFeature(f) && !isExcluded(f)) {
            feature = f;
            break;
        }
    }
    if (!feature
        && fc.metadata && fc.metadata.kind === 'stockpile'
        && fc.features.length === 1
        && fc.features[0].geometry && fc.features[0].geometry.type === 'Polygon'
        && !isExcluded(fc.features[0])) {
        // Legacy file written by previous versions (single untagged polygon).
        feature = fc.features[0];
    }
    if (!feature) return null;
    return { polygon: feature.geometry, properties: feature.properties || {} };
}

/**
 * Best-effort delete of the entire saved file. Used by callers that want to
 * wipe all stockpile state (rarely - normal deletion happens through the
 * Measurement List dialog now).
 */
export async function deleteStockpile(dataset, rasterPath) {
    const path = getStockpilePath(rasterPath);
    if (!path) return;
    try { await dataset.deleteObj(path); } catch (e) { /* best-effort */ }
}

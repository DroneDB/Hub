/**
 * Persistent storage for stockpile volume polygons.
 *
 * Mirrors the MeasurementStorage pattern: a single GeoJSON file is written
 * next to the source raster (`<basename>_measurements.geojson`) so it can be
 * auto-loaded the next time the dataset is opened.
 */

const SUFFIX = '_measurements.geojson';

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
 * Persist a stockpile polygon + computed metrics as a GeoJSON FeatureCollection.
 * @param {Object} dataset - Dataset wrapper exposing `writeObj`.
 * @param {string} rasterPath - Dataset-relative raster path.
 * @param {Object} polygon - GeoJSON Polygon geometry.
 * @param {Object} [properties] - Extra feature properties (volumes, material, etc.).
 */
export async function saveStockpile(dataset, rasterPath, polygon, properties = {}) {
    const path = getStockpilePath(rasterPath);
    if (!path) throw new Error('Cannot derive storage path for stockpile.');
    if (!polygon || polygon.type !== 'Polygon') throw new Error('A Polygon geometry is required.');

    const now = new Date().toISOString();
    const featureCollection = {
        type: 'FeatureCollection',
        crs: { type: 'name', properties: { name: 'EPSG:4326' } },
        metadata: {
            version: '1.0',
            kind: 'stockpile',
            rasterFile: rasterPath,
            createdAt: properties.createdAt || now,
            modifiedAt: now,
            application: 'Registry-Stockpile'
        },
        features: [{
            type: 'Feature',
            geometry: polygon,
            properties: { ...properties, savedAt: now }
        }]
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)],
        { type: 'application/geo+json' });
    return dataset.writeObj(path, blob);
}

/**
 * Load a previously saved stockpile FeatureCollection.
 * @returns {Promise<{polygon: Object, properties: Object}|null>}
 *          Polygon geometry + feature properties, or null if no saved file exists.
 */
export async function loadStockpile(dataset, rasterPath) {
    const path = getStockpilePath(rasterPath);
    if (!path) return null;
    try {
        const content = await dataset.getFileContents(path);
        if (!content || (typeof content === 'string' && !content.trim())) return null;
        const fc = JSON.parse(content);
        const feature = fc && fc.features && fc.features[0];
        if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') return null;
        return { polygon: feature.geometry, properties: feature.properties || {} };
    } catch (e) {
        if (e && (e.status === 404 || /not found/i.test(String(e.message || '')))) return null;
        console.warn('Failed to load saved stockpile:', e);
        return null;
    }
}

/**
 * Delete a saved stockpile file (no-op if it does not exist).
 */
export async function deleteStockpile(dataset, rasterPath) {
    const path = getStockpilePath(rasterPath);
    if (!path) return;
    try { await dataset.deleteObj(path); } catch (e) { /* best-effort */ }
}

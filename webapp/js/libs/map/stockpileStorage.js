/**
 * Stockpile volume polygons as measurement features.
 *
 * Stockpiles are persisted side-by-side with regular 2D measurements in the same
 * `<basename>_measurements.geojson` file (the file MeasurementStorage writes).
 * Each stockpile is a Feature with `measurementType === "stockpile"` so it
 * round-trips through `importFromGeoJSON()` and shows up in the Measurement
 * List dialog without any extra plumbing. This module builds that feature and
 * reads the latest one back; the measurements toolbar saves the file.
 */

import { pathutils } from 'ddb';
import { newId as makeId } from '@/libs/ids';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';
import { ANALYSIS_FILL } from '@/libs/map/analysisStyles';

const SUFFIX = '_measurements.geojson';
// Application id stamped on every file we own. Legacy values are still readable.
const APP_ID = 'DroneDB Registry';
const LEGACY_APP_IDS = new Set([APP_ID, 'Registry-Stockpile', 'Registry-Orthophoto']);

/**
 * The properties of a stockpile feature beyond those of every measurement: what was measured and
 * what it was weighed and priced with (the material's name, density, price per tonne and
 * currency), so a saved pile reads the same for a user whose materials differ.
 */
export const STOCKPILE_PROPERTIES = Object.freeze([
    'id', 'title', 'material', 'materialName', 'materialDensity', 'costPerTon', 'currency',
    'netVolume', 'cutVolume', 'fillVolume',
    'area2d', 'area3d', 'baseElevation', 'confidence',
    'weightEstimate', 'costEstimate', 'unitSystem', 'savedAt'
]);

/**
 * Build the storage path for a given raster file path.
 * @param {string} rasterPath - Dataset-relative path of the raster.
 * @returns {string|null} The storage path, or null if input is invalid.
 */
function getStockpilePath(rasterPath) {
    if (!rasterPath) return null;
    if (rasterPath.endsWith(SUFFIX)) return rasterPath;
    return `${pathutils.dropExtension(rasterPath)}${SUFFIX}`;
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

/**
 * Build a GeoJSON Feature for a stockpile polygon ready to be inserted into
 * the shared measurements FeatureCollection. The just-computed polygon goes
 * directly into the OL measurements layer, so the user persists it with the
 * regular toolbar Save button.
 *
 * @param {Object} polygon - GeoJSON Polygon geometry (WGS84).
 * @param {Object} [properties] - Property bag (material, description, volumes, ...).
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
            stroke: properties.stroke || ANALYSIS_COLOR,
            'stroke-width': properties['stroke-width'] || 2,
            fill: properties.fill || ANALYSIS_FILL,
            'fill-opacity': properties['fill-opacity'] != null ? properties['fill-opacity'] : 0.2,
            createdAt: properties.createdAt || now,
            savedAt: now
        }
    };
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

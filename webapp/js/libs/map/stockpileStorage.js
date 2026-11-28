/**
 * Stockpile volume polygons as measurement features.
 *
 * Stockpiles are persisted side-by-side with regular 2D measurements in the measurements file of the
 * map (the file MeasurementStorage writes: `<name>_measurements.geojson` for a map with one file,
 * `measurements.geojson` of the folder otherwise).
 * Each stockpile is a Feature with `measurementType === "stockpile"` so it
 * round-trips through `importFromGeoJSON()` and shows up in the Measurement
 * List dialog without any extra plumbing. This module builds that feature and
 * reads the latest one back; the measurements toolbar saves the file.
 */

import { pathutils } from 'ddb';
import GeoJSON from 'ol/format/GeoJSON';
import { EPSG } from '@/libs/constants';
import { newId as makeId } from '@/libs/ids';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';
import { ANALYSIS_FILL } from '@/libs/map/analysisStyles';
import { parse, sectionOf, VIEW } from '@/libs/map/measurementFormat';
import { isNotFound } from '@/libs/ddb/apiError';
import { isListed } from '@/libs/optionalFile';
import { isBaseMethod } from '@/libs/stockpileBase';

const SUFFIX = '_measurements.geojson';

/**
 * The properties of a stockpile feature beyond those of every measurement: what was measured, the
 * base the volumes are from (libddb's basePlaneMethod), and what it was weighed and priced with
 * (the material's name, density, price per tonne and currency), so a saved pile reads the same
 * for a user whose materials differ. `sourceRaster` is the elevation model the volumes were measured on and
 * `flatElevation` the elevation of the flat base, so the pile can be measured again whatever the map shows.
 */
export const STOCKPILE_PROPERTIES = Object.freeze([
    'id', 'title', 'material', 'materialName', 'materialDensity', 'costPerTon', 'currency',
    'netVolume', 'cutVolume', 'fillVolume',
    'area2d', 'area3d', 'baseElevation', 'basePlaneMethod', 'sourceRaster', 'flatElevation', 'confidence',
    'weightEstimate', 'costEstimate', 'unitSystem', 'savedAt', 'detectionKey'
]);

/** What a measured pile says of itself: the volumes, the base they are from and the model they were measured on */
export const RESULT_PROPERTIES = Object.freeze(['netVolume', 'cutVolume', 'fillVolume', 'area2d', 'area3d', 'baseElevation', 'confidence',
    'basePlaneMethod', 'sourceRaster', 'flatElevation', 'weightEstimate', 'costEstimate']);

/**
 * The properties a measured pile is saved with for what was measured (RESULT_PROPERTIES), the ones that are
 * numbers or estimates only: a result that lacks one leaves it out.
 * @param {Record<string, any>|null} r  a result of the panel
 */
export function propertiesOfResult(r) {
    const props = {};
    if (!r) return props;
    for (const k of ['netVolume', 'cutVolume', 'fillVolume', 'area2d', 'area3d', 'baseElevation', 'confidence', 'flatElevation']) {
        if (typeof r[k] === 'number') props[k] = r[k];
    }
    if (isBaseMethod(r.basePlaneMethod)) props.basePlaneMethod = r.basePlaneMethod;
    if (typeof r.sourceRaster === 'string' && r.sourceRaster) props.sourceRaster = r.sourceRaster;
    if (r.weightEstimate) props.weightEstimate = r.weightEstimate;
    if (r.costEstimate) props.costEstimate = r.costEstimate;
    return props;
}

/**
 * The result the panel shows for a saved pile, from its properties; null for a pile saved with no volume.
 * @param {Record<string, any>} p
 */
export function resultOfProperties(p) {
    if (p.netVolume == null && p.cutVolume == null && p.area2d == null) return null;
    return Object.fromEntries(RESULT_PROPERTIES.map(k => [k, p[k]]));
}

/**
 * The elevation model a pile saved without `sourceRaster` was measured on (every pile before it was
 * recorded), worked out when the file is read; nothing is written. The file says which raster its
 * measurements are of (`metadata.views.map.orthophotoFile`); a file that does not is the sidecar of the
 * raster whose name it has (`<stem>_measurements.geojson`), when that is the raster in hand.
 * @param {Record<string, any>} doc  the file as measurementFormat reads it
 * @param {string} measurementsPath  the file
 * @param {string|null|undefined} rasterPath  the raster the panel is on
 * @returns {string|null}
 */
export function legacySourceRaster(doc, measurementsPath, rasterPath) {
    const recorded = sectionOf(doc, VIEW.MAP).orthophotoFile;
    if (typeof recorded === 'string' && recorded) return recorded;
    return rasterPath && `${pathutils.dropExtension(rasterPath)}${SUFFIX}` === measurementsPath ? rasterPath : null;
}

/**
 * The outline of a stockpile feature as a WGS84 GeoJSON polygon (what the volume is asked for).
 * @param {import('ol/Feature').default} feature
 * @param {import('ol/proj').ProjectionLike} featureProjection  the projection of the map it is on
 * @returns {Record<string, any>|null}  null for a feature with no polygon
 */
export function stockpilePolygonOf(feature, featureProjection = EPSG.WEB_MERCATOR) {
    const geometry = feature.getGeometry();
    if (!geometry || geometry.getType() !== 'Polygon') return null;
    return new GeoJSON().writeGeometryObject(geometry, { dataProjection: EPSG.WGS84, featureProjection });
}

/**
 * A short key of the outline a pile was found with by "Find all piles" (a WGS84 GeoJSON polygon, as the server
 * gives it). A pile added from the list keeps it (`detectionKey`), so the same pile found again is known as that
 * measurement after its outline was edited, when its outline is not the one found any more. The search finds the
 * same outline, to the last digit, while the raster and the sensitivity are the same.
 * @param {{ coordinates: number[][][] }|null} polygon
 * @returns {string|null}
 */
export function detectionKeyOf(polygon) {
    const rings = polygon && polygon.coordinates;
    if (!Array.isArray(rings) || !rings.length) return null;
    const text = rings.map(ring => ring.map(([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`).join(';')).join('|');
    // FNV-1a, 32 bits, twice with two seeds: a key that two piles of one raster do not share
    const hash = seed => {
        let h = seed >>> 0;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
    };
    return `${hash(0x811c9dc5)}${hash(0x01234567)}`;
}

/**
 * Whether two GeoJSON polygons (WGS84) are the same outline: the same rings with the same vertices, within
 * `tolerance` degrees. A pile found again by "Find all piles" has the outline of the measurement it was added as
 * (the detection does not change while the raster and the sensitivity do not), up to the rounding of its trip
 * through the map's projection, so this tells a pile that is a measurement already from a new one.
 * @param {{ coordinates: number[][][] }|null} a
 * @param {{ coordinates: number[][][] }|null} b
 * @param {number} [tolerance]  in degrees (1e-7 is about 1 cm)
 */
export function sameOutline(a, b, tolerance = 1e-7) {
    const ra = a && a.coordinates;
    const rb = b && b.coordinates;
    if (!Array.isArray(ra) || !Array.isArray(rb) || ra.length !== rb.length) return false;
    return ra.every((ring, i) => ring.length === rb[i].length
        && ring.every((pt, j) => Math.abs(pt[0] - rb[i][j][0]) <= tolerance && Math.abs(pt[1] - rb[i][j][1]) <= tolerance));
}

/**
 * The measurements file as measurementFormat reads it (the files of every earlier writer, the 3D
 * viewer's among them, and of the stockpile panel). Nothing is written. A missing file, or one that
 * cannot be used (not GeoJSON, of another application), has no stockpile to show: null.
 * The file is asked for only when the listing of its folder holds it: most rasters have none, and
 * the request would be a 404 that the browser logs as an error each time the panel opens.
 */
async function readExisting(dataset, path) {
    if (!(await isListed(dataset, path))) return null;
    try {
        return parse(await dataset.getFileContents(path));
    } catch (e) {
        // No file yet (the Registry's 404): nothing saved, nothing to say
        if (isNotFound(e)) return null;
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
 * Load a stockpile feature (if any) from the measurements file the map shows. Used to re-hydrate
 * the Stockpile panel UI when the user reopens it - the polygon itself is rendered by the regular
 * measurements layer (via importFromGeoJSON) when persisted with measurementType === 'stockpile'.
 *
 * The pile measured on `rasterPath` that was saved last is the one; a file with none of that raster
 * gives the most recent pile of any. A pile saved without `sourceRaster` is given the one the file
 * implies (legacySourceRaster), in the returned properties only.
 *
 * @param {Object} dataset
 * @param {string} measurementsPath - Dataset-relative path of the measurements file the map shows.
 * @param {string} [rasterPath] - The raster the panel is on.
 * @param {Set<string>|Array<string>} [excludeIds] - Feature IDs to skip while
 *   walking the file in reverse. Used to avoid re-hydrating piles the user
 *   has just removed via the Measurement List dialog (the deletion is not
 *   persisted to disk until the next "Save").
 * @returns {Promise<{polygon: Object, properties: Object, defaultRaster: string|null}|null>}
 *   `defaultRaster`: the raster the file's piles without `sourceRaster` belong to
 */
export async function loadStockpile(dataset, measurementsPath, rasterPath, excludeIds) {
    if (!measurementsPath) return null;
    const fc = await readExisting(dataset, measurementsPath);
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

    const defaultRaster = legacySourceRaster(fc, measurementsPath, rasterPath);
    const rasterOf = f => (f.properties && f.properties.sourceRaster) || defaultRaster;

    // Walk in reverse so we pick the most recent non-excluded stockpile, of the raster in hand first.
    const piles = fc.features.filter(f => isStockpileFeature(f) && !isExcluded(f)).reverse();
    let feature = piles.find(f => rasterOf(f) === rasterPath) ?? piles[0] ?? null;
    if (!feature
        && fc.metadata && fc.metadata.kind === 'stockpile'
        && fc.features.length === 1
        && fc.features[0].geometry && fc.features[0].geometry.type === 'Polygon'
        && !isExcluded(fc.features[0])) {
        // Legacy file written by previous versions (single untagged polygon).
        feature = fc.features[0];
    }
    if (!feature) return null;
    const properties = { ...(feature.properties || {}) };
    const sourceRaster = rasterOf(feature);
    if (sourceRaster) properties.sourceRaster = sourceRaster;
    return { polygon: feature.geometry, properties, defaultRaster };
}

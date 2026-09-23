/**
 * rasterZoom - Zoom-range helpers for on-the-fly rendered raster XYZ layers.
 *
 * Raster tiles are generated on demand from the source file, so the only real
 * cap on zoom is the native GSD of the raster. The viewer used to hard-cap
 * layers at z22 (~3.7 cm/px at the equator), which hides sub-cm detail.
 *
 * Source zoom ceilings derive from each entry's native GSD zoom; the view
 * maxZoom is the largest native zoom across entries plus a small
 * magnification allowance, capped by OL's own default.
 */

import { transformExtent } from 'ol/proj';
import { getWidth, getHeight } from 'ol/extent';
import bbox from '@turf/bbox';

// m/px at the equator for zoom 0 of the 256 px Web Mercator tile pyramid
export const INITIAL_RESOLUTION = 156543.0339280410;
// Native zoom assumed when width/height or geometry are unavailable
export const FALLBACK_NATIVE_ZOOM = 22;
// Lowest source maxZoom (keeps low-res sources usable at deep zoom)
export const SOURCE_MIN_ZOOM = 14;
// Upper bound to keep first-hit on-demand GDAL warping costs sane
export const HARD_MAX_ZOOM = 26;
// Extra zoom levels the view allows beyond the deepest native zoom
export const VIEW_MAGNIFICATION = 1;
// OpenLayers default View maxZoom
export const OL_DEFAULT_MAX_ZOOM = 28;

/**
 * True when tiles should be requested as @2x (512 px) for HiDPI screens.
 */
export function useRetinaTiles() {
    return (window.devicePixelRatio || 1) > 1;
}

/**
 * Compute the native zoom level of a raster entry from its GSD.
 *
 * @param {object} entry Indexed entry (properties.width/height, polygon_geom).
 * @returns {number} native zoom, clamped to [0, HARD_MAX_ZOOM].
 */
export function computeNativeZoom(entry) {
    const width = entry?.properties?.width;
    const height = entry?.properties?.height;
    if (!width || !height || width <= 0 || height <= 0 || !entry?.polygon_geom) {
        return FALLBACK_NATIVE_ZOOM;
    }

    const ext3857 = transformExtent(bbox(entry.polygon_geom), 'EPSG:4326', 'EPSG:3857');
    const gsd = Math.max(getWidth(ext3857) / width, getHeight(ext3857) / height);
    if (!isFinite(gsd) || gsd <= 0) return FALLBACK_NATIVE_ZOOM;

    const native = Math.ceil(Math.log2(INITIAL_RESOLUTION / gsd));
    return Math.min(HARD_MAX_ZOOM, Math.max(0, native));
}

/**
 * Max zoom to grant the tile source for an entry, adjusting for retina tiles.
 *
 * @param {number} native Native zoom from computeNativeZoom.
 * @param {boolean} retina Whether tiles render at @2x (removes one level).
 * @returns {number} maxZoom value to pass to the tile source.
 */
export function sourceMaxZoom(native, retina) {
    const zoom = (native ?? FALLBACK_NATIVE_ZOOM) - (retina ? 1 : 0);
    return Math.min(HARD_MAX_ZOOM, Math.max(SOURCE_MIN_ZOOM, zoom));
}

/**
 * Max zoom to grant the map view, given the native zooms of visible entries.
 *
 * @param {number[]} natives Native zoom levels (non-finite values ignored).
 * @returns {number} maxZoom value to pass to the View.
 */
export function viewMaxZoom(natives) {
    const f = Array.isArray(natives) ? natives.filter((n) => Number.isFinite(n)) : [];
    if (!f.length) return OL_DEFAULT_MAX_ZOOM;
    return Math.min(Math.max(...f) + VIEW_MAGNIFICATION, HARD_MAX_ZOOM + 1, OL_DEFAULT_MAX_ZOOM);
}

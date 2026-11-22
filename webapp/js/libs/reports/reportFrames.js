// @ts-check
/**
 * Where a report snapshot looks: the extent of the geometries it draws and the frame it is framed to, in WGS84
 * ([west, south, east, north] in degrees). The renderer draws it; these are the numbers it is asked for.
 */
import { MAP_MAX_LATITUDE } from '@/libs/format';

/** An item snapshot adds this share of its extent on each side. */
export const FRAME_PADDING = 0.25;
/** An item snapshot is at least this wide on the ground, in metres. */
export const MIN_FRAME_METRES = 40;

const METRES_PER_DEGREE = 111320;

/**
 * The positions of a GeoJSON geometry.
 * @param {any} geometry
 * @returns {number[][]}
 */
function positionsOf(geometry) {
    /** @param {any} c @returns {number[][]} */
    const flat = c => (Array.isArray(c) && typeof c[0] === 'number' ? [c] : Array.isArray(c) ? c.flatMap(flat) : []);
    return flat(geometry?.coordinates).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/**
 * The extent of some geometries, or null when they have no position.
 * @param {any[]} geometries  GeoJSON geometries in WGS84
 * @returns {[number, number, number, number] | null}
 */
export function extentOf(geometries) {
    const positions = geometries.flatMap(positionsOf);
    if (!positions.length) return null;
    const lons = positions.map(p => p[0]);
    const lats = positions.map(p => p[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/**
 * The frame of a snapshot: the extent with a quarter of its size added on each side, and at least 40 m wide and 40 m
 * high on the ground (a point has no size of its own and gets a square of 40 m). The latitude stays on the map.
 * @param {[number, number, number, number] | null} extent
 * @returns {[number, number, number, number] | null}
 */
export function frameOf(extent) {
    if (!extent) return null;
    const [west, south, east, north] = extent;
    const middleLat = (south + north) / 2;
    const metresPerLon = Math.max(METRES_PER_DEGREE * Math.cos((middleLat * Math.PI) / 180), 1);
    const minLon = MIN_FRAME_METRES / metresPerLon;
    const minLat = MIN_FRAME_METRES / METRES_PER_DEGREE;
    const width = Math.max((east - west) * (1 + 2 * FRAME_PADDING), minLon);
    const height = Math.max((north - south) * (1 + 2 * FRAME_PADDING), minLat);
    const middleLon = (west + east) / 2;
    return [
        middleLon - width / 2,
        Math.max(middleLat - height / 2, -MAP_MAX_LATITUDE),
        middleLon + width / 2,
        Math.min(middleLat + height / 2, MAP_MAX_LATITUDE)
    ];
}

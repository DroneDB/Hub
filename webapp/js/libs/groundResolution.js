// @ts-check
/**
 * The ground resolution of a raster, measured on its WGS84 footprint.
 *
 * DroneDB transforms the four raster corners to WGS84 with GDAL, so the distances
 * between them are ground metres for any coordinate system: metres, US feet,
 * degrees or Mercator, whose units are not ground metres away from the equator.
 */
import { coordAll } from '@turf/meta';
import { haversineMeters } from '@/libs/map/flightPath';
import { formatExtent, formatLandArea, formatPixelSize } from '@/libs/format';

/**
 * Ground width and height in metres of a raster footprint whose corners are, in
 * order, upper left, upper right, lower right and lower left. Each side is the
 * mean of its two opposite edges. Null when there is no such footprint.
 * @param {any} polygonGeom - The polygon_geom of the entry (GeoJSON Feature or geometry)
 * @returns {{ width: number, height: number } | null}
 */
export function footprintGroundSize(polygonGeom) {
    let corners;
    try {
        corners = coordAll(polygonGeom);
    } catch {
        return null;
    }
    if (corners.length < 4) return null;
    const [ul, ur, lr, ll] = corners;
    const width = (haversineMeters(ul, ur) + haversineMeters(ll, lr)) / 2;
    const height = (haversineMeters(ul, ll) + haversineMeters(ur, lr)) / 2;
    return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The ground size of a pixel with the ground extent and area of the raster, in the
 * user's units, the pixel size on its own line: "5.0 cm/px\n179 x 193 m (3.4 ha)",
 * "2.0 in/px\n295 x 289 ft (2.03 acres)".
 * Null without a footprint or pixel size.
 * @param {any} polygonGeom - The WGS84 footprint of the raster
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {'metric'|'imperial'|string} [units]
 * @returns {string | null}
 */
export function formatGroundResolution(polygonGeom, widthPx, heightPx, units = 'metric') {
    if (!(widthPx > 0 && heightPx > 0)) return null;
    const size = footprintGroundSize(polygonGeom);
    if (!size) return null;
    const pixel = formatPixelSize(size.width / widthPx, size.height / heightPx, units);
    return `${pixel}\n${formatExtent(size.width, size.height, units)} (${formatLandArea(size.width * size.height, units)})`;
}

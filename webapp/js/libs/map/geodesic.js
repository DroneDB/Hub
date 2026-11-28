// @ts-check
/**
 * Lengths and areas of map geometries on the WGS84 ellipsoid.
 *
 * The map's coordinates are Web Mercator, whose metres are not ground metres (0.56 of them at 56°N),
 * so a geometry is converted to longitude / latitude before it is measured, and GeographicLib never
 * sees a Mercator number. The measuring itself is libs/map/geodesicCore's, which has no map library,
 * so the report model gives the numbers of the map.
 */
import { toLonLat } from 'ol/proj';
import { EPSG } from '@/libs/constants';
import { linesLength, polygonArea, lonLatLength, lonLatArea } from './geodesicCore';

/**
 * Positions of a map geometry's coordinates as [lon, lat] pairs
 * @param {number[][]} coords  positions in the source projection
 * @param {string} projection
 * @returns {number[][]}
 */
const lonLatsIn = (coords, projection) =>
    projection === EPSG.WGS84 ? coords : coords.map((c) => toLonLat(c, projection));

/**
 * Lines or rings of a map geometry as [lon, lat] positions
 * @param {number[][][]} lines  lines or rings in the source projection
 * @param {string} projection
 * @returns {number[][][]}
 */
const linesIn = (lines, projection) => lines.map((c) => lonLatsIn(c, projection));

/**
 * The length in metres of a line on the WGS84 ellipsoid: the sum of the geodesic distance of each
 * segment. A polygon gives its perimeter. 0 for a geometry without a length (a point) and for
 * fewer than two positions.
 * @param {any} input  an OpenLayers geometry in `projection`, or longitude / latitude coordinates:
 *   a line [[lon, lat], ...], several lines or the rings of a polygon [[[lon, lat], ...], ...]
 * @param {string} [projection]  the projection of a geometry (the map's by default)
 * @returns {number}
 */
export function geodesicLength(input, projection = EPSG.WEB_MERCATOR) {
    if (!input || typeof input.getType !== 'function') return lonLatLength(input);
    switch (input.getType()) {
        case 'LineString':
        case 'LinearRing':
            return linesLength([lonLatsIn(input.getCoordinates(), projection)]);
        case 'MultiLineString':
        case 'Polygon':
            return linesLength(linesIn(input.getCoordinates(), projection));
        case 'MultiPolygon':
            return linesLength(linesIn(input.getCoordinates().flat(), projection));
        default:
            return 0;
    }
}

/**
 * The area in square metres of a polygon on the WGS84 ellipsoid: its outer ring less the area of each
 * of its holes (as ol/sphere did), whatever the winding. A multi-polygon gives the sum of its polygons,
 * each with its own holes taken off. 0 for fewer than three distinct positions and for a geometry
 * without an area.
 * @param {any} input  an OpenLayers geometry in `projection`, or the longitude / latitude coordinates of
 *   a ring [[lon, lat], ...] or of a polygon [[[lon, lat], ...], ...] (the outer ring, then the holes)
 * @param {string} [projection]  the projection of a geometry (the map's by default)
 * @returns {number}
 */
export function geodesicArea(input, projection = EPSG.WEB_MERCATOR) {
    if (!input || typeof input.getType !== 'function') return lonLatArea(input);
    switch (input.getType()) {
        case 'Polygon':
            return polygonArea(linesIn(input.getCoordinates(), projection));
        case 'MultiPolygon':
            return input.getCoordinates().reduce(
                (/** @type {number} */ sum, /** @type {number[][][]} */ polygon) => sum + polygonArea(linesIn(polygon, projection)), 0);
        default:
            return 0;
    }
}

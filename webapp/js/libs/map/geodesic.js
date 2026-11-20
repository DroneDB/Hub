// @ts-check
/**
 * Lengths and areas of map geometries on the WGS84 ellipsoid (FR-MAP-15, D-032).
 *
 * GeographicLib is the algorithm GDAL uses, so the map gives the numbers of ddb: Inverse for each
 * segment of a line, PolygonArea for a polygon. The results are metres and square metres; libs/format.js
 * formats them. The map's coordinates are Web Mercator, whose metres are not ground metres (0.56 of
 * them at 56°N), so a geometry is converted to longitude / latitude before it is measured, and
 * GeographicLib never sees a Mercator number.
 */
import { Geodesic, PolygonArea } from 'geographiclib-geodesic';
import { toLonLat } from 'ol/proj';
import { EPSG } from '@/libs/constants';

const WGS84 = Geodesic.WGS84;

/**
 * A longitude in [-180, 180]
 * @param {number} lon
 */
function normaliseLon(lon) {
    if (lon >= -180 && lon <= 180) return lon;
    const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
    // 180 and -180 are the same meridian: keep +180 for a positive input like the one given
    return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

/**
 * @param {any} v
 * @returns {boolean} true when v is a position [x, y, ...]
 */
const isPosition = (v) => Array.isArray(v) && typeof v[0] === 'number';

/**
 * Positions of a map geometry's coordinates as [lon, lat] pairs, longitudes in [-180, 180]
 * @param {number[][]} coords  positions in the source projection
 * @param {string} projection
 * @returns {number[][]}
 */
function toLonLats(coords, projection) {
    const out = [];
    for (const c of coords) {
        const [lon, lat] = projection === EPSG.WGS84 ? c : toLonLat(c, projection);
        if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([normaliseLon(lon), lat]);
    }
    return out;
}

/**
 * Lines of a geometry (or of coordinates) as arrays of [lon, lat]. A polygon gives its rings.
 * @param {any} input  an OpenLayers geometry in `projection`, or coordinates in longitude / latitude:
 *   a line [[lon, lat], ...], several lines or the rings of a polygon [[[lon, lat], ...], ...]
 * @param {string} projection  the projection of a geometry
 * @returns {number[][][]}
 */
function linesOf(input, projection) {
    if (input && typeof input.getType === 'function') {
        const type = input.getType();
        switch (type) {
            case 'LineString':
            case 'LinearRing':
                return [toLonLats(input.getCoordinates(), projection)];
            case 'MultiLineString':
            case 'Polygon':
                return input.getCoordinates().map((/** @type {number[][]} */ c) => toLonLats(c, projection));
            case 'MultiPolygon':
                return input.getCoordinates().flat().map((/** @type {number[][]} */ c) => toLonLats(c, projection));
            default:
                return [];
        }
    }
    if (!Array.isArray(input) || input.length === 0) return [];
    if (isPosition(input[0])) return [toLonLats(input, EPSG.WGS84)];
    return input.map((c) => toLonLats(c, EPSG.WGS84));
}

/**
 * The length in metres of a line on the WGS84 ellipsoid: the sum of the geodesic distance of each
 * segment. A polygon gives its perimeter. 0 for a geometry without a length (a point) and for
 * fewer than two positions.
 * @param {any} input  an OpenLayers geometry in `projection`, or longitude / latitude coordinates
 * @param {string} [projection]  the projection of a geometry (the map's by default)
 * @returns {number}
 */
export function geodesicLength(input, projection = EPSG.WEB_MERCATOR) {
    let length = 0;
    for (const line of linesOf(input, projection)) {
        for (let i = 1; i < line.length; i++) {
            const s = WGS84.Inverse(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]).s12;
            if (Number.isFinite(s)) length += s;
        }
    }
    return length;
}

/**
 * The area in square metres of one ring on the WGS84 ellipsoid, whatever its winding.
 * @param {number[][]} ring  [lon, lat] positions, the first one repeated at the end or not
 * @returns {number}
 */
function ringArea(ring) {
    const points = ring.slice();
    // No duplicated closing vertex: PolygonArea closes the ring itself
    while (points.length > 1 && points[0][0] === points[points.length - 1][0]
        && points[0][1] === points[points.length - 1][1]) {
        points.pop();
    }
    if (points.length < 3) return 0;
    const polygon = new PolygonArea.PolygonArea(WGS84);
    for (const [lon, lat] of points) polygon.AddPoint(lat, lon);
    const area = Math.abs(polygon.Compute(false, true).area);
    return Number.isFinite(area) ? area : 0;
}

/**
 * The area in square metres of a polygon given as rings of [lon, lat]: its outer ring less each of its
 * holes (the interior rings), whatever the winding of each ring, as ol/sphere did.
 * @param {number[][][]} rings  the outer ring first, then the holes
 * @returns {number}
 */
function polygonArea(rings) {
    if (rings.length === 0) return 0;
    let area = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
    return area;
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
    if (input && typeof input.getType === 'function') {
        const type = input.getType();
        if (type === 'Polygon') return polygonArea(linesOf(input, projection));
        if (type === 'MultiPolygon') {
            return input.getCoordinates().reduce(
                (/** @type {number} */ sum, /** @type {number[][][]} */ polygon) =>
                    sum + polygonArea(polygon.map((/** @type {number[][]} */ ring) => toLonLats(ring, projection))), 0);
        }
        return 0;
    }
    if (!Array.isArray(input) || input.length === 0) return 0;
    if (isPosition(input[0])) return ringArea(toLonLats(input, EPSG.WGS84));
    return polygonArea(input.map((/** @type {number[][]} */ ring) => toLonLats(ring, EPSG.WGS84)));
}

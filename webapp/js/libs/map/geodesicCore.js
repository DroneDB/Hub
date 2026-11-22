// @ts-check
/**
 * Lengths and areas of longitude / latitude coordinates on the WGS84 ellipsoid, with no map library:
 * the report model, which has no map, measures with these, and libs/map/geodesic measures an
 * OpenLayers geometry with them once it has turned its coordinates into longitude / latitude, so
 * the map and a report give the same numbers.
 *
 * GeographicLib is the algorithm GDAL uses, so the numbers are those of ddb: Inverse for each
 * segment of a line, PolygonArea for a polygon. The results are metres and square metres;
 * libs/format.js formats them.
 */
import { Geodesic, PolygonArea } from 'geographiclib-geodesic';

const WGS84 = Geodesic.WGS84;

/**
 * A longitude in [-180, 180]
 * @param {number} lon
 * @returns {number}
 */
export function normaliseLon(lon) {
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
 * The positions of a line or ring that can be measured, as [lon, lat] pairs with longitudes in
 * [-180, 180]; a position whose longitude or latitude is not a finite number is left out.
 * @param {number[][]} positions  [lon, lat, ...] positions
 * @returns {number[][]}
 */
function lonLatsOf(positions) {
    const out = [];
    for (const [lon, lat] of positions) {
        if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([normaliseLon(lon), lat]);
    }
    return out;
}

/**
 * The length in metres of lines on the WGS84 ellipsoid: the sum of the geodesic distance of each
 * segment of each line. 0 for lines of fewer than two positions.
 * @param {number[][][]} lines  each line as [lon, lat] positions
 * @returns {number}
 */
export function linesLength(lines) {
    let length = 0;
    for (const positions of lines) {
        const line = lonLatsOf(positions);
        for (let i = 1; i < line.length; i++) {
            const s = WGS84.Inverse(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]).s12;
            if (Number.isFinite(s)) length += s;
        }
    }
    return length;
}

/**
 * The area in square metres of one ring on the WGS84 ellipsoid, whatever its winding.
 * @param {number[][]} positions  [lon, lat] positions, the first one repeated at the end or not
 * @returns {number}
 */
function ringArea(positions) {
    const points = lonLatsOf(positions);
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
 * The area in square metres of a polygon on the WGS84 ellipsoid: its outer ring less each of its
 * holes (the interior rings), whatever the winding of each ring, as ol/sphere did. 0 for a polygon
 * with no ring and for an outer ring of fewer than three distinct positions.
 * @param {number[][][]} rings  the outer ring first, then the holes, as [lon, lat] positions
 * @returns {number}
 */
export function polygonArea(rings) {
    if (rings.length === 0) return 0;
    let area = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
    return area;
}

/**
 * The length in metres of longitude / latitude coordinates on the WGS84 ellipsoid: a line, or the
 * sum of several lines (the rings of a polygon give its perimeter with the holes). 0 for anything
 * else and for fewer than two positions.
 * @param {any} coordinates  a line [[lon, lat], ...], or lines [[[lon, lat], ...], ...]
 * @returns {number}
 */
export function lonLatLength(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return 0;
    return linesLength(isPosition(coordinates[0]) ? [coordinates] : coordinates);
}

/**
 * The area in square metres of longitude / latitude coordinates on the WGS84 ellipsoid: a ring, or
 * the rings of a polygon (the outer ring less the holes), whatever the winding. 0 for anything else
 * and for fewer than three distinct positions.
 * @param {any} coordinates  a ring [[lon, lat], ...], or rings [[[lon, lat], ...], ...]
 * @returns {number}
 */
export function lonLatArea(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return 0;
    return isPosition(coordinates[0]) ? ringArea(coordinates) : polygonArea(coordinates);
}

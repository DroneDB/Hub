// @ts-check
/**
 * Where the 3D viewer's measurements are on the Earth, and the GeoJSON geometry each kind has. Shared
 * by the converter that writes them (potreeMeasurementConverter) and the migration of old files
 * (measurementFormat), which must give the same geometry.
 *
 * The positions of a Potree point cloud (COPC) are in the CRS of the cloud: the decoder applies the
 * scale and offset of the file when it reads the points, so a measured point is already an x, y, z of
 * that CRS and nothing is added or removed here. x and y are reprojected to longitude and latitude
 * with proj4 (crsProjection); z stays as it is, except in a geocentric CRS, where it becomes the
 * height above the ellipsoid.
 */
import { crsToWgs84, wgs84ToCrs } from '@/libs/map/crsProjection';

/**
 * The SRS definition proj4 takes (an EPSG code, a proj string or WKT), from a string, from `{ wkt }`,
 * from the `{ srs }` of a coordinate system or from the nested `{ srs: { wkt } }` of an EPT file.
 * Null when there is none.
 * @param {any} source
 * @returns {string | null}
 */
export function srsDefinitionOf(source) {
    if (typeof source === 'string') return source.trim() ? source : null;
    if (source && typeof source === 'object') {
        if (source.srs) return srsDefinitionOf(source.srs);
        if (typeof source.wkt === 'string' && source.wkt.trim()) return source.wkt;
    }
    return null;
}

/**
 * Between the CRS of a point cloud and WGS84.
 * @typedef {object} Projector
 * @property {string | null} definition  the SRS in use, null when there is none or proj4 cannot use it
 * @property {boolean} usable            whether positions can be reprojected
 * @property {(position: ArrayLike<number> | { x: number, y: number, z: number }) => number[]} toGeographic
 *   a position of the cloud -> [longitude, latitude, height]; the position itself ([x, y, z]) when not usable
 * @property {(coordinates: number[]) => number[]} toLocal  [longitude, latitude, height] -> a position of the cloud
 */

/**
 * @param {any} source  an SRS, or a coordinate system that has one
 * @returns {Projector}
 */
export function projectorFor(source) {
    const candidate = srsDefinitionOf(source);
    const forward = candidate ? crsToWgs84(candidate) : null;
    const inverse = candidate ? wgs84ToCrs(candidate) : null;
    const usable = !!(forward && inverse);
    /** @param {any} p */
    const triple = p => (Array.isArray(p) || ArrayBuffer.isView(p) ? [p[0], p[1], p[2]] : [p.x, p.y, p.z]);
    return {
        definition: usable ? candidate : null,
        usable,
        toGeographic(position) {
            const [x, y, z] = triple(position);
            return forward ? forward(x, y, z) : [x, y, z];
        },
        toLocal(coordinates) {
            const [x, y, z] = coordinates;
            return inverse ? inverse(x, y, z) : [x, y, z];
        }
    };
}

// Two positions closer than this (in the units of the CRS, or in degrees: 1e-8 degree is about 1 mm)
// are the same point
const SAME_POSITION = 1e-3;
const SAME_ANGLE = 1e-8;

/** @param {number[]} a @param {number[]} b @param {number} horizontal  the tolerance of x and y (z: SAME_POSITION) */
const near = (a, b, horizontal) => a.length >= 3 && b.length >= 3
    && Math.abs(a[0] - b[0]) <= horizontal && Math.abs(a[1] - b[1]) <= horizontal && Math.abs(a[2] - b[2]) <= SAME_POSITION;

/**
 * Whether two CRSs (each an SRS, or a coordinate system that has one) are the same CRS, by meaning: the
 * same text is (the fast path); else a sample point of the first goes to WGS84 through each of them and
 * back through the second, and both ways must give the same point. The same CRS is written as different
 * WKT by different writers (WKT 1 and WKT 2, with or without its authority), so the text alone is not
 * enough; two CRSs that place the sample within a millimetre of each other are the same where the
 * cloud is. No CRS is the same as no CRS only; a CRS that proj4 cannot use is the same only as its text.
 * @param {any} first
 * @param {any} second
 * @param {number[] | null} sample  a position in the first CRS (where the cloud is)
 * @returns {boolean}
 */
export function sameCrs(first, second, sample) {
    const a = srsDefinitionOf(first);
    const b = srsDefinitionOf(second);
    if (!a || !b) return !a && !b;
    if (a.trim() === b.trim()) return true;
    const from = projectorFor(a);
    const to = projectorFor(b);
    if (!from.usable || !to.usable || !sample || !sample.slice(0, 3).every(Number.isFinite)) return false;
    try {
        const geographic = from.toGeographic(sample);
        return near(to.toGeographic(sample), geographic, SAME_ANGLE) && near(to.toLocal(geographic), sample, SAME_POSITION);
    } catch {
        return false;
    }
}

/**
 * The GeoJSON geometry of a measurement of the 3D viewer, from its points (already in longitude,
 * latitude, height, or in the CRS of the cloud when that cannot be reprojected):
 * areas are closed polygons; heights and distances are lines; a circle is its centre (the first
 * point); an angle is its vertex (the second point); points and annotations are a point.
 * Null for a kind this does not know.
 * @param {string} measurementType
 * @param {number[][]} points
 * @returns {{ type: string, coordinates: any } | null}
 */
export function geometryOf(measurementType, points) {
    if (!points.length) return null;
    switch (measurementType) {
        case 'area':
            return { type: 'Polygon', coordinates: [points.concat([points[0]])] };
        case 'height':
        case 'distance':
            return { type: 'LineString', coordinates: points };
        case 'circle':
        case 'point':
        case 'annotation':
            return { type: 'Point', coordinates: points[0] };
        case 'angle':
            return { type: 'Point', coordinates: points[1] || points[0] };
        default:
            return null;
    }
}

/**
 * The points a saved 3D feature was measured at: its local coordinates (an annotation has one
 * [x, y, z], every other kind a list of them), or null when it has none.
 * @param {any} feature
 * @returns {number[][] | null}
 */
export function localPointsOf(feature) {
    const local = feature && feature.properties && feature.properties.localCoordinates;
    if (!Array.isArray(local) || !local.length) return null;
    const points = typeof local[0] === 'number' ? [local] : local;
    return points.every(p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) ? points : null;
}

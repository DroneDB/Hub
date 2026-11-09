// @ts-check
/**
 * Where the 3D viewer's measurements are on the Earth, and the GeoJSON geometry each kind has. Shared
 * by the converter that writes them (potreeMeasurementConverter) and the migration of old files
 * (measurementFormat), which must give the same geometry.
 *
 * The positions of a Potree point cloud (COPC) are in the CRS of the cloud: the decoder applies the
 * scale and offset of the file when it reads the points, so a measured point is already an x, y, z of
 * that CRS and nothing is added or removed here. x and y are reprojected to longitude and latitude
 * with proj4 (crsProjection); z stays as it is.
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
 *   a position of the cloud -> [longitude, latitude, z]; the position itself ([x, y, z]) when not usable
 * @property {(coordinates: number[]) => number[]} toLocal  [longitude, latitude, z] -> a position of the cloud
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
            if (!forward) return [x, y, z];
            const [lon, lat] = forward(x, y);
            return [lon, lat, z];
        },
        toLocal(coordinates) {
            const [x, y, z] = coordinates;
            if (!inverse) return [x, y, z];
            const [px, py] = inverse(x, y);
            return [px, py, z];
        }
    };
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

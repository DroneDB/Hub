// @ts-check
/**
 * What an annotation is to a report: its measurement kind (the table it goes in, the filter list it is
 * tested by), the total it adds to, and the numbers it measures, in metres and square metres. The report
 * model is the only place that maps an annotation to a kind, so the tables, the totals and the `kinds`
 * filter agree.
 *
 * | owner      | measurementType      | kind      | adds to                       |
 * |------------|----------------------|-----------|-------------------------------|
 * | map        | point                | point     |                               |
 * | map        | length               | length    | length                        |
 * | map        | area                 | area      | area                          |
 * | map        | profile              | profile   |                               |
 * | map        | stockpile            | volume    | net volume, weight, cost      |
 * | map        | contour              | none: no annotation (annotationIds.isAnnotation), in no report |
 * | map        | missing or unknown   | by geometry (point, length, area), adding as that kind |
 * | pointCloud | point, annotation    | point     |                               |
 * | pointCloud | distance             | length    | length                        |
 * | pointCloud | height               | length    | (a vertical difference)       |
 * | pointCloud | area                 | area      | area                          |
 * | pointCloud | circle, angle        | measure3d |                               |
 *
 * A 2D annotation is measured on its geometry (geodesic: libs/map/geodesicCore, the numbers of the map,
 * without the map library the model must not load);
 * a 3D one on its points (`localCoordinates`), placed in the CRS of its point cloud's COPC and measured in its unit as
 * the 3D viewer measures them (pointCloudMeasures): the values a file stores can be stale (a file of an older Hub
 * labels feet as metres, a measure saved while the COPC was in degrees has a distance of 0). Only a measure without
 * points, or one that cannot be placed in a CRS that measures lengths, keeps the values it was saved with.
 */
import { lonLatLength, lonLatArea } from '@/libs/map/geodesicCore';
import { VIEW, ownerOf, savedPositions, sectionOf } from '@/libs/map/measurementFormat';
import { isAnnotation } from '@/libs/map/annotationIds';
import { LINEAR_UNITS, isGeographicCrs } from '@/libs/map/crsProjection';
import { localPointsOf, srsDefinitionOf } from '@/libs/map/pointCloudGeometry';
import { measureValues, measurementFrame } from '@/libs/map/potreeMeasurementConverter';

/** @typedef {'point' | 'length' | 'area' | 'volume' | 'profile' | 'measure3d'} MeasurementKind */
/** @typedef {'length' | 'area' | 'volume'} TotalKey */

/** The kinds in the order of the tables of a report. */
export const KIND_ORDER = Object.freeze(/** @type {MeasurementKind[]} */ (['point', 'length', 'area', 'volume', 'profile', 'measure3d']));

/** The name of a kind, as the item counts and the tables call it. */
export const KIND_LABELS = Object.freeze(/** @type {Record<MeasurementKind, string>} */ ({
    point: 'Points',
    length: 'Lengths',
    area: 'Areas',
    volume: 'Volumes',
    profile: 'Profiles',
    measure3d: '3D measurements'
}));

/** The name of one item of a kind. */
export const KIND_SINGULAR = Object.freeze(/** @type {Record<MeasurementKind, string>} */ ({
    point: 'Point',
    length: 'Length',
    area: 'Area',
    volume: 'Volume',
    profile: 'Profile',
    measure3d: '3D measurement'
}));

/** The tag of the owner of an item: the 2D map or the point cloud viewer. */
export const OWNER_TAGS = Object.freeze({ [VIEW.MAP]: '2D', [VIEW.POINT_CLOUD]: '3D' });

/** @type {Record<string, Record<string, MeasurementKind>>} */
const KIND_BY_TYPE = {
    [VIEW.MAP]: { point: 'point', length: 'length', area: 'area', profile: 'profile', stockpile: 'volume' },
    [VIEW.POINT_CLOUD]: { point: 'point', annotation: 'point', distance: 'length', height: 'length', area: 'area', circle: 'measure3d', angle: 'measure3d' }
};

/** @type {Record<string, MeasurementKind>} */
const KIND_BY_GEOMETRY = { Point: 'point', LineString: 'length', Polygon: 'area' };

/**
 * The owner, the kind and the measurement type of a feature of a measurements file; null for one that is
 * no measurement a report knows (a geometry that is no point, line or polygon, and no type that says more) and
 * for one that is no annotation (a contour line).
 * @param {any} feature
 * @returns {{ owner: string, kind: MeasurementKind, measurementType: string } | null}
 */
export function kindOfFeature(feature) {
    if (!feature || typeof feature !== 'object' || !isAnnotation(feature)) return null;
    const owner = ownerOf(feature);
    const type = typeof feature.properties?.measurementType === 'string' ? feature.properties.measurementType : '';
    const kind = KIND_BY_TYPE[owner][type] ?? KIND_BY_GEOMETRY[feature.geometry?.type];
    return kind ? { owner, kind, measurementType: type || (kind === 'point' ? 'point' : kind) } : null;
}

/**
 * The total an item adds to: the length of a length (a 3D height is a vertical difference, not a length on the
 * ground; a profile adds to none), the area of an area, the net volume of a volume (and its weight and cost).
 * @param {{ kind: MeasurementKind, measurementType: string }} item
 * @returns {TotalKey | null}
 */
export function totalKeyOf(item) {
    if (item.kind === 'length') return item.measurementType === 'height' ? null : 'length';
    if (item.kind === 'area' || item.kind === 'volume') return item.kind;
    return null;
}

/**
 * How many metres the unit a 3D feature was saved with is: its `unit` is the code of the unit of length of its
 * point cloud's CRS ('m', 'ft', 'ftUS'), squared for an area ('m²'). No unit means metres, as everywhere in the
 * Hub. Null for a unit this does not know (a CRS with an unusual unit): the value cannot be converted.
 * @param {unknown} unit
 * @returns {number | null}
 */
export function metresPerUnit(unit) {
    if (unit === undefined || unit === null || unit === '') return 1;
    const code = String(unit).replace(/[²2]$/u, '');
    const known = Object.values(LINEAR_UNITS).find(u => u.code === code);
    return known ? known.metresPerUnit : null;
}

/** @param {unknown} v @returns {number | null} */
const numberOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The numbers an item measures, in metres, square metres and degrees (null where it has none or cannot be told).
 * @typedef {object} Measured
 * @property {number | null} length  a length, a distance or a height, in metres
 * @property {number | null} area  in square metres
 * @property {number | null} perimeter  in metres
 * @property {number | null} radius  in metres
 * @property {number | null} circumference  in metres
 * @property {number | null} angle  in degrees
 * @property {boolean} unconvertible  a 3D value that is in a unit this cannot convert: it is left out of the totals
 */

/** @returns {Measured} */
const noMeasure = () => ({ length: null, area: null, perimeter: null, radius: null, circumference: null, angle: null, unconvertible: false });

/**
 * What a 2D feature measures, from its geometry: the geodesic length of a line, the geodesic area and perimeter
 * of a polygon (the numbers of the map).
 * @param {any} geometry  GeoJSON in WGS84
 * @returns {Measured}
 */
function measuredFromGeometry(geometry) {
    const measured = noMeasure();
    if (geometry?.type === 'LineString') measured.length = lonLatLength(geometry.coordinates);
    if (geometry?.type === 'Polygon') {
        measured.area = lonLatArea(geometry.coordinates);
        measured.perimeter = lonLatLength(geometry.coordinates[0]);
    }
    return measured;
}

/**
 * The values of the 3D measures of a measurements file, worked out from their points as the 3D viewer does: each
 * feature's local coordinates are placed in the CRS of the point cloud's COPC (savedPositions: the file's CRS can be
 * another, when the COPC was built again in UTM) and measured in its unit (measurementFrame). Without the COPC's CRS,
 * the CRS the file states is the one measured in. A function from a feature to its values (the keys of its properties:
 * `distance`, `area`, `unit`...), null for a feature that keeps the values it was saved with: one without local
 * coordinates or with too few of them, one that cannot be placed, or any when the CRS to measure in is in degrees (a
 * COPC not built again).
 * @param {any} document  the file, read (measurementFormat)
 * @param {any} [pointCloudCrs]  the SRS of the COPC of the file's point cloud, when it is known
 * @returns {(feature: any) => Record<string, number | string> | null}
 */
export function pointCloudMeasures(document, pointCloudCrs = null) {
    const crs = pointCloudCrs ?? sectionOf(document, VIEW.POINT_CLOUD).coordinateSystem ?? null;
    const srs = srsDefinitionOf(crs);
    if (srs && isGeographicCrs(srs)) return () => null;
    const positionsOf = savedPositions(document, crs);
    const frame = measurementFrame(srs);
    return feature => {
        const type = feature?.properties?.measurementType;
        const points = localPointsOf(feature);
        if (!Object.hasOwn(POINTS_TO_MEASURE, type) || !points || points.length < POINTS_TO_MEASURE[type]) return null;
        const positions = positionsOf(feature);
        return positions ? measureValues(type, positions, frame) : null;
    };
}

// The points a 3D measure needs for its values (a line of one point has no length); a point or an annotation has none
const POINTS_TO_MEASURE = Object.freeze(/** @type {Record<string, number>} */ ({ distance: 2, height: 2, area: 3, circle: 3, angle: 3 }));

/**
 * What a 3D feature measures: its values (pointCloudMeasures, or the ones it was saved with), converted from the unit of
 * its cloud to metres.
 * @param {Record<string, any>} properties
 * @returns {Measured}
 */
function measuredFromProperties(properties) {
    const measured = noMeasure();
    const factor = metresPerUnit(properties.unit);
    const type = properties.measurementType;
    if (type === 'angle') {
        measured.angle = numberOrNull(properties.angle);
        return measured;
    }
    const stored = [['length', properties.distance, 1], ['area', properties.area, 2], ['perimeter', properties.perimeter, 1],
        ['radius', properties.radius, 1], ['circumference', properties.circumference, 1]];
    for (const [key, value, power] of /** @type {[keyof Measured, unknown, number][]} */ (stored)) {
        const number = numberOrNull(value);
        if (number === null) continue;
        if (factor === null) measured.unconvertible = true;
        else /** @type {any} */ (measured)[key] = number * Math.pow(factor, power);
    }
    return measured;
}

/**
 * What an item measures.
 * @param {{ owner: string, kind: MeasurementKind }} item
 * @param {any} feature
 * @returns {Measured}
 */
export function measuredOf(item, feature) {
    if (item.kind === 'volume' || item.kind === 'point') return noMeasure();
    return item.owner === VIEW.POINT_CLOUD ? measuredFromProperties(feature.properties ?? {}) : measuredFromGeometry(feature.geometry);
}

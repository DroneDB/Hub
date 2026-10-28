// @ts-check
/**
 * The mathematics of the splat measurements, on plain [x, y, z] arrays in the frame of the
 * splat file (what the sidecar stores): the lengths, the height along the scene's up, the area
 * projected on the ground, the scale of a scene, and the labels. Nothing here knows about three.js.
 */
import { measureFormatters } from '@/features/viewers/unified/sceneUtils';

/** The shapes a user can draw, with how many points each needs at least (and at most, when it has a limit). */
export const MEASURE_KINDS = Object.freeze({
    point: { min: 1, max: 1 },
    distance: { min: 2, max: Infinity },
    height: { min: 2, max: 2 },
    area: { min: 3, max: Infinity }
});

/** @typedef {number[]} Vec3 */

/** @param {unknown} kind @returns {kind is keyof typeof MEASURE_KINDS} */
export const isMeasureKind = kind => typeof kind === 'string' && Object.hasOwn(MEASURE_KINDS, kind);

/** @param {unknown} p @returns {p is Vec3} */
export const isVec3 = p => Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && Number.isFinite(v));

const sub = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (/** @type {Vec3} */ a) => Math.hypot(a[0], a[1], a[2]);

/** The length of the straight line between two points. @param {Vec3} a @param {Vec3} b */
export const distanceBetween = (a, b) => norm(sub(a, b));

/** The length of a polyline through the points. @param {Vec3[]} points */
export function pathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distanceBetween(points[i - 1], points[i]);
    return total;
}

/**
 * How far apart two points are along the up direction (always positive: the height of the higher
 * above the lower). The up need not be a unit vector.
 * @param {Vec3} a @param {Vec3} b @param {Vec3} up
 */
export function heightBetween(a, b, up) {
    const length = norm(up);
    return length > 0 ? Math.abs(dot(sub(b, a), up)) / length : 0;
}

/**
 * The area of a polygon projected on the ground plane, the plane perpendicular to `up` (so a
 * polygon drawn on a slope counts as the ground it covers seen from above, and a vertical one
 * as nothing). Half the length of the sum of the cross products of consecutive points, along up:
 * independent of the origin and of the order the points go round (clockwise or not).
 * @param {Vec3[]} points @param {Vec3} up
 */
export function projectedArea(points, up) {
    const length = norm(up);
    if (points.length < 3 || !(length > 0)) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        sum += dot(up, cross(points[i], points[(i + 1) % points.length]));
    }
    return Math.abs(sum) / (2 * length);
}

/**
 * The middle of the points (where an area is labelled).
 * @param {Vec3[]} points
 * @returns {Vec3}
 */
export function centroid(points) {
    const sum = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

// ---- Scale ------------------------------------------------------------------------------

/**
 * How many metres a unit of the scene is, from two points the user picked on something of a
 * known length. null when it cannot be told: the points are the same, or the length is not a
 * positive number.
 * @param {Vec3} a @param {Vec3} b @param {number} realLength  in metres
 * @returns {number | null}
 */
export function metersPerUnitFrom(a, b, realLength) {
    const d = distanceBetween(a, b);
    if (!(d > 1e-12) || !Number.isFinite(realLength) || !(realLength > 0)) return null;
    return realLength / d;
}

/** A usable `metersPerUnit`: a positive finite number. @param {unknown} v @returns {v is number} */
export const isMetersPerUnit = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * What the values of a scene are in. A georeferenced scene is in metres already; another is when
 * the user has set its scale; otherwise the values are in the units of the file.
 * @param {{ georeferenced?: boolean, metersPerUnit?: number | null }} scene
 * @returns {{ metersPerUnit: number, metric: boolean, unit: string }}
 */
export function sceneScale({ georeferenced = false, metersPerUnit = null }) {
    if (georeferenced) return { metersPerUnit: 1, metric: true, unit: 'm' };
    if (isMetersPerUnit(metersPerUnit)) return { metersPerUnit, metric: true, unit: 'm' };
    return { metersPerUnit: 1, metric: false, unit: 'units' };
}

// ---- Labels -----------------------------------------------------------------------------

/**
 * The labels of the scene: the sceneUtils formatters (metres, kilometres) with the scale and the
 * unit of the scene, plus the coordinates of a point and the height.
 * @param {() => { metersPerUnit: number, unit: string }} scale  read when a label is made, so a change of scale shows
 */
export function sceneLabels(scale) {
    const formatters = measureFormatters(() => scale().metersPerUnit, () => scale().unit);
    return {
        length: (/** @type {number} */ length) => formatters.length({ length }),
        area: (/** @type {number} */ area) => formatters.area({ area }),
        /** The position in the frame of the file (the same scale as the lengths, from its origin). @param {Vec3} p */
        coordinates: p => {
            const { metersPerUnit, unit } = scale();
            return `${p.map(v => (v * metersPerUnit).toFixed(2)).join(', ')} ${unit}`;
        }
    };
}

/**
 * The labels of a drawn shape, each at a point of the scene: [{ at, text, kind }]. `kind` is
 * 'segment' | 'total' | 'value'.
 * @param {string} kind  a key of MEASURE_KINDS
 * @param {Vec3[]} points
 * @param {Vec3} up  the scene's up in the frame of the points
 * @param {ReturnType<typeof sceneLabels>} labels
 * @returns {{ at: Vec3, text: string, kind: string }[]}
 */
export function shapeLabels(kind, points, up, labels) {
    const mid = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => /** @type {Vec3} */ ([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    if (kind === 'point' && points.length >= 1) {
        return [{ at: points[0], text: labels.coordinates(points[0]), kind: 'value' }];
    }
    if (kind === 'distance') {
        const result = [];
        for (let i = 1; i < points.length; i++) {
            result.push({ at: mid(points[i - 1], points[i]), text: labels.length(distanceBetween(points[i - 1], points[i])), kind: 'segment' });
        }
        if (points.length > 2) result.push({ at: points[points.length - 1], text: `Total ${labels.length(pathLength(points))}`, kind: 'total' });
        return result;
    }
    if (kind === 'height' && points.length >= 2) {
        return [{ at: mid(points[0], points[1]), text: `Height ${labels.length(heightBetween(points[0], points[1], up))}`, kind: 'value' }];
    }
    if (kind === 'area' && points.length >= 3) {
        return [{ at: centroid(points), text: labels.area(projectedArea(points, up)), kind: 'value' }];
    }
    return [];
}

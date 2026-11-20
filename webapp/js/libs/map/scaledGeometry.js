// @ts-check
/**
 * Lengths, areas, radii and angles of measured points whose axes can be in different units: the heights of a point cloud
 * in a compound CRS can be in another unit than its x and y (UTM in metres with NAVD88 heights in US survey feet). Every
 * point is scaled per axis first (`scale`: what one unit of x, y and z is in the unit of the result, see
 * crsProjection's cloudUnitsOf), so a slope or a height is measured as far as it is. Shared by the 3D viewers' labels
 * and the measurements they save.
 *
 * A point is [x, y, z] or { x, y, z }.
 */

/** @typedef {ArrayLike<number> | { x: number, y: number, z: number }} Point */

/** No scaling: the result in the unit of the coordinates. */
export const SAME_UNITS = Object.freeze([1, 1, 1]);

/**
 * @param {Point} p
 * @param {ArrayLike<number>} scale
 * @returns {number[]}
 */
export function scaledPoint(p, scale) {
    const [x, y, z] = 'x' in p ? [p.x, p.y, p.z] : [p[0], p[1], p[2]];
    return [x * scale[0], y * scale[1], z * scale[2]];
}

/** @param {number[]} a @param {number[]} b */
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {number[]} a @param {number[]} b */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a @param {number[]} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {number[]} a */
const norm = a => Math.hypot(a[0], a[1], a[2]);

/**
 * The length of the path through the points, in 3-D.
 * @param {Point[]} points
 * @param {ArrayLike<number>} [scale]
 */
export function pathLength(points, scale = SAME_UNITS) {
    const scaled = points.map(p => scaledPoint(p, scale));
    let total = 0;
    for (let i = 1; i < scaled.length; i++) total += norm(minus(scaled[i], scaled[i - 1]));
    return total;
}

/**
 * The area of the ring the points make on the ground (x and y; the shoelace formula, as Potree's area label).
 * @param {Point[]} points
 * @param {ArrayLike<number>} [scale]
 */
export function groundArea(points, scale = SAME_UNITS) {
    const scaled = points.map(p => scaledPoint(p, scale));
    let twice = 0;
    for (let i = 0; i < scaled.length; i++) {
        const [a, b] = [scaled[i], scaled[(i + 1) % scaled.length]];
        twice += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(twice / 2);
}

/**
 * The area of a ring in 3-D, on its plane (Newell's method): the area of a sloped surface, as the 3D viewer measures it.
 * A ring that repeats its first point as its last has the same area.
 * @param {Point[]} points
 * @param {ArrayLike<number>} [scale]
 */
export function surfaceArea(points, scale = SAME_UNITS) {
    const scaled = points.map(p => scaledPoint(p, scale));
    const normal = [0, 0, 0];
    for (let i = 0; i < scaled.length; i++) {
        const c = cross(scaled[i], scaled[(i + 1) % scaled.length]);
        normal[0] += c[0];
        normal[1] += c[1];
        normal[2] += c[2];
    }
    return norm(normal) / 2;
}

/**
 * The radius of the circle through three points (the circle Potree draws), or 0 when they are on a line.
 * @param {Point} a @param {Point} b @param {Point} c
 * @param {ArrayLike<number>} [scale]
 */
export function circumradius(a, b, c, scale = SAME_UNITS) {
    const [pa, pb, pc] = [a, b, c].map(p => scaledPoint(p, scale));
    const ab = minus(pb, pa);
    const ac = minus(pc, pa);
    const twiceArea = norm(cross(ab, ac));
    return twiceArea > 0 ? (norm(ab) * norm(ac) * norm(minus(pc, pb))) / (2 * twiceArea) : 0;
}

/**
 * The angle at `vertex` between the directions to `a` and to `b`, in degrees.
 * @param {Point} a @param {Point} vertex @param {Point} b
 * @param {ArrayLike<number>} [scale]
 */
export function angleAt(a, vertex, b, scale = SAME_UNITS) {
    const [pa, pv, pb] = [a, vertex, b].map(p => scaledPoint(p, scale));
    const u = minus(pa, pv);
    const v = minus(pb, pv);
    const lengths = norm(u) * norm(v);
    if (!lengths) return 0;
    return Math.acos(Math.min(1, Math.max(-1, dot(u, v) / lengths))) * 180 / Math.PI;
}

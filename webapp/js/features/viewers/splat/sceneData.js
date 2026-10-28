// @ts-check
/**
 * What the views file holds besides the cameras, read defensively (the file is written by hand
 * or by other versions, and a bad entry is dropped, not a reason to lose the rest): the scale,
 * the pins (annotations) and the saved measurements. All the positions are in the frame of the
 * splat file, so they stay where they are when the up axis or the tilt is changed.
 */
import { isMeasureKind, isVec3, isMetersPerUnit, MEASURE_KINDS } from './measureMath';
import { isWebUrl } from '@/libs/sanitize';

/** A number to tell two things made in the same millisecond apart. */
export const newId = () => Date.now() + Math.floor(Math.random() * 1000);

/**
 * The most cameras, pins or measurements a views file is read with, and the most points a shape
 * is read with: a file is written by hand or by other versions, and one with millions would make
 * the viewer draw for minutes. The rest is dropped with a warning.
 */
export const MAX_SAVED_ITEMS = 1000;
export const MAX_SHAPE_POINTS = 1000;

/**
 * The id an item of the file is read with: its own when it is a number or a text, else its place
 * in the list.
 * @param {any} item @param {number} i
 * @returns {number | string}
 */
export const idOf = (item, i) => (typeof item.id === 'string' || Number.isFinite(item.id) ? item.id : i);

/**
 * A list of the views file read item by item: the items that normalize (a bad one is dropped), at
 * most MAX_SAVED_ITEMS of them, and each with an id of its own. The pins and the shapes are drawn
 * and found by id, so a repeated id (a copied entry, or an id equal to the place of an item without
 * one) would hide all but one of them: the later ones get a new id.
 * @template {{ id: number | string }} T
 * @param {unknown} values
 * @param {(item: any, i: number) => T | null} normalize
 * @param {string} what  what the items are, for the warning ("cameras")
 * @returns {T[]}
 */
export function normalizeList(values, normalize, what) {
    if (!Array.isArray(values)) return [];
    const items = /** @type {T[]} */ (values.map(normalize).filter(Boolean));
    if (items.length > MAX_SAVED_ITEMS) {
        console.warn(`The views file holds ${items.length} ${what}: the first ${MAX_SAVED_ITEMS} are shown, the rest is dropped.`);
        items.length = MAX_SAVED_ITEMS;
    }
    const seen = new Set();
    for (const item of items) {
        while (seen.has(item.id)) item.id = newId();
        seen.add(item.id);
    }
    return items;
}

/** @typedef {{ position: number[], quaternion: number[], fov: number, target: number[] | null }} View */
/** @typedef {{ id: number | string, title: string, text: string, link: string, image: string, position: number[], view: View | null }} Annotation */
/** @typedef {{ id: number | string, kind: keyof typeof MEASURE_KINDS, points: number[][] }} Measurement */

/**
 * The scale of the file: `{ metersPerUnit }` with a positive number, else null.
 * @param {any} value
 * @returns {{ metersPerUnit: number } | null}
 */
export function normalizeScale(value) {
    return value && isMetersPerUnit(value.metersPerUnit) ? { metersPerUnit: value.metersPerUnit } : null;
}

/**
 * The saved view of a pin (the shape of a camera without a name), or null when it has no usable position.
 * @param {any} v @returns {View | null}
 */
function normalizeView(v) {
    if (!v || !isVec3(v.position)) return null;
    return {
        position: v.position.slice(),
        quaternion: Array.isArray(v.quaternion) && v.quaternion.length === 4 && v.quaternion.every(Number.isFinite) ? v.quaternion.slice() : [0, 0, 0, 1],
        fov: typeof v.fov === 'number' && v.fov > 0 ? v.fov : 60,
        target: isVec3(v.target) ? v.target.slice() : null
    };
}

/**
 * Whether a path names a file inside the dataset (so the viewer can ask the dataset for it):
 * relative, and without a step out of the dataset.
 * @param {unknown} path
 */
export function isDatasetPath(path) {
    return typeof path === 'string' && path.length > 0 && !/^([a-z][a-z0-9+.-]*:|[\\/])/i.test(path)
        && !path.split(/[\\/]/).includes('..');
}

/**
 * A pin in the canonical shape, or null when it has no position. The link is kept only when it is a
 * web address (a javascript: link is not one), the image only when it is a path inside the dataset.
 * @param {any} a @param {number} i
 * @returns {Annotation | null}
 */
export function normalizeAnnotation(a, i) {
    if (!a || !isVec3(a.position)) return null;
    return {
        id: idOf(a, i),
        title: typeof a.title === 'string' && a.title ? a.title : `Pin ${i + 1}`,
        text: typeof a.text === 'string' ? a.text : '',
        link: isWebUrl(a.link) ? a.link : '',
        image: isDatasetPath(a.image) ? a.image : '',
        position: a.position.slice(),
        view: normalizeView(a.view)
    };
}

/**
 * A saved measurement, or null when its kind is unknown or it has too few points. A shape with
 * more than MAX_SHAPE_POINTS points keeps the first ones.
 * @param {any} m @param {number} i
 * @returns {Measurement | null}
 */
export function normalizeMeasurement(m, i) {
    if (!m || !isMeasureKind(m.kind) || !Array.isArray(m.points)) return null;
    let points = m.points.filter(isVec3);
    if (points.length > MAX_SHAPE_POINTS) {
        console.warn(`A measurement of the views file has ${points.length} points: the first ${MAX_SHAPE_POINTS} are kept.`);
        points = points.slice(0, MAX_SHAPE_POINTS);
    }
    const { min, max } = MEASURE_KINDS[m.kind];
    if (points.length < min || points.length > max) return null;
    return { id: idOf(m, i), kind: m.kind, points: points.map((/** @type {number[]} */ p) => p.slice()) };
}

/**
 * The stops of the tour, in the order the user listed them: the cameras, then the pins that have a
 * saved view. A stop says which camera or pin it is, and the view to fly to.
 * @param {{ position: number[], quaternion: number[], fov: number, target: number[] | null }[]} cameras
 * @param {Annotation[]} annotations
 * @returns {{ view: any, cameraIndex: number | null, annotationIndex: number | null }[]}
 */
export function tourStops(cameras, annotations) {
    return [
        ...cameras.map((view, cameraIndex) => ({ view, cameraIndex, annotationIndex: /** @type {number | null} */ (null) })),
        ...annotations.flatMap((a, annotationIndex) => (a.view
            ? [{ view: a.view, cameraIndex: /** @type {number | null} */ (null), annotationIndex }]
            : []))
    ];
}

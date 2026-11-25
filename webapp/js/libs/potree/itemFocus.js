/**
 * Finds an annotation of the point cloud viewer by its id and frames it (the link of a report item). A measure is
 * framed on the box of its points, an annotation by the move Potree itself makes to one.
 */
import { PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';

/** How a link frames an item: the room a lone point gets around it (in the units of the cloud), and how much farther
 * than its box the camera stands (Potree's own factor for a measure). */
const FOCUS = Object.freeze({ pointMargin: 5, zoom: 2 });
/** How a capture for a report frames an item: closer, so that the item fills the picture. A lone point gets a box of
 * 4 units (the camera stands about 7 units from it, the view about 8 units wide); a measure its box with a little room. */
export const CAPTURE_FRAMING = Object.freeze({ pointMargin: 2, zoom: 1.2 });
const ANIMATION_MS = 500;

/**
 * The measure or annotation of the viewer with this id, or null.
 * @param {any} viewer  a Potree.Viewer
 * @param {string} id
 */
export function findItem(viewer, id) {
    const bagId = (/** @type {any} */ object) => object && object[PROPERTY_BAG] && object[PROPERTY_BAG].id;
    const measure = (viewer.scene.measurements || []).find((/** @type {any} */ m) => bagId(m) === id);
    if (measure) return measure;
    /** @type {any} */
    let found = null;
    viewer.scene.annotations.traverse((/** @type {any} */ annotation) => {
        if (!found && annotation && annotation.position && bagId(annotation) === id) found = annotation;
    });
    return found;
}

/**
 * Zooms the camera onto the box of some positions, with some room for a box that has no size. The camera keeps the
 * direction it looks in.
 * @param {any} viewer
 * @param {any[]} positions  THREE.Vector3
 * @param {number} animationMs  0 moves at once
 * @param {{ pointMargin: number, zoom: number }} framing
 * @returns {boolean} false when there is no box to frame
 */
function zoomToBoxOf(viewer, positions, animationMs, framing) {
    const box = new THREE.Box3().setFromPoints(positions);
    if (box.isEmpty()) return false;
    if (box.getSize(new THREE.Vector3()).length() === 0) box.expandByScalar(framing.pointMargin);
    const node = new THREE.Object3D();
    /** @type {any} */ (node).boundingBox = box;
    viewer.zoomTo(node, framing.zoom, animationMs);
    return true;
}

/**
 * Moves the camera close onto a measure or an annotation with no move to wait for (the capture of a report reads the
 * very next frame): a measure is framed on the box of its points, a point or an annotation on a box around its
 * position (CAPTURE_FRAMING).
 * @param {any} viewer
 * @param {any} item  a Potree.Measure or Potree.Annotation
 * @returns {boolean} false when the item has no position to frame
 */
export function frameItemNow(viewer, item) {
    const positions = Array.isArray(item.points) ? item.points.map((/** @type {any} */ p) => p.position) : item.position ? [item.position] : [];
    return zoomToBoxOf(viewer, positions, 0, CAPTURE_FRAMING);
}

/**
 * Frames the annotation with this id.
 * @param {any} viewer
 * @param {string} id
 * @returns {boolean} false when the viewer has no annotation with that id
 */
export function focusItem(viewer, id) {
    const item = findItem(viewer, id);
    if (!item) return false;
    if (Array.isArray(item.points)) {
        // A measure: the box of its points (one that has none is left where it is)
        zoomToBoxOf(viewer, item.points.map((/** @type {any} */ p) => p.position), ANIMATION_MS, FOCUS);
    } else if (typeof item.moveHere === 'function') {
        item.moveHere(viewer.scene.getActiveCamera());
    }
    return true;
}

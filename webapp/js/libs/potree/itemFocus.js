/**
 * Finds an annotation of the point cloud viewer by its id and frames it (the link of a report item). A measure is
 * framed on the box of its points, an annotation by the move Potree itself makes to one.
 */
import { PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';

/** The room a lone point gets around it, in the units of the cloud. */
const POINT_MARGIN = 5;
/** How much farther than its box the camera stands from a measure (Potree's own factor for it). */
const MEASURE_ZOOM = 2;
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
 * Frames the annotation with this id.
 * @param {any} viewer
 * @param {string} id
 * @returns {boolean} false when the viewer has no annotation with that id
 */
export function focusItem(viewer, id) {
    const item = findItem(viewer, id);
    if (!item) return false;
    if (Array.isArray(item.points)) {
        // A measure: the box of its points, with a little room for a point that has no size
        const box = new THREE.Box3().setFromPoints(item.points.map((/** @type {any} */ p) => p.position));
        if (box.isEmpty()) return true;
        if (box.getSize(new THREE.Vector3()).length() === 0) box.expandByScalar(POINT_MARGIN);
        const node = new THREE.Object3D();
        /** @type {any} */ (node).boundingBox = box;
        viewer.zoomTo(node, MEASURE_ZOOM, ANIMATION_MS);
    } else if (typeof item.moveHere === 'function') {
        item.moveHere(viewer.scene.getActiveCamera());
    }
    return true;
}

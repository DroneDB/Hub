// @ts-check
/**
 * The capture of a 3D item (the image the point cloud viewer wrote for it): where its file is, and the address the
 * live page and the PDF read it from. The viewer's side of a capture (framing the item, reading the WebGL canvas,
 * writing the file) is libs/potree/captureForReport.
 */
import { annotationsFolder, isDatasetPath } from '@/libs/reports/annotationPhotos';

/** The suffix of the capture's file name: `<id>-3d.webp`. A photo is `<id>-<n>.<ext>`, so the two never meet. */
export const CAPTURE_SUFFIX = '-3d.webp';

/**
 * The path of the capture of an item: `<folder of the measurement file>/annotations/<id>-3d.webp`. The name has the
 * `id`, not the `ref`, because a ref can change. A new capture of the item is written to the same path.
 * @param {string} measurementPath  the path of the measurement file in the dataset
 * @param {string} id  the id of the item
 * @returns {string}
 */
export function capturePath(measurementPath, id) {
    const stem = String(id || '').replace(/[^A-Za-z0-9._-]/g, '_');
    if (!stem) throw new Error('An item needs an id before it can be captured');
    return `${annotationsFolder(measurementPath)}/${stem}${CAPTURE_SUFFIX}`;
}

/**
 * What an item stores of its capture: the path of the image and the camera that framed it.
 * @param {string} path
 * @param {{ position: number[], target: number[] }} camera
 * @returns {{ path: string, camera: { position: number[], target: number[] } }}
 */
export const snapshotOf = (path, camera) => ({ path, camera: { position: [...camera.position], target: [...camera.target] } });

/**
 * The address of the capture a `capture3d` block shows (the file in the dataset), or null when the item has none or the
 * path is not a path of this dataset.
 * @param {{ path?: string | null }} block
 * @param {{ downloadUrl: (path: string, options?: { inline?: boolean }) => string }} dataset
 * @returns {string | null}
 */
export function capture3dImageUrl(block, dataset) {
    const path = block && block.path;
    if (!path || !isDatasetPath(path)) return null;
    return dataset.downloadUrl(path, { inline: true });
}

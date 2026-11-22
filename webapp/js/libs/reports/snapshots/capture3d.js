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
 * What an item stores of its capture: the path of the image, the camera that framed it and when it was made. A new
 * capture is written over the file of the old one, so `capturedAt` is what tells the two apart: the address of the
 * image carries it, and a page or a PDF does not show the old image from the cache of the browser.
 * @param {string} path
 * @param {{ position: number[], target: number[] }} camera
 * @param {string} [capturedAt]  ISO 8601; now by default
 * @returns {{ path: string, camera: { position: number[], target: number[] }, capturedAt: string }}
 */
export const snapshotOf = (path, camera, capturedAt = new Date().toISOString()) => ({
    path, camera: { position: [...camera.position], target: [...camera.target] }, capturedAt
});

/**
 * The address of the capture a `capture3d` block shows (the file in the dataset), or null when the item has none or the
 * path is not a path of this dataset. It changes with each capture (`v`, the time of the capture the item stores) and
 * is the same between two renders of one capture; a capture stored without its time has none.
 * @param {{ path?: string | null, capturedAt?: string | null }} block
 * @param {{ downloadUrl: (path: string, options?: { inline?: boolean }) => string }} dataset
 * @returns {string | null}
 */
export function capture3dImageUrl(block, dataset) {
    const path = block && block.path;
    if (!path || !isDatasetPath(path)) return null;
    const url = dataset.downloadUrl(path, { inline: true });
    if (!block.capturedAt) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(block.capturedAt)}`;
}

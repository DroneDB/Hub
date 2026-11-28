// @ts-check
/**
 * "Capture for report" in the point cloud viewer: frames a measure or an annotation, draws one frame, reads the WebGL
 * canvas, encodes it as WebP, writes it to `<folder of the measurement file>/annotations/<id>-3d.webp` (a new capture
 * replaces the old file) and stores `snapshot: { path, camera: { position, target } }` in the item's property bag, which
 * the next Save writes to the measurement file. The report shows the image and the paths and rules are
 * libs/reports/snapshots/capture3d.
 *
 * A WebGL canvas is empty once the browser has composited the frame it holds (the drawing buffer is not preserved), so
 * the frame is drawn and copied to a canvas of its own in the same task, and only the copy is encoded.
 */
import { ensureProperties } from '@/libs/map/potreeMeasurementConverter';
import { frameItemNow } from '@/libs/potree/itemFocus';
import { canvasToBlob, releaseCanvas } from '@/libs/reports/snapshots/canvasImage';
import { capturePath, snapshotOf } from '@/libs/reports/snapshots/capture3d';

/** The longest side of a capture, in pixels. */
export const CAPTURE_MAX_SIDE = 1600;
/** How many frames in a row must have no node of the cloud loading before the frame is read. */
export const SETTLE_FRAMES = 8;
/** How long to wait for the cloud's nodes at the new camera before the frame is read as it is. */
export const SETTLE_TIMEOUT_MS = 8000;
/** What shows through where the view draws nothing (a WebP keeps transparency, a PDF page's JPEG does not). */
const BACKDROP = '#1e1e1e';

/**
 * The camera of the view: where it stands and what it looks at.
 * @param {any} viewer  a Potree.Viewer
 * @returns {{ position: number[], target: number[] }}
 */
export function cameraOf(viewer) {
    const view = viewer.scene.view;
    return { position: view.position.toArray(), target: view.getPivot().toArray() };
}

/** The nodes of the point clouds that are being loaded now (Potree counts them in one place). */
const nodesLoading = () => Number(/** @type {any} */ (globalThis).Potree?.numNodesLoading) || 0;

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

/**
 * Waits until the cloud has loaded the nodes the new camera needs (no node loading for a few frames), at most
 * SETTLE_TIMEOUT_MS: a cloud that is slow is captured at the detail it has, not left waiting.
 * @param {{ frames?: number, timeoutMs?: number, loading?: () => number, frame?: () => Promise<unknown>, now?: () => number }} [options]
 */
export async function settle({ frames = SETTLE_FRAMES, timeoutMs = SETTLE_TIMEOUT_MS, loading = nodesLoading, frame = nextFrame, now = () => performance.now() } = {}) {
    const started = now();
    let quiet = 0;
    while (quiet < frames && now() - started < timeoutMs) {
        await frame();
        quiet = loading() === 0 ? quiet + 1 : 0;
    }
}

/**
 * Draws one frame and copies it to a canvas of its own, in the same task.
 * @param {any} viewer
 * @returns {HTMLCanvasElement}
 */
export function readFrame(viewer) {
    viewer.render();
    const source = /** @type {HTMLCanvasElement} */ (viewer.renderer.domElement);
    if (!source.width || !source.height) throw new Error('The 3D view has no size to capture');
    const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(source.width, source.height));
    const copy = document.createElement('canvas');
    copy.width = Math.max(1, Math.round(source.width * scale));
    copy.height = Math.max(1, Math.round(source.height * scale));
    const ctx = /** @type {CanvasRenderingContext2D} */ (copy.getContext('2d'));
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, copy.width, copy.height);
    ctx.drawImage(source, 0, 0, copy.width, copy.height);
    return copy;
}

/**
 * Captures an item for the report.
 * @param {object} capture
 * @param {any} capture.viewer  a Potree.Viewer
 * @param {any} capture.item  a Potree.Measure or Potree.Annotation of the viewer
 * @param {any} capture.dataset
 * @param {string} capture.measurementPath  the measurement file the item is saved in
 * @param {typeof settle} [capture.wait]  what waits for the cloud (tests give a faster one)
 * @returns {Promise<{ path: string, camera: { position: number[], target: number[] } }>} what the item now stores
 */
export async function captureForReport({ viewer, item, dataset, measurementPath, wait = settle }) {
    const properties = ensureProperties(item);
    const path = capturePath(measurementPath, properties.id);
    if (!frameItemNow(viewer, item)) throw new Error('The item has no position to frame');
    await wait();
    const frame = readFrame(viewer);
    try {
        await dataset.writeObj(path, await canvasToBlob(frame), { overwrite: true });
    } finally {
        releaseCanvas(frame);
    }
    // The camera the image was framed with; the property bag is what the next Save writes to the file
    const snapshot = snapshotOf(path, cameraOf(viewer));
    properties.snapshot = snapshot;
    return snapshot;
}

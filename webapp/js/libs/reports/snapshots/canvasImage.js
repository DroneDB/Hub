// @ts-check
/**
 * Canvas to image, the one way every snapshot (a map, a chart, the capture of a 3D view) is encoded.
 */

/** The format of a snapshot. A browser that cannot encode it (Safari has no WebP encoder) answers with a PNG. */
export const IMAGE_TYPE = 'image/webp';
export const IMAGE_QUALITY = 0.92;

/**
 * Encodes a canvas. Rejects with the browser's SecurityError when the canvas is tainted (it holds pixels of an image
 * that was not fetched with CORS), and with an Error when the browser could not encode it.
 * @param {HTMLCanvasElement} canvas
 * @param {{ type?: string, quality?: number }} [options]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, { type = IMAGE_TYPE, quality = IMAGE_QUALITY } = {}) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))), type, quality);
        } catch (e) {
            reject(e);
        }
    });
}

/** Whether an error is the browser's refusal to read a tainted canvas. @param {unknown} e */
export const isTaintedCanvasError = e => !!e && typeof e === 'object' && /** @type {any} */ (e).name === 'SecurityError';

/** Gives the memory of a canvas back (a canvas of 1600 x 1000 pixels is 6 MB) without waiting for the collector. @param {HTMLCanvasElement | null | undefined} canvas */
export function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}

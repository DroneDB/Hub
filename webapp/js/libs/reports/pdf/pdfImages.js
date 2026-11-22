// @ts-check
/**
 * The images of a PDF: every one is a JPEG at quality 85, whose long side is at most 2000 px for a snapshot and 1600 px
 * for a photo. A PDF of 100 photos stays a few tens of megabytes and the tab does not hold full-size bitmaps.
 */

export const JPEG_QUALITY = 0.85;
/** The longest side of a map snapshot, a chart or a 3D capture, in pixels */
export const SNAPSHOT_MAX_SIDE = 2000;
/** The longest side of a photo, in pixels */
export const PHOTO_MAX_SIDE = 1600;
/** The longest side of a logo, in pixels (it is drawn a few centimetres wide) */
export const LOGO_MAX_SIDE = 600;

/**
 * The size of an image of `width` x `height` that is at most `maxSide` on its long side: the same size when it fits
 * (an image is never enlarged), else scaled with its proportions kept.
 * @param {number} width @param {number} height @param {number} maxSide
 * @returns {{ width: number, height: number }}
 */
export function fitWithin(width, height, maxSide) {
    const longSide = Math.max(width, height);
    if (!(longSide > 0)) throw new Error('The image has no size');
    if (longSide <= maxSide) return { width, height };
    const scale = maxSide / longSide;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * @typedef {object} DecodedImage
 * @property {CanvasImageSource} source
 * @property {number} width  of the decoded image, in pixels
 * @property {number} height
 * @property {() => void} [close]  frees the decoded bitmap
 */

/**
 * @typedef {object} ImageDeps  what the browser gives, so that a spec can stand in for it
 * @property {(blob: Blob) => Promise<DecodedImage>} decode
 * @property {(width: number, height: number) => { context: CanvasRenderingContext2D, toBlob: (type: string, quality: number) => Promise<Blob>, release: () => void }} canvas
 */

/** An SVG has no bitmap of its own: it goes through an <img>, the other types through createImageBitmap. @type {ImageDeps['decode']} */
async function decodeInBrowser(blob) {
    if (blob.type === 'image/svg+xml') {
        const url = URL.createObjectURL(blob);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            // A vector image without a size of its own is drawn at a size that a logo is read at
            const width = image.naturalWidth || LOGO_MAX_SIDE;
            const height = image.naturalHeight || LOGO_MAX_SIDE;
            return { source: image, width, height };
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

/** @type {ImageDeps['canvas']} */
function canvasInBrowser(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    return {
        context,
        toBlob: (type, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))), type, quality)),
        // A canvas keeps its pixels until it is collected: an empty one frees them now
        release: () => { canvas.width = 0; canvas.height = 0; }
    };
}

/** @type {ImageDeps} */
const BROWSER = { decode: decodeInBrowser, canvas: canvasInBrowser };

/**
 * @param {Blob} blob
 * @returns {Promise<string>} a data: URL
 */
export function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'));
        reader.readAsDataURL(blob);
    });
}

/**
 * @typedef {object} PreparedImage
 * @property {string} dataUrl  the JPEG, as a data: URL (what the PDF library takes)
 * @property {number} width  in pixels
 * @property {number} height
 */

/**
 * An image as a JPEG of quality 85 whose long side is at most `maxSide`. A transparent pixel is drawn on white (a JPEG
 * has no transparency, a page is white).
 * @param {Blob} blob  an image the browser can decode
 * @param {{ maxSide: number, quality?: number, signal?: AbortSignal, deps?: ImageDeps }} options
 * @returns {Promise<PreparedImage>}
 */
export async function prepareImage(blob, { maxSide, quality = JPEG_QUALITY, signal, deps = BROWSER }) {
    signal?.throwIfAborted();
    const decoded = await deps.decode(blob);
    /** @type {ReturnType<ImageDeps['canvas']> | null} */
    let target = null;
    try {
        const size = fitWithin(decoded.width, decoded.height, maxSide);
        target = deps.canvas(size.width, size.height);
        target.context.fillStyle = '#ffffff';
        target.context.fillRect(0, 0, size.width, size.height);
        target.context.drawImage(decoded.source, 0, 0, size.width, size.height);
        // The full-size bitmap is not needed once it is drawn: it goes before the encoding starts
        decoded.close?.();
        signal?.throwIfAborted();
        const jpeg = await target.toBlob('image/jpeg', quality);
        return { dataUrl: await blobToDataUrl(jpeg), width: size.width, height: size.height };
    } finally {
        decoded.close?.();
        target?.release();
    }
}

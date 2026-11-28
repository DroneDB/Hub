// @ts-check
/**
 * logoImage - prepares the image of a logo in the browser before it is sent: a large image is shrunk to a few hundred
 * pixels and saved as WebP, so a logo from a camera or a design tool fits the Registry's limit without the user opening an
 * editor. An SVG stays an SVG (a vector scales by itself), lightly minified; only one that is still too big is drawn as
 * a raster. Nothing here is specific to an organization: the limit is the caller's (`maxBytes`), and the result is a File
 * for any endpoint that takes an image.
 *
 * The decisions (the size of the image, how far to shrink it, whether the original is already the smallest) are in this
 * module and tested without a browser; what only a browser can do (decode an image, draw it, encode it) is behind
 * `LogoPorts`, which a test replaces.
 *
 * A raster is accepted in any format the browser decodes (PNG, JPEG, WebP, GIF, BMP, AVIF...), up to
 * `LOGO_MAX_INPUT_BYTES`. An animation keeps its first frame. The result is WebP at quality 0.9; a browser that cannot
 * encode WebP (Safari) answers PNG, which is kept. A result over the limit is tried again at lower quality
 * (`LOGO_QUALITIES`), then at a smaller size (`LOGO_EDGE_STEP`, down to `LOGO_MIN_EDGE`); after that the file is refused.
 * The original is kept when it is a PNG, JPEG or WebP of at most `maxEdge`, within the limit, and no larger than the
 * result, so a small optimised logo does not grow.
 */

import { fitWithin } from '@/libs/imageFit';

/** The longest side, in pixels, a prepared logo has unless the caller says otherwise. */
export const LOGO_MAX_EDGE = 512;
/** The shortest the longest side becomes while a result is too big: below it the logo is no longer readable. */
export const LOGO_MIN_EDGE = 128;
/** Each step down in size multiplies the longest side by this. */
export const LOGO_EDGE_STEP = 0.75;
/** The qualities tried at one size, the first when all is well. */
export const LOGO_QUALITIES = Object.freeze([0.9, 0.8, 0.7, 0.6]);
/** The largest file read at all, refused before it is decoded (a decoder holds the whole image in memory). */
export const LOGO_MAX_INPUT_BYTES = 20 * 1024 * 1024;
/** What a logo field says it takes. */
export const LOGO_INPUT_HINT = `Any image or SVG, up to ${LOGO_MAX_INPUT_BYTES / (1024 * 1024)} MB.`;

const WEBP = 'image/webp';
const PNG = 'image/png';
const SVG = 'image/svg+xml';
/** The types that are kept as the file is, when it is already small. */
const KEEPABLE = Object.freeze([PNG, 'image/jpeg', WEBP]);
const EXTENSION = Object.freeze({ [WEBP]: 'webp', [PNG]: 'png', 'image/jpeg': 'jpg', [SVG]: 'svg' });
const LABEL = Object.freeze({ [WEBP]: 'WebP', [PNG]: 'PNG', 'image/jpeg': 'JPEG', [SVG]: 'SVG' });

/** What is wrong with the file, said for the user: the field shows `message`. */
export class LogoProblem extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = 'LogoProblem';
    }
}

/**
 * @typedef {object} LogoImage  a decoded image
 * @property {number} width  in pixels (0 when the decoder does not know)
 * @property {number} height
 * @property {unknown} source  what `render` draws
 * @property {() => void} [release]  frees the decoder's memory or address
 *
 * @typedef {object} LogoPorts  what only a browser can do
 * @property {(blob: Blob) => Promise<LogoImage>} decode  a raster, upright as its metadata says; rejects when it is not an image
 * @property {(blob: Blob) => Promise<LogoImage>} decodeSvg  an SVG as an image; rejects when it does not load
 * @property {(image: LogoImage, width: number, height: number, type: string, quality: number) => Promise<Blob | null>} render
 *   draws the image at that size and encodes it; the Blob has the type the browser could make (not `type` when it cannot
 *   encode it), null when it made nothing
 *
 * @typedef {object} PreparedLogo
 * @property {File} file  what to send
 * @property {string} type  its media type
 * @property {number | null} width  null for an SVG that gives no size
 * @property {number | null} height
 * @property {number} bytes
 * @property {boolean} kept  the file the user chose, as it was (or minified, for an SVG)
 */

/**
 * The longest sides to try, from `start` down by `LOGO_EDGE_STEP` while they stay at least `LOGO_MIN_EDGE`. A start
 * already below the minimum is the only one: a small image is not shrunk further.
 * @param {number} start
 * @returns {number[]}
 */
export function edgeLadder(start) {
    const edges = [start];
    for (let edge = Math.round(start * LOGO_EDGE_STEP); edge >= LOGO_MIN_EDGE; edge = Math.round(edge * LOGO_EDGE_STEP)) edges.push(edge);
    return edges;
}

/**
 * The SVG without what a logo does not need: the XML declaration, the doctype, comments, metadata and the line breaks and
 * indentation between tags. Whitespace inside text stays. The Registry sanitises the SVG whatever this does; this only
 * makes it smaller.
 * @param {string} text
 * @returns {string}
 */
export function minifySvg(text) {
    return text
        .replace(/^\uFEFF/, '')
        .replace(/<\?xml[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
        .replace(/>\s*[\r\n]\s*</g, '><')
        .trim();
}

/** @param {string | undefined} value @returns {number | null} a length in user units, or null for a percentage or none */
function lengthOf(value) {
    const match = /^\s*([\d.]+)\s*(px)?\s*$/i.exec(value ?? '');
    const number = match ? Number(match[1]) : NaN;
    return number > 0 ? number : null;
}

/**
 * The size an SVG says for itself: its width and height, else its viewBox, else null.
 * @param {string} text
 * @returns {{ width: number, height: number } | null}
 */
export function svgSize(text) {
    const root = /<svg\b[^>]*>/i.exec(text)?.[0];
    if (!root) return null;
    const attribute = (/** @type {string} */ name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(root)?.[1];
    const width = lengthOf(attribute('width'));
    const height = lengthOf(attribute('height'));
    if (width && height) return { width, height };
    const box = (attribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;
}

/**
 * What a prepared logo is, for the user: "WebP, 512 × 160, 18 KB".
 * @param {{ type: string, width: number | null, height: number | null, bytes: number }} logo
 * @returns {string}
 */
export function describeLogo(logo) {
    const size = logo.width && logo.height ? `, ${logo.width} × ${logo.height}` : '';
    return `${LABEL[logo.type] ?? logo.type}${size}, ${Math.max(1, Math.round(logo.bytes / 1024))} KB`;
}

/**
 * @param {Blob} blob  a File is used as it is @param {string} type @param {{ width: number | null, height: number | null }} size
 * @param {boolean} kept @param {string} [name]
 * @returns {PreparedLogo}
 */
function prepared(blob, type, size, kept, name) {
    // The file the user chose is sent as it is; anything made here gets a name of its own
    const file = blob instanceof File ? blob : new File([blob], name ?? `logo.${EXTENSION[type] ?? 'img'}`, { type });
    return { file, type, width: size.width, height: size.height, bytes: file.size, kept };
}

/**
 * The raster at the sizes and qualities of the ladder, the first that is at most `maxBytes`.
 * @param {LogoImage} image  decoded
 * @param {{ width: number, height: number }} aspect  the proportions to draw (the size of the image, or of an SVG)
 * @param {number} startEdge  the longest side to try first
 * @param {number} maxBytes
 * @param {LogoPorts} ports
 * @returns {Promise<{ blob: Blob, type: string, width: number, height: number }>}
 */
async function encodeWithinLimit(image, aspect, startEdge, maxBytes, ports) {
    for (const edge of edgeLadder(startEdge)) {
        const target = fitWithin(aspect.width, aspect.height, edge);
        for (const quality of LOGO_QUALITIES) {
            const blob = await ports.render(image, target.width, target.height, WEBP, quality);
            if (!blob) throw new LogoProblem('The image could not be converted for the logo');
            if (blob.size <= maxBytes) return { blob, type: blob.type || PNG, ...target };
            // A PNG (the browser cannot make WebP) has no quality: the next try is a smaller size
            if (blob.type !== WEBP) break;
        }
    }
    throw new LogoProblem(`The image does not fit in ${Math.round(maxBytes / 1024)} KB, even much smaller: choose a simpler image`);
}

/**
 * @param {File} file @param {number} maxBytes @param {number} maxEdge @param {LogoPorts} ports
 * @returns {Promise<PreparedLogo>}
 */
async function prepareSvg(file, maxBytes, maxEdge, ports) {
    const text = minifySvg(await file.text());
    const blob = new Blob([text], { type: SVG });
    const size = svgSize(text);
    if (blob.size <= maxBytes) return prepared(blob, SVG, size ?? { width: null, height: null }, true);

    // Still too big for a vector: draw it
    /** @type {LogoImage} */
    let image;
    try {
        image = await ports.decodeSvg(blob);
    } catch {
        throw new LogoProblem(`The SVG is over ${Math.round(maxBytes / 1024)} KB and could not be converted to an image`);
    }
    try {
        const known = image.width > 0 && image.height > 0 ? { width: image.width, height: image.height } : null;
        const proportions = size ?? known ?? { width: 1, height: 1 };
        // A vector is drawn at the full size, not at its own (a viewBox of 24 units would give a blur of 24 pixels)
        const longest = Math.max(proportions.width, proportions.height);
        const aspect = { width: proportions.width * maxEdge / longest, height: proportions.height * maxEdge / longest };
        const result = await encodeWithinLimit(image, aspect, maxEdge, maxBytes, ports);
        return prepared(result.blob, result.type, result, false);
    } finally {
        image.release?.();
    }
}

/**
 * @param {File} file @param {number} maxBytes @param {number} maxEdge @param {LogoPorts} ports
 * @returns {Promise<PreparedLogo>}
 */
async function prepareRaster(file, maxBytes, maxEdge, ports) {
    /** @type {LogoImage} */
    let image;
    try {
        image = await ports.decode(file);
    } catch {
        throw new LogoProblem('The file is not an image Hub can read');
    }
    try {
        if (!(image.width > 0 && image.height > 0)) throw new LogoProblem('The file is not an image Hub can read');
        const first = fitWithin(image.width, image.height, maxEdge);
        const result = await encodeWithinLimit(image, image, Math.max(first.width, first.height), maxBytes, ports);

        // A small optimised logo is not made bigger by being drawn again
        const original = KEEPABLE.includes(file.type) && image.width <= maxEdge && image.height <= maxEdge
            && file.size <= maxBytes && file.size <= result.blob.size;
        if (original) return prepared(file, file.type, image, true);
        return prepared(result.blob, result.type, result, false);
    } finally {
        image.release?.();
    }
}

/** @param {File} file */
const isSvg = file => file.type === SVG || (!file.type && /\.svg$/i.test(file.name));

/**
 * Prepares a logo file: refuses what is too big to read, keeps an SVG as an SVG, shrinks a raster and saves it as WebP
 * (or PNG where the browser cannot make WebP), so that it is at most `maxBytes`.
 * @param {File} file  what the user chose
 * @param {{ maxBytes: number, maxEdge?: number, ports?: LogoPorts }} options
 *   `ports` is the browser (`browserPorts`) unless a test gives its own
 * @returns {Promise<PreparedLogo>}
 * @throws {LogoProblem} the file cannot be a logo: its message is for the user
 */
export async function prepareLogo(file, { maxBytes, maxEdge = LOGO_MAX_EDGE, ports = browserPorts }) {
    if (file.size > LOGO_MAX_INPUT_BYTES) throw new LogoProblem(`The file is over ${LOGO_MAX_INPUT_BYTES / (1024 * 1024)} MB: choose a smaller image`);
    return isSvg(file) ? prepareSvg(file, maxBytes, maxEdge, ports) : prepareRaster(file, maxBytes, maxEdge, ports);
}

/**
 * Prepares a logo for an endpoint (`prepareLogo`) and checks the result against that endpoint's own rule, so a field
 * never sends what the Registry would refuse.
 * @param {File} file  what the user chose
 * @param {{ maxBytes: number, maxEdge?: number, problemOf: (file: Blob) => string | null }} options
 *   `problemOf`: what the endpoint finds wrong with a file (its types and its limit), or null
 * @returns {Promise<PreparedLogo>}
 * @throws {LogoProblem} the file cannot be a logo: its message is for the user
 */
export async function prepareLogoFor(file, { maxBytes, maxEdge, problemOf }) {
    const logo = await prepareLogo(file, { maxBytes, ...(maxEdge ? { maxEdge } : {}) });
    const problem = problemOf(logo.file);
    if (problem) throw new LogoProblem(problem);
    return logo;
}

/** @param {HTMLImageElement} img @param {string} url @returns {Promise<void>} */
function loadImage(img, url) {
    return new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('The image did not load'));
        img.src = url;
    });
}

/** The browser, for `prepareLogo`: createImageBitmap, an <img> for SVG, and a canvas to draw and encode. @type {LogoPorts} */
export const browserPorts = {
    async decode(blob) {
        // from-image: a photo taken sideways is drawn upright
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        return { width: bitmap.width, height: bitmap.height, source: bitmap, release: () => bitmap.close() };
    },

    async decodeSvg(blob) {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        try {
            await loadImage(img, url);
        } catch (e) {
            URL.revokeObjectURL(url);
            throw e;
        }
        return { width: img.naturalWidth, height: img.naturalHeight, source: img, release: () => URL.revokeObjectURL(url) };
    },

    async render(image, width, height, type, quality) {
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
        const context = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
        if (!context) return null;
        context.imageSmoothingQuality = 'high';
        context.drawImage(/** @type {CanvasImageSource} */ (image.source), 0, 0, width, height);
        if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
        return new Promise(resolve => /** @type {HTMLCanvasElement} */ (canvas).toBlob(resolve, type, quality));
    }
};

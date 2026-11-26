// @ts-check
/**
 * imageFit - the size an image is drawn at when its longest side has a limit: the one rule the images of a PDF and the
 * prepared logos share.
 */

/**
 * The size of an image of `width` x `height` with its longest side at most `maxSide`: never larger than the image (an
 * image is never enlarged), the proportions kept, each side a whole number of pixels and at least one.
 * @param {number} width @param {number} height @param {number} maxSide
 * @returns {{ width: number, height: number }}
 * @throws {Error} the image has no size
 */
export function fitWithin(width, height, maxSide) {
    const longSide = Math.max(width, height);
    if (!(longSide > 0)) throw new Error('The image has no size');
    const scale = longSide > maxSide ? maxSide / longSide : 1;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

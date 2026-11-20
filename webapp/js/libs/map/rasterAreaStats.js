// @ts-check
/**
 * What the Registry answers for the statistics of an area of a raster (raster-area-stats): the pixels of the file under
 * the rectangle. The server converts the rectangle to pixels (D-021); the Hub never maps map coordinates to pixels.
 */

/**
 * The pixels of an area that have no value: the window the statistics were computed on minus
 * the pixels that were counted.
 * @param {{ bounds?: { x0: number, y0: number, x1: number, y1: number }, pixelCount?: number }|null} stats
 * @returns {number|null}  null when the answer has no window
 */
export function noDataPixelCount(stats) {
    const b = stats && stats.bounds;
    if (!b || !stats || typeof stats.pixelCount !== 'number') return null;
    return Math.max(0, (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - stats.pixelCount);
}

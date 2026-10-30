// @ts-check
/**
 * Map coordinates to raster pixels, for the raster analysis tools (Inspect, area statistics).
 * The raster's map extent is taken as a linear grid of its pixels: exact for a raster in the
 * map's projection, close for a small area of a raster in another one.
 */

/**
 * The pixel of a raster under a map coordinate: the image origin is at its top left (the map's
 * at its bottom left); a coordinate outside the extent is put on its nearest edge pixel.
 * @param {number[]} extent  the raster's [minX, minY, maxX, maxY] in map coordinates
 * @param {number} width
 * @param {number} height
 * @param {number[]} coord  [x, y] in map coordinates
 * @returns {[number, number]}  [column, row]
 */
export function rasterPixelAt(extent, width, height, coord) {
    const [x0, y0, x1, y1] = extent;
    const clamp = (v, size) => Math.max(0, Math.min(size - 1, Math.floor(v * size)));
    return [clamp((coord[0] - x0) / (x1 - x0), width), clamp((y1 - coord[1]) / (y1 - y0), height)];
}

/**
 * True when a map coordinate is inside the raster's map extent.
 * @param {number[]} extent  [minX, minY, maxX, maxY]
 * @param {number[]} coord  [x, y]
 */
export function isInsideExtent(extent, coord) {
    const [x0, y0, x1, y1] = extent;
    return coord[0] >= x0 && coord[0] <= x1 && coord[1] >= y0 && coord[1] <= y1;
}

/**
 * The window of raster pixels that a map rectangle covers, its corners included; null when the
 * rectangle and the raster do not overlap.
 * @param {number[]} extent  the raster's [minX, minY, maxX, maxY] in map coordinates
 * @param {number} width
 * @param {number} height
 * @param {number[]} box  the rectangle's [minX, minY, maxX, maxY] in map coordinates
 * @returns {{ x0: number, y0: number, x1: number, y1: number }|null}
 */
export function rasterPixelWindow(extent, width, height, box) {
    const [ex0, ey0, ex1, ey1] = extent;
    const [bx0, by0, bx1, by1] = box;
    if (bx1 < ex0 || bx0 > ex1 || by1 < ey0 || by0 > ey1) return null;
    const [x0, y0] = rasterPixelAt(extent, width, height, [bx0, by1]);
    const [x1, y1] = rasterPixelAt(extent, width, height, [bx1, by0]);
    return { x0, y0, x1, y1 };
}

/**
 * The pixels of an area that have no value: the window the statistics were computed on minus
 * the pixels that were counted.
 * @param {{ bounds?: { x0: number, y0: number, x1: number, y1: number }, pixelCount?: number }|null} stats
 * @returns {number|null}  null when the answer has no window
 */
export function noDataPixelCount(stats) {
    const b = stats && stats.bounds;
    if (!b || typeof stats.pixelCount !== 'number') return null;
    return Math.max(0, (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - stats.pixelCount);
}

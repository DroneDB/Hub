/**
 * Map coordinates become raster pixels on the raster's extent taken as a grid, the image origin
 * at the top left: a point to its pixel, a rectangle to the window of pixels it covers.
 */
import { describe, it, expect } from 'vitest';
import { rasterPixelAt, rasterPixelWindow, isInsideExtent, noDataPixelCount } from './rasterPixels';

// A 100 x 50 pixel raster on a 1000 x 500 map-unit extent: 10 map units per pixel
const EXTENT = [0, 0, 1000, 500];
const W = 100;
const H = 50;

describe('rasterPixelAt', () => {
    it('counts columns from the left and rows from the top', () => {
        expect(rasterPixelAt(EXTENT, W, H, [0, 500])).toEqual([0, 0]);
        expect(rasterPixelAt(EXTENT, W, H, [15, 485])).toEqual([1, 1]);
        expect(rasterPixelAt(EXTENT, W, H, [999, 1])).toEqual([99, 49]);
    });

    it('puts the far edges and a coordinate outside on the nearest edge pixel', () => {
        expect(rasterPixelAt(EXTENT, W, H, [1000, 0])).toEqual([99, 49]);
        expect(rasterPixelAt(EXTENT, W, H, [-50, 900])).toEqual([0, 0]);
    });
});

describe('isInsideExtent', () => {
    it('includes the edges', () => {
        expect(isInsideExtent(EXTENT, [0, 0])).toBe(true);
        expect(isInsideExtent(EXTENT, [1000, 500])).toBe(true);
        expect(isInsideExtent(EXTENT, [1000.1, 10])).toBe(false);
    });
});

describe('rasterPixelWindow', () => {
    it('gives the pixels a rectangle covers, its corners included', () => {
        expect(rasterPixelWindow(EXTENT, W, H, [100, 300, 205, 405])).toEqual({ x0: 10, y0: 9, x1: 20, y1: 20 });
    });

    it('keeps the part of a rectangle that is on the raster', () => {
        expect(rasterPixelWindow(EXTENT, W, H, [-100, -100, 55, 2000])).toEqual({ x0: 0, y0: 0, x1: 5, y1: 49 });
    });

    it('is null for a rectangle beside the raster', () => {
        expect(rasterPixelWindow(EXTENT, W, H, [1100, 0, 1200, 100])).toBeNull();
        expect(rasterPixelWindow(EXTENT, W, H, [0, -300, 100, -1])).toBeNull();
    });
});

describe('noDataPixelCount', () => {
    it('is the window minus the pixels counted', () => {
        expect(noDataPixelCount({ bounds: { x0: 0, y0: 0, x1: 9, y1: 9 }, pixelCount: 75 })).toBe(25);
        expect(noDataPixelCount({ bounds: { x0: 3, y0: 3, x1: 3, y1: 3 }, pixelCount: 1 })).toBe(0);
    });

    it('is null without a window', () => {
        expect(noDataPixelCount({ pixelCount: 4 })).toBeNull();
        expect(noDataPixelCount(null)).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { noDataPixelCount } from './rasterAreaStats';

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

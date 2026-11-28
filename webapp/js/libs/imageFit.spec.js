import { describe, it, expect } from 'vitest';
import { fitWithin } from './imageFit';

describe('fitWithin', () => {
    it('keeps an image that fits, and never enlarges it', () => {
        expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
        expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(300, 100, 512)).toEqual({ width: 300, height: 100 });
    });

    it('scales the long side down to the limit with the proportions kept', () => {
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(6000, 6000, 2000)).toEqual({ width: 2000, height: 2000 });
        expect(fitWithin(1000, 4000, 512)).toEqual({ width: 128, height: 512 });
    });

    it('gives whole pixels, also for a size that is not one (an SVG drawn to its proportions)', () => {
        expect(fitWithin(496.96, 282.84, 600)).toEqual({ width: 497, height: 283 });
        expect(fitWithin(512, 291.4, 512)).toEqual({ width: 512, height: 291 });
    });

    it('never makes a side of zero pixels', () => {
        expect(fitWithin(20000, 3, 2000)).toEqual({ width: 2000, height: 1 });
    });

    it('refuses an image with no size', () => {
        expect(() => fitWithin(0, 0, 1600)).toThrow();
        expect(() => fitWithin(NaN, 10, 1600)).toThrow();
    });
});

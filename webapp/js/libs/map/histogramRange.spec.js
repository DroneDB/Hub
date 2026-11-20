/**
 * An index histogram with outliers is shown on the range of the values the index can have (the server bins the range
 * worth showing itself, D-041: the Hub takes no percentiles); without bins enough there, no bars but the handles keep apart.
 */
import { describe, it, expect } from 'vitest';
import * as histogramRange from './histogramRange';
import { shownHistogram, MIN_SHOWN_BINS } from './histogramRange';

// `bins` equal bins from `min` to `max`, the counts given by `count(binCenter)`
function histogram(min, max, bins, count) {
    const width = (max - min) / bins;
    const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
    const counts = Array.from({ length: bins }, (_, i) => count(min + (i + 0.5) * width));
    return { counts, edges };
}

describe('shownHistogram', () => {
    it('keeps a histogram without outliers as it is', () => {
        const h = histogram(-0.2, 0.9, 255, () => 1);
        const shown = shownHistogram(h, { min: -0.2, max: 0.9 }, [-1, 1]);
        expect(shown).toEqual({ histogram: h, domain: [h.edges[0], h.edges[255]], bars: true, trimmed: false });
    });

    it('shows no bars over the index range when outliers put every value in a bin or two', () => {
        // The NDVI of a multispectral orthophoto, binned from min to max: -191.7 to 278.5
        const h = histogram(-191.73, 278.52, 255, v => (v > -2 && v < 2 ? 70000 : 0));
        const shown = shownHistogram(h, { min: -191.73, max: 278.52 }, [-1, 1]);
        expect(shown.bars).toBe(false);
        expect(shown.trimmed).toBe(true);
        expect(shown.domain).toEqual([-1, 1]);
        expect(shown.histogram).toEqual({ counts: [], edges: [-1, 1] });
    });

    it('keeps the whole bins inside the range when there are enough of them', () => {
        // A few far outliers in a fine histogram
        const h = histogram(-10, 10, 1000, v => (Math.abs(v) < 1 ? 50 : 0));
        const shown = shownHistogram(h, { min: -10, max: 10 }, [-1, 1]);
        expect(shown.bars).toBe(true);
        expect(shown.trimmed).toBe(true);
        expect(shown.histogram.counts.length).toBeGreaterThanOrEqual(MIN_SHOWN_BINS);
        expect(shown.histogram.edges.length).toBe(shown.histogram.counts.length + 1);
        expect(shown.domain[0]).toBeCloseTo(-1);
        expect(shown.domain[1]).toBeCloseTo(1);
        expect(shown.histogram.counts.every(c => c === 50)).toBe(true);
    });

    it('keeps a histogram the server binned over the range shown, and says values are left out', () => {
        // The server bins the range worth showing and counts the values outside: min -191.7, max 278.5
        const h = { ...histogram(-0.21, 1, 255, () => 10), below: 120, above: 80 };
        const stats = { min: -191.73, max: 278.52 };
        const shown = shownHistogram(h, stats, [-1, 1]);
        expect(shown.bars).toBe(true);
        expect(shown.trimmed).toBe(true);
        expect(shown.histogram.counts).toHaveLength(255);
        expect(shown.domain).toEqual([h.edges[0], h.edges[255]]);
        // Without below and above (a server that does not count them), min and max say it
        const { below, above, ...plain } = h;
        expect(below + above).toBe(200);
        expect(shownHistogram(plain, stats, [-1, 1]).trimmed).toBe(true);
    });

    it('does not trim a formula without a range: the Hub takes no range from percentiles (D-041)', () => {
        const h = histogram(-1000, 1000, 2000, () => 1);
        const shown = shownHistogram(h, { min: -1000, max: 1000, percentiles: { p2: 0, p98: 10 } }, null);
        expect(shown.domain).toEqual([-1000, 1000]);
        expect(shown.trimmed).toBe(false);
        expect(shown.histogram.counts).toHaveLength(2000);
    });

    it('keeps the histogram when the statistics give nothing to trim with', () => {
        const h = histogram(0, 1, 10, () => 1);
        expect(shownHistogram(h, {}, null).domain).toEqual([0, 1]);
        // A range outside the data does not empty it
        expect(shownHistogram(h, {}, [5, 6]).trimmed).toBe(false);
    });

    it('accepts an empty histogram', () => {
        expect(shownHistogram({ counts: [], edges: [] }, {}, null).domain).toEqual([0, 1]);
    });
});

describe('the Hub computes no stretch', () => {
    it('has no percentile range any more (D-041, FR-RAS-34)', () => {
        expect(histogramRange.percentileRange).toBeUndefined();
    });
});

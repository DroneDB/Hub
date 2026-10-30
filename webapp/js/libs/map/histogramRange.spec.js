/**
 * An index histogram with outliers is shown on the range of the values the index can have and
 * near the bulk of the data; without bins enough there, no bars but the handles keep apart.
 */
import { describe, it, expect } from 'vitest';
import { shownHistogram, percentileRange, MIN_SHOWN_BINS } from './histogramRange';

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
        const shown = shownHistogram(h, { percentiles: { p2: -0.1, p98: 0.8 } }, [-1, 1]);
        expect(shown).toEqual({ histogram: h, domain: [h.edges[0], h.edges[255]], bars: true, trimmed: false });
    });

    it('shows no bars over the index range when outliers put every value in a bin or two', () => {
        // The NDVI of a multispectral orthophoto: min -191.7, max 278.5, p2 0.37, p98 0.95
        const h = histogram(-191.73, 278.52, 255, v => (v > -2 && v < 2 ? 70000 : 0));
        const shown = shownHistogram(h, { percentiles: { p2: 0.37, p98: 0.95 } }, [-1, 1]);
        expect(shown.bars).toBe(false);
        expect(shown.trimmed).toBe(true);
        expect(shown.domain[0]).toBeCloseTo(0.37 - 0.58);
        expect(shown.domain[1]).toBe(1);
        expect(shown.histogram).toEqual({ counts: [], edges: shown.domain });
    });

    it('keeps the whole bins inside the range when there are enough of them', () => {
        // A few far outliers in a fine histogram
        const h = histogram(-10, 10, 1000, v => (Math.abs(v) < 1 ? 50 : 0));
        const shown = shownHistogram(h, { percentiles: { p2: -0.9, p98: 0.9 } }, [-1, 1]);
        expect(shown.bars).toBe(true);
        expect(shown.trimmed).toBe(true);
        expect(shown.histogram.counts.length).toBeGreaterThanOrEqual(MIN_SHOWN_BINS);
        expect(shown.histogram.edges.length).toBe(shown.histogram.counts.length + 1);
        expect(shown.domain[0]).toBeCloseTo(-1);
        expect(shown.domain[1]).toBeCloseTo(1);
        expect(shown.histogram.counts.every(c => c === 50)).toBe(true);
    });

    it('keeps a histogram the server binned over the range shown, and says values are left out', () => {
        // The server bins [p2 - spread, 1] and counts the values outside: min -191.7, max 278.5
        const h = { ...histogram(0.37 - 0.58, 1, 255, () => 10), below: 120, above: 80 };
        const stats = { min: -191.73, max: 278.52, percentiles: { p2: 0.37, p98: 0.95 } };
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

    it('uses the percentiles alone for a formula without a range', () => {
        const h = histogram(-1000, 1000, 2000, () => 1);
        const shown = shownHistogram(h, { percentiles: { p2: 0, p98: 10 } }, null);
        expect(shown.domain).toEqual([-10, 20]);
        expect(shown.histogram.counts).toHaveLength(30);
    });

    it('keeps the histogram when the statistics give nothing to trim with', () => {
        const h = histogram(0, 1, 10, () => 1);
        expect(shownHistogram(h, {}, null).domain).toEqual([0, 1]);
        expect(shownHistogram(h, { percentiles: { p2: 0.5, p98: 0.5 } }, null).trimmed).toBe(false);
        // A range outside the data does not empty it
        expect(shownHistogram(h, {}, [5, 6]).trimmed).toBe(false);
    });

    it('accepts an empty histogram', () => {
        expect(shownHistogram({ counts: [], edges: [] }, {}, null).domain).toEqual([0, 1]);
    });
});

describe('percentileRange', () => {
    it('is the 2nd and 98th percentiles, inside the formula range', () => {
        expect(percentileRange({ percentiles: { p2: 0.37, p98: 0.95 } }, [-1, 1])).toEqual([0.37, 0.95]);
        expect(percentileRange({ percentiles: { p2: -3, p98: 5 } }, [-1, 1])).toEqual([-1, 1]);
        expect(percentileRange({ percentiles: { p2: -3, p98: 5 } })).toEqual([-3, 5]);
    });

    it('is null without percentiles', () => {
        expect(percentileRange({ min: 0, max: 1 })).toBeNull();
        expect(percentileRange(null)).toBeNull();
    });
});

// @ts-check
/**
 * The range of an index histogram that is worth showing. The server bins the values of a formula
 * between their min and max, so a few outliers (an NDVI of -191 where the ground has no signal)
 * put almost every value in one or two bars and the range handles on top of each other. The
 * range shown keeps the values the index can have (its formula's range) and those near the
 * bulk of the data (within one 2%-98% spread of the 2nd and 98th percentiles).
 */

/**
 * @typedef {{ counts: number[], edges: number[] }} Histogram  `edges` has one more item than `counts`
 * @typedef {{ min?: number, max?: number, percentiles?: { p2?: number, p98?: number } }} BandStats
 * @typedef {{ histogram: Histogram, domain: [number, number], bars: boolean, trimmed: boolean }} ShownHistogram
 *   `domain` is the range the handles move in; `bars` is false when the histogram has too few
 *   bins inside it to show a shape (then `histogram` has no counts and its edges are the domain);
 *   `trimmed` is true when values outside the domain were left out
 */

/** Fewer bins than this inside the range shown draw no shape: no bars are drawn */
export const MIN_SHOWN_BINS = 16;

const isNum = v => typeof v === 'number' && isFinite(v);

/**
 * The 2nd and 98th percentiles of the statistics, inside the formula's range when it has one;
 * null without percentiles.
 * @param {BandStats|null|undefined} stats
 * @param {number[]|null|undefined} [validRange]  the formula's [min, max]
 * @returns {[number, number]|null}
 */
export function percentileRange(stats, validRange) {
    const p = stats && stats.percentiles;
    if (!p || !isNum(p.p2) || !isNum(p.p98)) return null;
    let [lo, hi] = [p.p2, p.p98];
    if (validRange && isNum(validRange[0]) && isNum(validRange[1])) {
        lo = Math.min(Math.max(lo, validRange[0]), validRange[1]);
        hi = Math.min(Math.max(hi, validRange[0]), validRange[1]);
    }
    return [lo, hi];
}

/**
 * The part of a histogram to show (see the module's comment).
 * @param {Histogram} histogram  bins of equal width
 * @param {BandStats|null|undefined} stats
 * @param {number[]|null|undefined} [validRange]  the formula's [min, max]
 * @returns {ShownHistogram}
 */
export function shownHistogram(histogram, stats, validRange) {
    const { counts = [], edges = [] } = histogram || {};
    const full = { histogram: { counts, edges }, bars: true, trimmed: false };
    if (counts.length === 0 || edges.length !== counts.length + 1) {
        return { ...full, domain: [edges[0] ?? 0, edges[edges.length - 1] ?? 1] };
    }
    const first = edges[0];
    const last = edges[edges.length - 1];
    let lo = first;
    let hi = last;
    if (validRange && isNum(validRange[0]) && isNum(validRange[1])) {
        lo = Math.max(lo, validRange[0]);
        hi = Math.min(hi, validRange[1]);
    }
    const p = percentileRange(stats);
    if (p && p[1] > p[0]) {
        const spread = p[1] - p[0];
        lo = Math.max(lo, p[0] - spread);
        hi = Math.min(hi, p[1] + spread);
    }
    if (!(hi > lo) || (lo <= first && hi >= last)) return { ...full, domain: [first, last] };

    // The bins that overlap the range, whole
    let from = 0;
    while (from < counts.length - 1 && edges[from + 1] <= lo) from++;
    let to = counts.length - 1;
    while (to > from && edges[to] >= hi) to--;
    if (to - from + 1 < MIN_SHOWN_BINS) {
        return { histogram: { counts: [], edges: [lo, hi] }, domain: [lo, hi], bars: false, trimmed: true };
    }
    const shownEdges = edges.slice(from, to + 2);
    return {
        histogram: { counts: counts.slice(from, to + 1), edges: shownEdges },
        domain: [shownEdges[0], shownEdges[shownEdges.length - 1]],
        bars: true,
        trimmed: true
    };
}

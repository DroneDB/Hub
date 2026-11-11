// @ts-check
/**
 * The range of an index histogram that is worth showing. A few outliers (an NDVI of -191 where
 * the ground has no signal) put almost every value in one or two bars and the range handles on
 * top of each other. The server bins the range worth showing itself (the values the index can have,
 * near the bulk of the data, D-041) and counts the values outside its edges (`below`, `above`); the
 * Hub computes no range of its own from the percentiles. A server that bins from min to max is
 * trimmed here to the values the index can have (its formula's range).
 */

/**
 * @typedef {{ counts: number[], edges: number[], below?: number, above?: number }} Histogram
 *   `edges` has one more item than `counts`; `below` and `above` count the values outside the edges
 * @typedef {{ min?: number, max?: number }} BandStats
 * @typedef {{ histogram: Histogram, domain: [number, number], bars: boolean, trimmed: boolean }} ShownHistogram
 *   `domain` is the range the handles move in; `bars` is false when the histogram has too few
 *   bins inside it to show a shape (then `histogram` has no counts and its edges are the domain);
 *   `trimmed` is true when values outside the domain are not in the histogram shown
 */

/** Fewer bins than this inside the range shown draw no shape: no bars are drawn */
export const MIN_SHOWN_BINS = 16;

const isNum = v => typeof v === 'number' && isFinite(v);

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
    // Values the server left outside its bins: it binned the range shown already
    const outside = (histogram.below > 0) || (histogram.above > 0) ||
        (isNum(stats?.min) && stats.min < first) || (isNum(stats?.max) && stats.max > last);
    let lo = first;
    let hi = last;
    if (validRange && isNum(validRange[0]) && isNum(validRange[1])) {
        lo = Math.max(lo, validRange[0]);
        hi = Math.min(hi, validRange[1]);
    }
    if (!(hi > lo) || (lo <= first && hi >= last)) return { ...full, domain: [first, last], trimmed: outside };

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

// @ts-check
/**
 * The donut of a group of counts of the report summary: a ring with a slice per count, clockwise from twelve o'clock in
 * the order of the counts, a gap of the page colour between slices, and the number of items in the middle. The live page
 * draws the slices as SVG elements and the PDF as an SVG string (pdfmake draws SVG), both from `donutGeometry`, so the
 * two draw the same ring.
 *
 * Pure: no DOM.
 */

/** The side of the square a donut is drawn in, in SVG units */
export const DONUT_SIZE = 120;
/** The inner radius of the ring, as a share of the outer one */
const HOLE = 0.62;
/** The width of the gap between two slices, in SVG units */
export const DONUT_GAP = 2;

/**
 * @typedef {{ key: string, label: string, count: number, colour: string }} DonutCount
 * @typedef {{ key: string, d: string, colour: string, title: string }} DonutSlice
 * @typedef {{ size: number, slices: DonutSlice[], centre: { x: number, y: number } }} DonutGeometry
 */

/** @param {number} value */
const fixed = value => Number(value.toFixed(2));

/**
 * The point at `radius` from the centre, `angle` radians clockwise from twelve o'clock.
 * @param {number} centre @param {number} radius @param {number} angle
 */
const at = (centre, radius, angle) => `${fixed(centre + radius * Math.sin(angle))} ${fixed(centre - radius * Math.cos(angle))}`;

/**
 * The path of the ring between `from` and `to` (radians clockwise from twelve o'clock).
 * @param {number} centre @param {number} outer @param {number} inner @param {number} from @param {number} to
 */
function ringPath(centre, outer, inner, from, to) {
    const large = to - from > Math.PI ? 1 : 0;
    return `M${at(centre, outer, from)}A${outer} ${outer} 0 ${large} 1 ${at(centre, outer, to)}`
        + `L${at(centre, inner, to)}A${inner} ${inner} 0 ${large} 0 ${at(centre, inner, from)}Z`;
}

/**
 * The whole ring, for a group with one count: two half rings in one path (an arc cannot end where it starts), drawn
 * with the even-odd rule so the hole stays empty.
 * @param {number} centre @param {number} outer @param {number} inner
 */
function fullRingPath(centre, outer, inner) {
    const half = (/** @type {number} */ radius, /** @type {0 | 1} */ sweep) =>
        `M${fixed(centre)} ${fixed(centre - radius)}A${radius} ${radius} 0 1 ${sweep} ${fixed(centre)} ${fixed(centre + radius)}`
        + `A${radius} ${radius} 0 1 ${sweep} ${fixed(centre)} ${fixed(centre - radius)}Z`;
    return half(outer, 1) + half(inner, 0);
}

/**
 * The slices of the donut of `counts` (those above zero), each with the path of its part of the ring, its colour and the
 * text a pointer over it shows ("High: 5").
 * @param {DonutCount[]} counts
 * @returns {DonutGeometry}
 */
export function donutGeometry(counts) {
    const size = DONUT_SIZE;
    const centre = size / 2;
    // The gap is a stroke of the page colour around each slice: half of it falls outside the ring
    const outer = centre - DONUT_GAP / 2;
    const inner = outer * HOLE;
    const shown = counts.filter(c => c.count > 0);
    const total = shown.reduce((sum, c) => sum + c.count, 0);
    let from = 0;
    const slices = shown.map(count => {
        const to = from + (count.count / total) * 2 * Math.PI;
        const d = shown.length === 1 ? fullRingPath(centre, outer, inner) : ringPath(centre, outer, inner, from, to);
        from = to;
        return { key: count.key, d, colour: count.colour, title: `${count.label}: ${count.count}` };
    });
    return { size, slices, centre: { x: centre, y: centre } };
}

/** @param {string} text */
const escapeXml = text => text.replace(/[&<>"']/g, c => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/**
 * The donut as an SVG document, for the PDF: the slices, then the number of items and its word in the hole.
 * @param {DonutCount[]} counts
 * @param {{ number: string, word: string }} middle  the text in the hole ("19", "items")
 * @param {{ background: string, ink: string, muted: string }} colours  the page, the text, the word under the number
 */
export function donutSvg(counts, middle, colours) {
    const { size, slices, centre } = donutGeometry(counts);
    const paths = slices.map(s => `<path d="${s.d}" fill="${s.colour}" fill-rule="evenodd" stroke="${colours.background}" stroke-width="${DONUT_GAP}" stroke-linejoin="round"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}`
        + `<text x="${centre.x}" y="${centre.y + 4}" text-anchor="middle" font-size="22" font-weight="bold" fill="${colours.ink}">${escapeXml(middle.number)}</text>`
        + `<text x="${centre.x}" y="${centre.y + 19}" text-anchor="middle" font-size="11" fill="${colours.muted}">${escapeXml(middle.word)}</text></svg>`;
}

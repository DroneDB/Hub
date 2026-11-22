// @ts-check
/**
 * The page of the PDF: the paper and orientation of the template, the margins, and how large a figure is drawn (and so
 * how many pixels it is rendered at). The definition and the image preparation both read it here, so a figure is
 * rendered for the box it is drawn in.
 */
import { SNAPSHOT_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';

/** Page sizes in points, in the portrait orientation, under the names pdfmake knows. */
const PAPER = Object.freeze({
    A4: { name: 'A4', width: 595.28, height: 841.89 },
    Letter: { name: 'LETTER', width: 612, height: 792 }
});

/** Margins in points: the header sits in the top one and the footer in the bottom one. */
export const MARGIN = Object.freeze({ left: 40, right: 40, top: 70, bottom: 56 });

/** A figure is rendered at this many pixels for each point it is drawn wide (about 290 dpi). */
export const PIXELS_PER_POINT = 4;

/**
 * @typedef {object} PageLayout
 * @property {'A4' | 'LETTER'} pageSize
 * @property {'portrait' | 'landscape'} pageOrientation
 * @property {number} width  of the page, in points
 * @property {number} height
 * @property {[number, number, number, number]} margins  left, top, right, bottom
 * @property {number} contentWidth
 * @property {number} contentHeight
 */

/**
 * @param {{ paper?: string, orientation?: string }} template
 * @returns {PageLayout}
 */
export function pageLayout(template) {
    const paper = /** @type {Record<string, typeof PAPER.A4>} */ (PAPER)[template.paper ?? ''] ?? PAPER.A4;
    const landscape = template.orientation === 'landscape';
    const width = landscape ? paper.height : paper.width;
    const height = landscape ? paper.width : paper.height;
    return {
        pageSize: /** @type {'A4' | 'LETTER'} */ (paper.name),
        pageOrientation: landscape ? 'landscape' : 'portrait',
        width,
        height,
        margins: [MARGIN.left, MARGIN.top, MARGIN.right, MARGIN.bottom],
        contentWidth: width - MARGIN.left - MARGIN.right,
        contentHeight: height - MARGIN.top - MARGIN.bottom
    };
}

/** The height of a map as a share of its width: that of the ground the frame covers, kept between a wide and a squarer shape. */
const MAP_ASPECT = Object.freeze({ min: 0.45, max: 0.8, none: 0.6 });

/**
 * The height over the width of the ground a frame covers ([west, south, east, north], degrees).
 * @param {number[] | null | undefined} frame
 */
export function frameAspect(frame) {
    if (!frame) return MAP_ASPECT.none;
    const [west, south, east, north] = frame;
    const metresWide = (east - west) * Math.cos((((south + north) / 2) * Math.PI) / 180);
    const ratio = metresWide > 0 ? (north - south) / metresWide : MAP_ASPECT.none;
    return Math.min(MAP_ASPECT.max, Math.max(MAP_ASPECT.min, ratio));
}

/**
 * How a block of the model that becomes an image is drawn: `share` of the width of the content, at most
 * `maxHeight` of the height of the content.
 * @param {any} block
 * @returns {{ share: number, maxHeight: number, aspect: number }}
 */
function figureSpec(block) {
    if (block.type === 'chart') return { share: 1, maxHeight: 0.3, aspect: 0.4 };
    if (block.type === 'capture3d') return { share: 0.8, maxHeight: 0.4, aspect: 0.6 };
    if (block.kind === 'item') return { share: 0.8, maxHeight: 0.4, aspect: frameAspect(block.frame) };
    return { share: 1, maxHeight: 0.55, aspect: frameAspect(block.frame) };
}

/**
 * The box of a figure: its size on the page in points and the size it is rendered at in pixels (its long side stays
 * within the limit of a snapshot).
 * @param {PageLayout} layout
 * @param {any} block  a mapSnapshot, chart or capture3d block
 * @returns {{ widthPt: number, heightPt: number, widthPx: number, heightPx: number }}
 */
export function figureBox(layout, block) {
    const { share, maxHeight, aspect } = figureSpec(block);
    let widthPt = layout.contentWidth * share;
    let heightPt = widthPt * aspect;
    if (heightPt > layout.contentHeight * maxHeight) {
        heightPt = layout.contentHeight * maxHeight;
        widthPt = heightPt / aspect;
    }
    const widthPx = Math.min(SNAPSHOT_MAX_SIDE, Math.round(widthPt * PIXELS_PER_POINT));
    return { widthPt, heightPt, widthPx, heightPx: Math.max(1, Math.round(widthPx * aspect)) };
}

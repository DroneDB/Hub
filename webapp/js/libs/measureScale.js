/**
 * The size of measurement labels and lines in the 3D and point cloud viewers (FR-VWR-37): the 12 px label and the 1 to 2 px
 * line that suit a 1080 px high view are too small on a 4K screen, so they follow the height of the canvas (CSS px).
 */

/** The label height of a 1080 px view, and the least a label has. */
export const MEASURE_LABEL_MIN_PX = 12;
/** The most a label has (a 1620 px high view and above). */
export const MEASURE_LABEL_MAX_PX = 18;
/** The width of a measurement line in CSS px (Giro3D's default is 2). */
export const MEASURE_LINE_PX = 3;

/**
 * The font size of a measurement label for a canvas `cssHeight` px high: the height / 90, from 12 to 18 px.
 * @param {number} cssHeight  CSS px, not device pixels
 */
export function measureLabelPx(cssHeight) {
    const px = Math.round((cssHeight || 0) / 90);
    return Math.min(MEASURE_LABEL_MAX_PX, Math.max(MEASURE_LABEL_MIN_PX, px));
}

/**
 * How many times larger than Potree's own (12 px based) labels a label is on a canvas `cssHeight` px high.
 * @param {number} cssHeight
 */
export function measureLabelFactor(cssHeight) {
    return measureLabelPx(cssHeight) / MEASURE_LABEL_MIN_PX;
}

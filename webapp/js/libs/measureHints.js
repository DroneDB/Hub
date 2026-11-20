// @ts-check
/**
 * The one hint text of every measuring and drawing tool (FR-XC-17): how to add a point, how to
 * finish and how to cancel (D-027). The 2D map tools, the 3D, splat and point-cloud toolbars read it
 * here, so a tool says the same thing in every viewer.
 */

const FINISH = 'Double-click, right-click or Enter finishes';
const CANCEL = 'Esc cancels';
const CROSSHAIR = 'Space adds the point at the crosshair';

/**
 * @param {'point' | 'line' | 'area' | 'box' | 'height' | 'pick' | 'measure'} kind  what is drawn: one point, a line, an area, a rectangle, a height,
 *   a place to pick, or a measure of another kind (the point cloud's angle, circle, azimuth)
 * @param {{ crosshair?: boolean }} [options]  the tool has the keyboard crosshair (the 2D map)
 * @returns {string}
 */
export function drawingHint(kind, { crosshair = false } = {}) {
    const keys = crosshair ? ` ${CROSSHAIR}.` : '';
    switch (kind) {
        case 'point':
            return `Click to place the point. ${CANCEL}.${keys}`;
        case 'pick':
            return `Click a place on the map. ${CANCEL}.${keys}`;
        case 'height':
            return `Click two points: the height is the difference along the up. ${CANCEL}.`;
        case 'measure':
            return `Click the points of the measure. ${FINISH}; ${CANCEL}.`;
        case 'box':
            return `Click two opposite corners of the rectangle. ${CANCEL}.${keys}`;
        case 'area':
            return `Click the corners of the area (3 or more). ${FINISH}; ${CANCEL}.${keys}`;
        case 'line':
        default:
            return `Click the points of the line. ${FINISH}; ${CANCEL}.${keys}`;
    }
}

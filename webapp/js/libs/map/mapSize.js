// @ts-check
/**
 * The size class of a MAP, which depends on the size of its container and not on the window
 * (FR-MAP-12, FR-XC-20): the same rule serves a phone, a narrow pane of the dataset page and an
 * embedded frame (FR-SHR-05). Its breakpoint is `sm` of libs/responsiveColumns.js.
 *
 *   narrow  - the map is narrower than `sm`: the layer panel starts folded, the stockpile settings
 *             fold when a mode is active, the Back button leaves the rail (the viewer bar has it);
 *   short   - the map is lower than SHORT_MAP_PX, the height the toolbar rail needs to show its
 *             tools in full (6 buttons of the map, 5 measure tools and their gaps);
 *   compact - narrow or short: the measure tools go behind one 'Measure' toggle.
 */
import { BREAKPOINT_PX } from '@/libs/responsiveColumns';

/** The height (px) below which the rail of tools of the map does not fit and the measure tools collapse */
export const SHORT_MAP_PX = 560;

/**
 * @typedef {{ width: number, height: number, narrow: boolean, short: boolean, compact: boolean }} MapSize
 */

/**
 * The size class of a map container. A size of 0 is unknown (a map not laid out yet): no class.
 * @param {number} width  px
 * @param {number} height  px
 * @returns {MapSize}
 */
export function mapSizeOf(width, height) {
    const narrow = width > 0 && width < BREAKPOINT_PX.sm;
    const short = height > 0 && height < SHORT_MAP_PX;
    return { width, height, narrow, short, compact: narrow || short };
}

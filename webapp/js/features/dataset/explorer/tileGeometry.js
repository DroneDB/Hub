// @ts-check
/**
 * The geometry of one explorer tile. EntryThumbnail lays itself out from these values (as CSS
 * variables) and the virtual grid sizes its rows from the same values, so a row is always as tall
 * as the tiles it holds: the virtual scroller places its rows absolutely and a taller tile would
 * draw into the next row.
 */

/** The side of the thumbnail, in px at a 16 px root font (EntryThumbnail sizes it in rem). */
export const TILE_THUMBNAIL_SIZE = 128;

/** The margin and the padding around a tile and the gap under its thumbnail, in rem. */
export const TILE_SPACING_REM = 0.25;

/** The lines of the name under the thumbnail: always this many, a longer name is clamped. */
export const TILE_LABEL_LINES = 2;

/** The line height of the name, in em: its lines follow the font size of the page. */
export const TILE_LABEL_LINE_HEIGHT = 1.5;

/** The narrowest grid column, in px: the explorer fits as many as its width holds. */
export const GRID_CELL_WIDTH = 140;

/**
 * The CSS variables a tile reads its spacing and the height of its name from.
 * @returns {Record<string, string | number>}
 */
export const tileCssVars = () => ({
    '--tile-spacing': `${TILE_SPACING_REM}rem`,
    '--tile-label-lines': TILE_LABEL_LINES,
    '--tile-label-line-height': TILE_LABEL_LINE_HEIGHT
});

/**
 * The height of a tile's margin box, in px, rounded up to a whole pixel: margin and padding above
 * and below, the thumbnail, the gap under it and the name.
 * @param {{ rootFontPx?: number, fontPx?: number, size?: number }} [fonts]
 *   rootFontPx: the root font size (rem); fontPx: the font size the name inherits (em);
 *   size: the thumbnail side at a 16 px root font
 * @returns {number}
 */
export const tileHeight = ({ rootFontPx = 16, fontPx = 16, size = TILE_THUMBNAIL_SIZE } = {}) => {
    const rem = rootFontPx;
    // Margin top and bottom, padding top and bottom, the gap under the thumbnail
    const spacing = 5 * TILE_SPACING_REM * rem;
    const thumbnail = (size / 16) * rem;
    const label = TILE_LABEL_LINES * TILE_LABEL_LINE_HEIGHT * fontPx;
    return Math.ceil(spacing + thumbnail + label);
};

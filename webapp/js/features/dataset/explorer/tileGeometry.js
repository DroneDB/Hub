// @ts-check
/**
 * The geometry of one explorer tile. EntryThumbnail lays itself out from these values (as CSS
 * variables) and the virtual grid sizes its rows from the same values, so a row is always as tall
 * as the tiles it holds: the virtual scroller places its rows absolutely and a taller tile would
 * draw into the next row.
 */

/** The side of the thumbnail, in px at a 16 px root font (EntryThumbnail sizes it in rem): the S size, the default of a narrower screen. */
export const TILE_THUMBNAIL_SIZE = 128;

/**
 * The thumbnail sizes the user chooses between (FR-EXP-43): S, M and L, in px at a 16 px root font.
 * The tile, the grid columns and the height of a virtual row all follow the size.
 */
export const TILE_SIZES = Object.freeze({ s: TILE_THUMBNAIL_SIZE, m: 192, l: 256 });

/**
 * The size in force: the stored choice when it is one of S, M and L, else M from the `xwide` breakpoint (a 4K screen
 * at 100%) and S below it.
 * @param {unknown} stored  the stored preference
 * @param {boolean} xwide   the window is `xwide` (2560 px) or wider
 * @returns {'s'|'m'|'l'}
 */
export const tileSizeChoice = (stored, xwide) => (
    typeof stored === 'string' && Object.hasOwn(TILE_SIZES, stored) ? /** @type {'s'|'m'|'l'} */ (stored) : (xwide ? 'm' : 's'));

/** The thumbnail side in px of a size choice (S when it is not one). @param {string} choice @returns {number} */
export const tileThumbnailSize = choice => (Object.hasOwn(TILE_SIZES, choice) ? TILE_SIZES[/** @type {'s'|'m'|'l'} */ (choice)] : TILE_THUMBNAIL_SIZE);

/** The margin and the padding around a tile and the gap under its thumbnail, in rem. */
export const TILE_SPACING_REM = 0.25;

/** The lines of the name under the thumbnail: always this many, a longer name is clamped. */
export const TILE_LABEL_LINES = 2;

/** The line height of the name, in em: its lines follow the font size of the page. */
export const TILE_LABEL_LINE_HEIGHT = 1.5;

/** What a grid column holds besides the thumbnail: the margin and the padding of the tile, in px. */
const GRID_CELL_EXTRA = 12;

/**
 * The narrowest grid column of a thumbnail side, in px: the explorer fits as many as its width holds.
 * @param {number} [size]  the thumbnail side
 */
export const gridCellWidth = (size = TILE_THUMBNAIL_SIZE) => size + GRID_CELL_EXTRA;

/** The narrowest grid column of the S size, in px. */
export const GRID_CELL_WIDTH = gridCellWidth();

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

// @ts-check
/**
 * The page size of the paged lists (Organizations, the datasets of an organization, Admin > Users and
 * Admin > Tasks, FR-XC-34): when the user did not choose a size, a page holds the rows that the visible
 * height holds. The arithmetic is here; composables/usePageSize.js measures and keeps it.
 */

/** The fewest rows a calculated page holds (a short window scrolls the list instead of shrinking the page) */
export const PAGE_SIZE_MIN = 10;

/** The most rows a page holds: the largest size of the paginators */
export const PAGE_SIZE_MAX = 100;

/** The sizes the paginators offer next to the calculated one */
export const PAGE_SIZE_CHOICES = Object.freeze([5, 10, 25, 50, 100]);

/** @param {unknown} value @returns {value is number} a size the user can choose: a whole number from 1 to PAGE_SIZE_MAX */
export const isPageSize = value => Number.isInteger(value) && /** @type {number} */ (value) >= 1 && /** @type {number} */ (value) <= PAGE_SIZE_MAX;

/**
 * The rows that fit: `height` holds `floor(height / rowHeight)` rows, at least `min` and at most `max`
 * items. In a card grid one row holds `columns` cards, so the page holds whole grid rows.
 * @param {object} view
 * @param {number} view.height  px that the rows may fill
 * @param {number} view.rowHeight  px of one row, its gap included
 * @param {number} [view.columns]  cards in a row of a card grid (1: a list)
 * @param {number} [view.min]
 * @param {number} [view.max]
 * @returns {number} items on a page
 */
export function rowsThatFit({ height, rowHeight, columns = 1, min = PAGE_SIZE_MIN, max = PAGE_SIZE_MAX }) {
    const perRow = Math.max(1, Math.floor(columns) || 1);
    const fewest = Math.ceil(min / perRow);
    const most = Math.max(fewest, Math.floor(max / perRow));
    const fitting = height > 0 && rowHeight > 0 ? Math.floor(height / rowHeight) : 0;
    return Math.min(most, Math.max(fewest, fitting)) * perRow;
}

/**
 * The offset of the first item of the page of `size` items that holds the item at `first`: the page a
 * list shows after its size changed, so the first item that was visible is still visible (FR-XC-34).
 * @param {number} first  offset of the first visible item (0-based)
 * @param {number} size  the new page size
 * @returns {number}
 */
export function pageStart(first, size) {
    if (!(size > 0) || !(first > 0)) return 0;
    return Math.floor(first / size) * size;
}

/**
 * The page (1-based) of `newSize` items that holds the first item of page `page` of `oldSize` items.
 * @param {number} page  1-based
 * @param {number} oldSize
 * @param {number} newSize
 * @returns {number}
 */
export function pageAfterResize(page, oldSize, newSize) {
    if (!(newSize > 0)) return 1;
    const first = (Math.max(1, page) - 1) * Math.max(0, oldSize);
    return Math.floor(first / newSize) + 1;
}

/**
 * The sizes a paginator offers: the usual ones, the calculated one and the one the user chose
 * (which may be none of the usual ones), ascending and without repeats.
 * @param {readonly number[]} base
 * @param {number} fit
 * @param {number|null} [chosen]
 * @returns {number[]}
 */
export function pageSizeOptions(base, fit, chosen = null) {
    return [...new Set([...base, fit, ...(chosen != null ? [chosen] : [])])].sort((a, b) => a - b);
}

/**
 * The sizes a paginator offers (pageSizeOptions), each with its label. The size that fits reads "N (fit)": picking
 * it is no choice of a size, the page goes on fitting its height and nothing is stored; any other size is the
 * user's choice and is stored (FR-XC-34).
 * @param {readonly number[]} base
 * @param {number} fit
 * @param {number|null} [chosen]
 * @returns {{ value: number, label: string }[]}
 */
export function pageSizeChoices(base, fit, chosen = null) {
    return pageSizeOptions(base, fit, chosen).map(value => ({ value, label: value === fit ? `${value} (fit)` : String(value) }));
}

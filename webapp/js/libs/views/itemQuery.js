// @ts-check
/**
 * The `item` of the address of a viewer: `?item=<id>` asks the 2D map and the point cloud viewer to frame and select the
 * annotation with that id (the link of a report item). Both read it once and take it off the address, so a reload or a
 * shared address is the view, not the framing.
 */

/** What the viewers say of an id that no annotation of theirs has: they open as usual, with this notice. */
export const ITEM_GONE = 'This item no longer exists';

/**
 * The id the query asks for, '' when it asks for none (a repeated key is the first one).
 * @param {Record<string, unknown> | null | undefined} query  a route's `query`
 */
export function itemFromQuery(query) {
    const value = query?.item;
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first : '';
}

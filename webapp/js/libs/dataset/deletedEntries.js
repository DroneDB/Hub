// @ts-check
/**
 * The `deleteEntries` event of the event bus: the entries that left the paths they had in a dataset (deleted, renamed,
 * moved, replaced by a rescan). It names the dataset with the paths, so a listener that outlives the dataset page (the
 * clipboard) acts only on its own dataset, whatever page is on show when the answer of the deletion comes.
 *
 * A bare list of paths, as the event was sent before it named its dataset, still gives its paths; it names no dataset.
 *
 * The name of the event is written out where it is sent and heard, so the listener audit pairs each listener with its
 * removal. The sender gives deletedEntriesEvent(dataset, paths); a listener reads deletedPathsOf(event) and
 * deletedDatasetOf(event).
 */

/**
 * @typedef {object} DeletedEntries
 * @property {{ org: string, ds: string }} dataset  the slugs of the organization and of the dataset
 * @property {string[]} paths  the paths that left, in the dataset
 */

/**
 * The event of the paths that left a dataset.
 * @param {{ org: string, ds: string }} dataset  a dataset of the API, or its slugs
 * @param {string[]} paths
 * @returns {DeletedEntries}
 */
export function deletedEntriesEvent(dataset, paths) {
    return { dataset: { org: dataset.org, ds: dataset.ds }, paths: [...paths] };
}

/**
 * The paths of an event, of either shape (a bare list is the paths); none for anything else.
 * @param {unknown} event
 * @returns {string[]}
 */
export function deletedPathsOf(event) {
    if (Array.isArray(event)) return event;
    const paths = /** @type {any} */ (event)?.paths;
    return Array.isArray(paths) ? paths : [];
}

/**
 * The dataset an event names, or null when it names none (a bare list of paths).
 * @param {unknown} event
 * @returns {{ org: string, ds: string } | null}
 */
export function deletedDatasetOf(event) {
    const dataset = Array.isArray(event) ? null : /** @type {any} */ (event)?.dataset;
    return dataset && typeof dataset.org === 'string' && typeof dataset.ds === 'string' && dataset.org && dataset.ds
        ? { org: dataset.org, ds: dataset.ds }
        : null;
}

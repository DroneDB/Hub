// @ts-check
/**
 * Task states and the dataset key used to group tasks. The task monitor, the
 * build manager and the heavy-task helpers read these, so "is this task still running"
 * has one answer. Mirrors the server's TaskStateCatalog.
 */

/** States a task is still in progress in (TaskStateCatalog.Active). */
export const ACTIVE_STATES = Object.freeze(['Awaiting', 'Created', 'Indexing', 'Enqueued', 'Processing', 'Scheduled', 'Reused']);

/** States a task ends in. */
export const TERMINAL_STATES = Object.freeze(['Succeeded', 'Failed', 'Deleted']);

/** @param {string} state */
export const isActiveState = state => ACTIVE_STATES.includes(state);

/** @param {string} state */
export const isTerminalState = state => TERMINAL_STATES.includes(state);

/**
 * Stable identity of a dataset for task stores and event matching.
 * @param {{ baseApi?: string, org?: string, ds?: string }} dataset
 */
export function datasetKey(dataset) {
    return dataset.baseApi || `${dataset.org}/${dataset.ds}`;
}

// @ts-check
/**
 * What the Hub says about a busy dataset, written once: while an import or a rescan of its index runs, the Registry
 * refuses every request on the dataset but its delete and its tasks. The list row, its menu and buttons, the delete
 * question and the page state of the dataset read their text here.
 *
 * A busy state is the Registry's `{ kind, taskId, progress }`: from the dataset list (`busy`), from the 409 of a request
 * (libs/ddb/apiError datasetBusyOf), or from the task store (libs/tasks/taskMonitor getBusy).
 */
import { formatNumber } from '@/libs/format';

/**
 * @typedef {{ kind: string, taskId?: string | null, progress?: number | null }} DatasetBusy
 */

/** The words of each kind */
// `ends`: what the page says it waits for; `stops`: the delete stops a task first
const KINDS = Object.freeze({
    importing: { label: 'Importing', task: 'import', passive: 'imported', name: 'Dataset import', ends: 'opens when the import ends', stops: true },
    rescanning: { label: 'Rescanning', task: 'rescan', passive: 'rescanned', name: 'Index rescan', ends: 'opens when the rescan ends', stops: true },
    // The import was cancelled: the Registry deletes the dataset it created
    deleting: { label: 'Deleting', task: 'delete', passive: 'deleted', name: 'Dataset delete', ends: 'is deleted because its import was cancelled', stops: false }
});

// A kind this Hub does not know (a newer Registry)
const OTHER = Object.freeze({ label: 'Updating', task: 'task', passive: 'updated', name: 'Task', ends: 'opens when the task ends', stops: true });

/** @param {DatasetBusy | null | undefined} busy */
const wordsOf = busy => KINDS[/** @type {keyof typeof KINDS} */ (busy?.kind)] ?? OTHER;

/**
 * The tag of a busy dataset, with the progress when there is one: "Importing… 40 %", "Rescanning…".
 * @param {DatasetBusy} busy
 * @returns {string}
 */
export function busyLabel(busy) {
    const percent = Math.round(busy?.progress ?? 0);
    const label = `${wordsOf(busy).label}…`;
    return percent > 0 ? `${label} ${formatNumber(percent, 0)} %` : label;
}

/**
 * Why the dataset cannot be opened or edited now, or null when it is not busy.
 * @param {DatasetBusy | null | undefined} busy
 * @returns {string | null}
 */
export function busyBlockReason(busy) {
    return busy ? `The dataset is being ${wordsOf(busy).passive}` : null;
}

/**
 * What the delete of a busy dataset does first, or null when it is not busy.
 * @param {DatasetBusy | null | undefined} busy
 * @returns {string | null}
 */
export function busyDeleteWarning(busy) {
    const words = busy ? wordsOf(busy) : null;
    if (!words?.stops) return null;
    return `The ${words.task} stops first, then the dataset and all its files are deleted.`;
}

/**
 * The action that stops what keeps the dataset busy: "Cancel import", "Cancel rescan".
 * @param {DatasetBusy | null | undefined} busy
 * @returns {string}
 */
export function busyCancelLabel(busy) {
    return `Cancel ${wordsOf(busy).task}`;
}

/**
 * The task that keeps the dataset busy, as the cancel question names it: "Dataset import", "Index rescan".
 * @param {DatasetBusy | null | undefined} busy
 * @returns {string}
 */
export function busyTaskName(busy) {
    return wordsOf(busy).name;
}

/**
 * The page state of a busy dataset: its heading and its text.
 * @param {DatasetBusy | null | undefined} busy
 * @param {string} name  the dataset as the address names it
 * @returns {{ heading: string, text: string }}
 */
export function busyPageText(busy, name) {
    const { passive, ends, stops } = wordsOf(busy);
    const quoted = name ? `"${name}"` : 'The dataset';
    return {
        heading: `This dataset is being ${passive}`,
        text: stops ? `${quoted} ${ends}. Until then it can only be deleted.` : `${quoted} ${ends}.`
    };
}

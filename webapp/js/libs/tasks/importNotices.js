// @ts-check
/**
 * importNotices - the toast that tells an import has ended (FR-UPL-11, FR-XC-16, D-004). An import outlives the dialog
 * that started it ("Run in background") and the page that showed it, so the notice is not a component's: it listens to
 * the 'importEnded' event of libs/tasks/taskMonitor, whose store is in the scope of the app (main.js starts it once).
 *
 *   - Succeeded: "Import complete", with an "Open dataset" action;
 *   - Failed: "Import failed" with the error of the task (FR-XC-06), and the "Open dataset" action only while the dataset
 *     is still there: a failed or cancelled import deletes the dataset that it created (D-004), so there is nothing to open;
 *   - cancelled: "Import cancelled".
 */
import taskMonitor from './taskMonitor';
import { notify } from '@/libs/notify';
import { FAILED_WITHOUT_MESSAGE } from './heavyTaskStatus';
import { DATASET_GONE_MESSAGE } from '@/composables/useHeavyTask';

/**
 * @typedef {object} ImportEnd
 * @property {{ org: string, ds: string }} dataset  the dataset of the import
 * @property {{ state?: string, error?: string | null } | null} task  the task as last listed, or null
 * @property {boolean} gone  the dataset was deleted (the rollback of a cancelled or failed import)
 */

/**
 * The toast of an import that ended.
 * @param {ImportEnd} end
 * @param {(dataset: { org: string, ds: string }) => void} open  goes to the dataset page
 */
export function noticeImportEnded({ dataset, task, gone }, open) {
    const slug = dataset.ds;
    const action = { label: 'Open dataset', run: () => open(dataset) };
    const state = task?.state;
    if (state === 'Succeeded') {
        notify.success(`Dataset "${slug}" imported successfully`, { summary: 'Import complete', life: 'long', ...(gone ? {} : { action }) });
    } else if (state === 'Failed' || !task || state === 'Processing' || state === 'Enqueued') {
        // A task that is not terminal in the last list, and whose dataset is gone, did not finish either
        const reason = task?.error || (gone ? DATASET_GONE_MESSAGE : FAILED_WITHOUT_MESSAGE);
        notify.error(`${slug}: ${reason}`, { summary: 'Import failed', life: 'long', ...(gone ? {} : { action }) });
    } else {
        notify.info(`Import of "${slug}" was cancelled`, { summary: 'Import cancelled', life: 'normal' });
    }
}

/**
 * Starts the notices for the life of the page.
 * @param {(dataset: { org: string, ds: string }) => void} open  goes to the dataset page
 * @param {{ on: Function, off: Function }} [monitor]
 * @returns {() => void}  stops them
 */
export function startImportNotices(open, monitor = taskMonitor) {
    /** @param {ImportEnd} end */
    const onEnded = end => noticeImportEnded(end, open);
    monitor.on('importEnded', onEnded);
    return () => monitor.off('importEnded', onEnded);
}


// @ts-check
/**
 * useTaskActions - what a task row does, the same in the dataset Tasks tab and in Admin > Tasks (FR-XC-15):
 *
 *   const actions = useTaskActions({ datasetOf, deleteTask, refresh, confirm, toolTitle, datasetName });
 *   actions.can(task, 'retry');   // the server's actions of the row (D-024)
 *   await actions.cancel(task);   // asks, cancels, says what came of it, refreshes the rows (D-002)
 *   await actions.retry(task);    // queues it again: the row shows Enqueued at once (FR-PRC-19)
 *   await actions.remove(task);   // asks, removes it from the history
 *   actions.logTitle(task);       // "Merge Multispectral · → out.tif · org/ds · 11/09/2026, 10:00:00"
 *
 * The Registry decides what a row offers (`actions`: cancel, retry, delete, viewLog), for the user who reads it;
 * the rows render those buttons and no others. Each action confirms its result with a toast.
 */
import { reactive } from 'vue';
import { notify as appNotify } from '@/libs/notify';
import { isBadRequest } from '@/libs/ddb/apiError';
import { isTerminalState } from '@/libs/tasks/taskStates';
import { deleteConfirmation } from '@/libs/deleteConfirmation';
import { cancelConfirmation } from '@/libs/tasks/cancelConfirmation';
import { taskTarget, taskDateTime } from '@/libs/tasks/taskFormat';

/** The actions the server may list for a row. */
export const TaskAction = Object.freeze({ CANCEL: 'cancel', RETRY: 'retry', DELETE: 'delete', VIEW_LOG: 'viewLog' });

/**
 * Whether the server offers `action` on a task row, for the user who reads it (D-024). A row without the list
 * offers nothing.
 * @param {{ actions?: string[] | null } | null | undefined} task
 * @param {string} action
 */
export const offersAction = (task, action) => Array.isArray(task?.actions) && task.actions.includes(action);

/**
 * @typedef {{ outcome: 'cancelled' }
 *   | { outcome: 'noChange' }
 *   | { outcome: 'alreadyEnded' }
 *   | { outcome: 'failed', error: any }} CancelOutcome
 */

/**
 * Cancels a task and says what came of it (FR-PRC-10, D-002). The Registry answers a cancel of a task that has
 * already ended with a 400: the task is then read again, and when its state is terminal the outcome is
 * 'alreadyEnded', a neutral result. The status is tested, never the message text. A 400 for a task still active,
 * a failed re-read or any other error is 'failed'. A 200 that deleted nothing (the task ended between the check
 * and the cancel) is 'noChange'. Callers refresh the row in every case.
 * @param {{ cancelTask: (id: string) => Promise<any>, getTask: (id: string) => Promise<any> }} dataset
 * @param {string} taskId
 * @returns {Promise<CancelOutcome>}
 */
export async function cancelTaskOutcome(dataset, taskId) {
    try {
        const { deleted } = (await dataset.cancelTask(taskId)) || {};
        return deleted === false ? { outcome: 'noChange' } : { outcome: 'cancelled' };
    } catch (error) {
        if (!isBadRequest(error)) return { outcome: 'failed', error };
        try {
            const task = await dataset.getTask(taskId);
            if (task && isTerminalState(task.state)) return { outcome: 'alreadyEnded' };
        } catch {
            // The task could not be read again: report the refusal of the cancel
        }
        return { outcome: 'failed', error };
    }
}

/**
 * @typedef {object} TaskActionsOptions
 * @property {(task: any) => any} datasetOf  the dataset API of a task (cancelTask, getTask, retryTask)
 * @property {(task: any) => Promise<any>} deleteTask  removes an ended task from the history
 * @property {() => Promise<any>} refresh  reads the rows again
 * @property {(options: any) => Promise<boolean>} confirm  useConfirm
 * @property {(task: any) => string} toolTitle  the title of a task's tool
 * @property {(task: any) => string} [datasetName]  "org/ds" of a task, for the log title
 * @property {{ success: Function, info: Function, error: Function }} [notify]
 */

/**
 * @param {TaskActionsOptions} options
 */
export function useTaskActions(options) {
    const { datasetOf, deleteTask, refresh, confirm, toolTitle, datasetName = () => '', notify = appNotify } = options;

    const can = offersAction;

    // The ids of the tasks a cancel or a retry is running on: a second one of the same task is ignored, and the
    // table disables the row's buttons meanwhile (a double click sent two requests: a success, then a failure)
    const busyIds = reactive(new Set());
    /** Whether a cancel or a retry of the task is running. @param {any} task */
    const isBusy = task => busyIds.has(task?.taskId);

    /**
     * Asks, then cancels: "Task cancelled" when it was, a neutral note when it had already ended (D-002), the error
     * otherwise. The rows are read again in every case. The question is the one of every task cancel: a task that
     * adds files says what is deleted (libs/tasks/cancelConfirmation, FR-UPL-05).
     * @param {any} task
     * @returns {Promise<CancelOutcome | null>} null when the user did not confirm
     */
    async function cancel(task) {
        if (isBusy(task)) return null;
        busyIds.add(task.taskId);
        try {
            return await runCancel(task);
        } finally {
            busyIds.delete(task.taskId);
        }
    }

    /** @param {any} task @returns {Promise<CancelOutcome | null>} */
    async function runCancel(task) {
        if (!await confirm(cancelConfirmation(task, toolTitle(task)))) return null;

        try {
            const result = await cancelTaskOutcome(datasetOf(task), task.taskId);
            if (result.outcome === 'cancelled')
                notify.success('The task has been stopped.', { summary: 'Task cancelled' });
            else if (result.outcome === 'alreadyEnded')
                notify.info('The task had already ended, so there was nothing to cancel.', { summary: 'Not cancelled' });
            else if (result.outcome === 'failed')
                notify.error(result.error?.message, { summary: 'Cancel failed' });
            // noChange: the task ended between the check and the cancel; the refreshed row shows how
            return result;
        } finally {
            // The row shows the real state at once, whatever the answer (D-002)
            await refresh();
        }
    }

    /**
     * Runs a failed task again from the beginning. The row shows it queued at once, until the next read of the
     * rows; a refusal of the server (a submit check of the tool: 400, 409, 507) shows its message.
     * @param {any} task
     * @returns {Promise<boolean>} whether the task was queued again
     */
    async function retry(task) {
        if (isBusy(task)) return false;
        busyIds.add(task.taskId);
        try {
            return await runRetry(task);
        } finally {
            busyIds.delete(task.taskId);
        }
    }

    /** @param {any} task @returns {Promise<boolean>} */
    async function runRetry(task) {
        try {
            await datasetOf(task).retryTask(task.taskId);
        } catch (e) {
            notify.error(e?.message, { summary: 'Retry failed' });
            return false;
        }
        // Whoever may retry a task may cancel it and read its log: the actions of a queued task (D-024)
        Object.assign(task, {
            state: 'Enqueued', error: null, errorType: null, progressPercent: null, phaseMessage: null,
            startedAt: null, finishedAt: null, waitingForNode: false, cancelledBy: null,
            actions: [TaskAction.VIEW_LOG, TaskAction.CANCEL]
        });
        notify.success('The task will run again from the beginning.', { summary: 'Task queued again' });
        await refresh();
        return true;
    }

    /**
     * Asks, then removes an ended task (and its results) from the history.
     * @param {any} task
     * @returns {Promise<boolean>} whether it was removed
     */
    async function remove(task) {
        const target = taskTarget(task);
        if (!await confirm(deleteConfirmation({
            kind: 'task',
            items: [{ name: toolTitle(task), note: target ? `on ${target}` : '' }],
            lost: ['the results it produced that are still available for download']
        }))) return false;
        try {
            await deleteTask(task);
            notify.success('The task has been removed from history.', { summary: 'Task deleted' });
        } catch (e) {
            notify.error(e?.message, { summary: 'Delete failed' });
            return false;
        }
        await refresh();
        return true;
    }

    /**
     * The title of a task's log: its tool, its target, its dataset and when it was created (FR-PRC-29).
     * @param {any} task
     */
    function logTitle(task) {
        if (!task) return '';
        return [toolTitle(task), taskTarget(task), datasetName(task), taskDateTime(task.createdAt)]
            .filter(Boolean).join(' · ');
    }

    return { can, cancel, retry, remove, logTitle, busyIds, isBusy };
}

// @ts-check
import { isBadRequest } from '@/libs/ddb/apiError';
import { isTerminalState } from '@/libs/tasks/taskStates';

/**
 * @typedef {{ outcome: 'cancelled' }
 *   | { outcome: 'noChange' }
 *   | { outcome: 'alreadyEnded' }
 *   | { outcome: 'failed', error: any }} CancelOutcome
 */

/**
 * Cancels a task and says what came of it, for the dataset Tasks tab and Admin > Tasks (FR-PRC-10, D-002).
 * The Registry answers a cancel of a task that has already ended with a 400: the task is then read again,
 * and when its state is terminal the outcome is 'alreadyEnded', a neutral result. The status is tested,
 * never the message text. A 400 for a task still active, a failed re-read or any other error is 'failed'.
 * A 200 that deleted nothing (the task ended between the check and the cancel) is 'noChange'.
 * Callers refresh the row in every case. FR-XC-15 (unit U-302) moves this into useTaskActions.
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

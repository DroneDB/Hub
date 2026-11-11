// @ts-check
/**
 * What a tool dialog says about its task (FR-XC-15): queued, running (the phase, the percent), done, failed
 * with the message of the task (FR-XC-06), or cancelled. The one reading of a task entry (composables/useHeavyTask)
 * for the HeavyTaskStatus component, so Merge, Align, Extract, the training export and the export control say the
 * same thing. The states come from libs/tasks/taskStates and the labels from libs/tasks/taskFormat.
 */
import { isTerminalState } from '@/libs/tasks/taskStates';
import { isWaitingForNode, stateLabel } from '@/libs/tasks/taskFormat';
import { formatNumber } from '@/libs/format';

/** @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelled'} HeavyTaskKind */

/**
 * @typedef {object} HeavyTaskView
 * @property {HeavyTaskKind} kind
 * @property {string} icon  Font Awesome icon
 * @property {string} text  the state in words ("Queued…", the phase, "Done", "Failed")
 * @property {string} percent  "42%" while it runs, else ''
 * @property {number | null} value  the percent as a number while it runs, else null
 * @property {string} error  the reason it failed, else ''
 * @property {string} title  tooltip, else ''
 */

/** Shown when a task failed and the server kept no message */
export const FAILED_WITHOUT_MESSAGE = 'The task failed.';

/** States where the task has not started: it waits its turn. */
const QUEUED_STATES = ['Awaiting', 'Created', 'Enqueued', 'Scheduled'];

/**
 * @param {{ state?: string, percent?: number | null, phase?: string | null, error?: string | null, waitingForNode?: boolean, cancelledBy?: string | null, datasetGone?: boolean } | null | undefined} task
 *   a live entry of useHeavyTask
 * @param {{ error?: string | null, phases?: Record<string, string> }} [options]
 *   error: a refusal of the submit, which has no task (a 409), or the dialog's own reason to stop: shown as a
 *   failure also while the task's last known state is not an end (the dialog is unlocked, so "Running…" with a
 *   spinner would be false); phases: the words of the phases
 *   a tool reports, when they are not words yet
 * @returns {HeavyTaskView | null}  null when there is nothing to say
 */
export function describeHeavyTask(task, { error = null, phases = {} } = {}) {
    if (!task) {
        return error ? { kind: 'failed', icon: 'fa-solid fa-xmark', text: 'Failed', percent: '', value: null, error, title: '' } : null;
    }
    const state = task.state ?? 'Enqueued';
    if (state === 'Succeeded') {
        return { kind: 'done', icon: 'fa-solid fa-check', text: 'Done', percent: '', value: null, error: '', title: '' };
    }
    if (state === 'Failed') {
        // A failed task never shows a full progress bar (FR-XC-06): no percent
        return { kind: 'failed', icon: 'fa-solid fa-xmark', text: 'Failed', percent: '', value: null, error: task.error || error || FAILED_WITHOUT_MESSAGE, title: '' };
    }
    if (isTerminalState(state)) {
        const label = stateLabel({ state, cancelledBy: task.cancelledBy });
        return {
            kind: 'cancelled', icon: 'fa-solid fa-ban', text: label, percent: '', value: null,
            error: task.error || '', title: task.cancelledBy ? `Cancelled by ${task.cancelledBy}` : ''
        };
    }
    // The dataset of the task is gone (its last state, Processing or Enqueued, can never change) or the dialog
    // gave a reason it stopped: a failure, never a spinner
    if (task.datasetGone || error) {
        return { kind: 'failed', icon: 'fa-solid fa-xmark', text: 'Failed', percent: '', value: null, error: error || task.error || FAILED_WITHOUT_MESSAGE, title: '' };
    }
    // A task a processing node keeps queued waits too, whatever its state says
    const waitingForNode = isWaitingForNode({ state, waitingForNode: task.waitingForNode });
    if (waitingForNode || QUEUED_STATES.includes(state)) {
        return {
            kind: 'queued', icon: 'fa-regular fa-clock', text: 'Queued…', percent: '', value: null, error: '',
            title: waitingForNode ? 'Queued on node: it starts when the processing node is free' : ''
        };
    }
    // Processing, Indexing, Reused (a task already running that this submit joined) and any state not known yet
    const phase = task.phase ? (phases[task.phase] ?? task.phase) : '';
    const value = typeof task.percent === 'number' && task.percent > 0 ? Math.min(100, task.percent) : null;
    return {
        kind: 'running', icon: 'fa-solid fa-gear fa-spin', text: phase || 'Running…',
        percent: value === null ? '' : `${formatNumber(value, 0)}%`, value, error: '', title: ''
    };
}

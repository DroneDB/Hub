// @ts-check
/**
 * useDatasetBusy - the busy state of a page of a dataset (the dataset page, a file viewer): while an import or a rescan
 * of its index runs, the Registry refuses every request on the dataset but its delete and its tasks, and the page shows
 * the busy state of ResourceState in place of its content.
 *
 *   const datasetBusy = useDatasetBusy({ dataset: () => ds, dialogs, onEnded: ({ rolledBack }) => … });
 *   datasetBusy.enter(datasetBusyOf(error));   // the 409 of a request said so
 *   <ResourceState kind="busy" :busy="datasetBusy.busy.value" :actions="datasetBusy.actions.value" />
 *   <DialogHost :dialogs="dialogs" />         (the cancel question)
 *
 * The task store of the app (libs/tasks/taskMonitor) follows the task: the state takes its progress, and a page that
 * asks for it (`enterFromStore`) turns busy when the store lists a busy task of the dataset (a rescan started from
 * Settings, or by another user). When the task ends, `onEnded` is told, with `rolledBack` for an import that did not
 * succeed (cancelled or failed: the Registry deletes the dataset it created; the state stays, the page leaves). `actions` offers Cancel import / Cancel
 * rescan when the Registry offers the cancel of that task to the user (the `actions` of the task as the store lists it),
 * with the question and the answer of every task cancel (useHeavyTaskCancel).
 */
import { shallowRef, computed, onBeforeUnmount } from 'vue';
import taskMonitor, { datasetKey, toolOfBusy, BUSY_TOOLS, IMPORT_TOOL_ID } from '@/libs/tasks/taskMonitor';
import { busyCancelLabel, busyTaskName } from '@/libs/dataset/busyReason';
import { offersAction, TaskAction } from '@/composables/useTaskActions';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';

/**
 * @typedef {{ kind: string, taskId: string | null, progress: number | null }} DatasetBusy
 */

/**
 * @param {object} options
 * @param {() => any} options.dataset  the dataset API (null while there is none)
 * @param {{ open: Function }} options.dialogs  from useDialogs(), for the cancel question
 * @param {() => boolean} [options.enterFromStore]  whether a busy task the store lists makes the page busy
 * @param {(busy: DatasetBusy | null) => void} [options.onChange]  the state changed (entered, updated, ended)
 * @param {(end: { rolledBack: boolean }) => void} [options.onEnded]  the task that kept the dataset busy ended
 */
export function useDatasetBusy({ dataset, dialogs, enterFromStore = () => true, onChange = () => {}, onEnded = () => {} }) {
    /** @type {import('vue').ShallowRef<DatasetBusy | null>} */
    const busy = shallowRef(null);

    /**
     * The dataset is busy; called again, the progress moves. The 409 of a request carries no progress: the one the store
     * gave for the same task is kept. The store follows the task until it ends.
     * @param {DatasetBusy} next
     */
    function enter(next) {
        const known = busy.value;
        busy.value = next.progress == null && known?.taskId === next.taskId ? { ...next, progress: known.progress } : next;
        if (next.taskId) taskMonitor.trackBusy(dataset(), next.taskId, next.kind);
        onChange(busy.value);
    }

    function end() {
        busy.value = null;
        onChange(null);
        onEnded({ rolledBack: false });
    }

    /** @param {any} changed */
    const isThisDataset = changed => {
        const mine = dataset();
        return !!changed && !!mine && datasetKey(changed) === datasetKey(mine);
    };

    // The store's list of the tasks changed: the progress moved, or a task that keeps the dataset busy runs now
    function onTasksUpdated({ dataset: changed }) {
        if (!isThisDataset(changed) || (!busy.value && !enterFromStore())) return;
        const next = taskMonitor.getBusy(dataset());
        if (next) enter(next);
    }

    // The task ended: an import that did not succeed has its dataset deleted (the state stays while the page leaves: the
    // dataset does not open); else the page opens, unless another task keeps the dataset busy
    function onBusyEnded({ dataset: changed, task, gone, kind }) {
        if (!isThisDataset(changed) || !busy.value) return;
        if (kind === BUSY_TOOLS[IMPORT_TOOL_ID] && (gone || task?.state !== 'Succeeded')) {
            onEnded({ rolledBack: true });
            return;
        }
        const still = taskMonitor.getBusy(dataset());
        if (still) enter(still);
        else end();
    }

    taskMonitor.on('tasksUpdated', onTasksUpdated);
    taskMonitor.on('busyEnded', onBusyEnded);
    onBeforeUnmount(() => {
        taskMonitor.off('tasksUpdated', onTasksUpdated);
        taskMonitor.off('busyEnded', onBusyEnded);
    });

    const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => dataset(), dialogs);
    const actions = computed(() => {
        const state = busy.value;
        const task = state?.taskId ? taskMonitor.getTask(dataset(), state.taskId) : null;
        if (!state || !offersAction(task, TaskAction.CANCEL)) return [];
        return [{
            label: busyCancelLabel(state), icon: 'fa-solid fa-stop', disabled: cancelling.value,
            run: () => cancelHeavyTask({ taskId: state.taskId, toolId: toolOfBusy(state.kind) }, busyTaskName(state))
        }];
    });

    return { busy, enter, actions };
}

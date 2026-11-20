// @ts-check
/**
 * useHeavyTaskCancel - the Cancel of the task a tool dialog started (Merge, Align, Extract, the training export):
 * the same question and the same answer as the Cancel of a task row (useTaskActions.cancel, FR-PRC-10, D-002):
 * the confirmation of libs/tasks/cancelConfirmation, a toast of what came of it, the shared task poller read again.
 * The poll of the dialog's run then sees the cancelled state and ends the run, so the dialog unlocks.
 *
 *   const dialogs = useDialogs();
 *   const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => props.dataset, dialogs);
 *   <HeavyTaskStatus :task="task" cancellable :cancelling="cancelling" label="Merge" @cancel="cancelHeavyTask($event, 'Merge multispectral')" />
 *   <DialogHost :dialogs="dialogs" />   (the question is shown by the host of the dialog)
 */
import { ref } from 'vue';
import { useConfirm } from '@/composables/useConfirm';
import { useTaskActions } from '@/composables/useTaskActions';
import taskMonitor from '@/libs/tasks/taskMonitor';

/**
 * @param {() => any} getDataset  the dataset of the dialog
 * @param {{ open: Function }} dialogs  from useDialogs(): the dialog's own registry
 */
export function useHeavyTaskCancel(getDataset, dialogs) {
    const actions = useTaskActions({
        datasetOf: () => getDataset(),
        deleteTask: async () => {},
        // The task poller reads the cancelled state at once, so the run of the dialog ends at its next poll
        refresh: async () => {
            try { await taskMonitor.forceRefresh(getDataset()); } catch { /* the poll of the run reads it at its next tick */ }
        },
        confirm: useConfirm(dialogs),
        toolTitle: task => task.toolName || task.toolId || 'Task'
    });
    const cancelling = ref(false);

    /**
     * Asks, then cancels the task of the dialog.
     * @param {{ taskId: string, toolId?: string | null } | null | undefined} task  a live entry of useHeavyTask
     * @param {string} [toolName]  the tool as the user sees it ("Merge multispectral")
     */
    async function cancelHeavyTask(task, toolName = '') {
        if (!task?.taskId || cancelling.value) return null;
        cancelling.value = true;
        try {
            return await actions.cancel({ ...task, toolName: toolName || undefined });
        } finally {
            cancelling.value = false;
        }
    }

    return { cancelHeavyTask, cancelling };
}

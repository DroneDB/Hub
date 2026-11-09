// @ts-check
/**
 * The question that asks before a task is cancelled, as useConfirm() options (or ConfirmDialog
 * props, see cancelDialogProps). It is a destructive confirmation (the focus starts on "Don't
 * Cancel"), like the delete ones of libs/deleteConfirmation.js (FR-UPL-05, D-004).
 *
 * A cancelled task of a tool that adds files to a dataset rolls back: the Registry deletes the files
 * that the task added, and the dataset that the task created (an import of a dataset always creates
 * one, photogrammetry only when asked to put its results in a new dataset). The question says so,
 * since the user cannot get them back. The Hub deletes nothing itself.
 *
 *   confirm(cancelConfirmation(task, toolTitle(task.toolId, tools)))
 */
import { escapeHtml } from '@/libs/sanitize';
import { IRREVERSIBLE } from '@/libs/deleteConfirmation';

/**
 * What a cancel deletes, by tool id (the Registry's tool ids): the tools that add files to a dataset
 * (FR-XC-26, FR-XC-27)
 */
const ROLLED_BACK = Object.freeze({
    'import-dataset': 'The files imported so far are deleted, and so is the dataset that this import created.',
    'import-file': 'The files imported so far are deleted.',
    'archive-extract': 'The files extracted so far are deleted.',
    'merge-multispectral': 'The output written so far is deleted.',
    'align-raster': 'The output written so far is deleted.',
    'photogrammetry': 'The output written so far is deleted, and so is the dataset, if this task created it.'
});

/**
 * What a cancel of the task deletes, in plain text, or '' when the task keeps what it did.
 * @param {{ toolId?: string }} task
 */
export function cancelRollbackNote(task) {
    return (task && task.toolId && Object.hasOwn(ROLLED_BACK, task.toolId) && ROLLED_BACK[task.toolId]) || '';
}

/**
 * The task is named by its tool and its target: the label the tool gives it (FR-PRC-22), else its path.
 * @param {{ toolId?: string, path?: string|null, targetLabel?: string|null }} task
 * @param {string} toolName  the title of the task's tool, as the user sees it
 * @returns {{ title: string, message: string, confirmText: string, cancelText: string, danger: true, warningTitle?: string, warningMessage?: string }}
 */
export function cancelConfirmation(task, toolName) {
    const target = task.targetLabel ? ` (${escapeHtml(task.targetLabel)})` : task.path ? ` (path: ${escapeHtml(task.path)})` : '';
    const what = `<strong>${escapeHtml(toolName)}</strong>${target}`;
    const rollback = cancelRollbackNote(task);
    return {
        title: 'Cancel Task',
        message: `Are you sure you want to cancel this task?<br/>${what} will be stopped.`,
        confirmText: 'Cancel Task',
        cancelText: "Don't Cancel",
        danger: true,
        ...(rollback ? { warningTitle: IRREVERSIBLE, warningMessage: rollback } : {})
    };
}

/**
 * The same question as ConfirmDialog props, for a dialog written in a template.
 * @param {Parameters<typeof cancelConfirmation>[0]} task
 * @param {string} toolName
 */
export function cancelDialogProps(task, toolName) {
    const { danger, ...props } = cancelConfirmation(task, toolName);
    return { ...props, confirmButtonClass: danger ? 'danger' : 'primary' };
}

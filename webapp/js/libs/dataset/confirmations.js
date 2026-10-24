// @ts-check
/**
 * The dataset page's yes/no questions (HQ-09: DeleteDialog, RescanConfirmDialog and
 * BuildConfirmDialog re-implemented ConfirmDialog), as useConfirm() options.
 */
import { escapeHtml } from '@/libs/sanitize';

/** @param {Array<{ label: string }>} files */
export const confirmDelete = files => ({
    title: 'Confirm delete',
    message: `Are you sure you want to delete ${files.length === 1 ? `"${escapeHtml(files[0].label)}"` : `${files.length} entries`}?`,
    confirmText: 'Remove',
    cancelText: 'Close',
    danger: true
});

export const CONFIRM_RESCAN = Object.freeze({
    title: 'Rescan Dataset',
    message: '<p><strong>Are you sure you want to rescan this dataset?</strong></p>'
        + '<p>This operation will re-process all indexed files to update their metadata (GPS coordinates, timestamps, thumbnails, etc.).</p>'
        + '<strong>Side effects:</strong><ul>'
        + '<li>Existing metadata will be overwritten with newly extracted values</li>'
        + '<li>All cached thumbnails, tiles and derived files will be deleted</li>'
        + '<li>The operation may take a long time for large datasets</li></ul>',
    confirmText: 'Rescan',
    danger: true
});

export const CONFIRM_REBUILD = Object.freeze({
    title: 'Rebuild File',
    message: '<p><strong>This file is already ready for visualization.</strong></p>'
        + '<p>There is no need to rebuild this file. If you proceed:</p><ul>'
        + '<li>The operation may take a long time to complete</li>'
        + '<li>The file will not be available for visualization until the build is finished</li>'
        + '<li>You can monitor progress in the <strong>Tasks</strong> tab</li></ul>',
    confirmText: 'Rebuild Anyway',
    danger: true
});

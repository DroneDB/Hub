// @ts-check
/**
 * The dataset page's yes/no questions, as useConfirm() options. A delete asks with
 * libs/deleteConfirmation.js; the files of the explorer are asked about by deleteFilesConfirmation.
 */
import ddb from 'ddb';
import { deleteConfirmation } from '@/libs/deleteConfirmation';
import { describeSelection, CALCULATING } from '@/libs/dataset/selection';
import { formatBytes } from '@/libs/format';

/**
 * The question of deleting explorer items (FR-EXP-08, D-011): it names the items, says that a
 * folder goes with everything inside it, and gives the total size. A selection with a folder has
 * its size read from the server (selectionSize): until then `size` is null and the question says
 * "Calculating size…"; it stays answerable meanwhile.
 * @param {Array<any>} files  explorer items
 * @param {{ size?: number | null, failed?: boolean }} [options]  the total size once read (null: not yet);
 *   `failed` when it could not be read
 */
export function deleteFilesConfirmation(files, { size = null, failed = false } = {}) {
    const selection = describeSelection(files);
    const isFolder = (/** @type {any} */ f) => !!f.entry && ddb.entry.isDirectory(f.entry);
    // Files have their sizes in the entries; a selection with a folder waits for the server
    const total = selection.hasFolder ? size : selection.size;
    const summary = failed ? 'The size could not be calculated.'
        : total === null ? CALCULATING : `Total size: ${formatBytes(total)}`;
    return deleteConfirmation({
        kind: files.length && isFolder(files[0]) ? 'folder' : 'file',
        items: files.map(f => ({ name: f.label, note: isFolder(f) ? 'and everything inside it' : '' })),
        summary
    });
}

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

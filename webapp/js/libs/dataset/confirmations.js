// @ts-check
/**
 * The dataset page's yes/no questions, as useConfirm() options. A delete asks with
 * libs/deleteConfirmation.js; the files of the explorer are asked about by deleteFilesConfirmation.
 */
import ddb from 'ddb';
import { deleteConfirmation } from '@/libs/deleteConfirmation';
import { describeSelection, CALCULATING } from '@/libs/dataset/selection';
import { formatBytes } from '@/libs/format';
import { escapeHtml } from '@/libs/sanitize';

/**
 * The question of deleting explorer items: it names the items, says that a
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

// What the two rescans say alike: the metadata is read again and replaces the one in the index
const REREAD_METADATA = 'update their metadata (GPS coordinates, timestamps, thumbnails, etc.)';
const METADATA_OVERWRITTEN = '<li>Existing metadata will be overwritten with newly extracted values</li>';
const MAY_TAKE_LONG = what => `<li>The operation may take a long time for ${what}</li>`;

export const CONFIRM_RESCAN = Object.freeze({
    title: 'Rescan Dataset',
    message: '<p><strong>Are you sure you want to rescan this dataset?</strong></p>'
        + `<p>This operation will re-process all indexed files to ${REREAD_METADATA}.</p>`
        + '<strong>Side effects:</strong><ul>'
        + METADATA_OVERWRITTEN
        + '<li>All cached thumbnails, tiles and derived files will be deleted</li>'
        + MAY_TAKE_LONG('large datasets') + '</ul>',
    confirmText: 'Rescan',
    danger: true
});

/**
 * The question of rescanning explorer items: the metadata of the files (and of everything inside a folder) is read
 * again, and what can be built (orthophotos, point clouds, models...) is built again. It runs as a task that does not
 * lock the dataset, so the question is a plain one, not a danger one.
 * @param {Array<any>} items  explorer items
 */
export function confirmRescanEntries(items) {
    const selection = describeSelection(items);
    const names = selection.names.map(name => `<li><strong>${escapeHtml(name)}</strong></li>`);
    if (selection.more) names.push(`<li>and ${selection.more} more</li>`);
    const inside = !selection.hasFolder ? ''
        : selection.folders === 1 ? ' and everything inside the folder' : ' and everything inside the folders';
    return {
        title: `Rescan ${selection.countText}`,
        message: `<p><strong>Rescan ${selection.countText}${inside}?</strong></p><ul>${names.join('')}</ul>`
            + `<p>This operation will re-process the files to ${REREAD_METADATA}, and rebuild the ones that can be built.</p>`
            + '<strong>Side effects:</strong><ul>'
            + METADATA_OVERWRITTEN
            + '<li>Their cached thumbnails, tiles and derived files will be rebuilt</li>'
            + MAY_TAKE_LONG('large files and folders')
            + '<li>You can monitor progress in the <strong>Tasks</strong> tab</li></ul>',
        confirmText: 'Rescan',
        danger: false
    };
}

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

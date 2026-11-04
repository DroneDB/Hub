// @ts-check
/**
 * Sending files to another dataset: a move (the transfer) removes them from this dataset, so the
 * server asks for write access on it; reading it is enough for a copy. A user who can only read
 * the dataset gets the copy, with texts that say so; a writer moves the files.
 *
 * @typedef {{
 *   keepSource: boolean, menuLabel: string, title: string, confirmLabel: string, confirmIcon: string,
 *   working: string, done: string, failed: string, summary: string, note: string
 * }} TransferMode
 *   `keepSource` is the server's parameter: true leaves the files in this dataset
 */

/** @type {Readonly<{ move: TransferMode, copy: TransferMode }>} */
export const TRANSFER_MODES = Object.freeze({
    move: Object.freeze({
        keepSource: false,
        menuLabel: 'Transfer',
        title: 'Transfer to Dataset',
        confirmLabel: 'Transfer',
        confirmIcon: 'fa-solid fa-right-left',
        working: 'Transferring',
        done: 'transferred',
        failed: 'Transfer failed',
        summary: 'Transfer Complete',
        note: 'The files move: they are removed from this dataset.'
    }),
    copy: Object.freeze({
        keepSource: true,
        menuLabel: 'Copy to another dataset...',
        title: 'Copy to Another Dataset',
        confirmLabel: 'Copy',
        confirmIcon: 'fa-solid fa-copy',
        working: 'Copying',
        done: 'copied',
        failed: 'Copy failed',
        summary: 'Copy Complete',
        note: 'You can only read this dataset, so the files are copied: they stay here too.'
    })
});

/**
 * The transfer a user gets from a dataset: a move when they can write it, else a copy.
 * @param {boolean} canWrite  the user can write the source dataset
 * @returns {TransferMode}
 */
export function transferModeFor(canWrite) {
    return canWrite ? TRANSFER_MODES.move : TRANSFER_MODES.copy;
}

/**
 * The mode of a transfer from the server's parameter.
 * @param {boolean} keepSource
 * @returns {TransferMode}
 */
export function transferModeOf(keepSource) {
    return keepSource ? TRANSFER_MODES.copy : TRANSFER_MODES.move;
}

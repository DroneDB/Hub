// @ts-check
/**
 * useConfirmReplace - the one question asked before the Hub replaces a file that exists (FR-XC-07):
 *
 *   const confirmReplace = useConfirmReplace(dialogs);
 *   if (await confirmReplace('images/IMG_0180_merged.tif')) send({ overwrite: true });
 *
 * The caller decides that the file exists (from the folder's listing, or from a 409 whose body has
 * `conflictPath`, see replaceConflictPath); this only asks. It is a danger confirmation: the focus
 * starts on Cancel and Enter does not confirm. A free name to offer instead comes from
 * libs/nameRules.js freeName.
 */
import ddb from 'ddb';
import { useConfirm } from '@/composables/useConfirm';
import { IRREVERSIBLE } from '@/libs/deleteConfirmation';
import { namesClash } from '@/libs/nameRules';
import { escapeHtml } from '@/libs/sanitize';

/**
 * The item of a listing (file browser items, `{ entry: { path, type } }`) at `path`, compared by the
 * rule of D-040 (letter case is ignored), or null when the listing does not have it.
 * @param {string} path @param {Array<{ entry?: { path?: string } }>|null|undefined} items
 */
export function existingItem(path, items) {
    return (items || []).find(item => namesClash(item?.entry?.path, path)) ?? null;
}

/**
 * The names of the listed items in `folder` ('' for the root, else with or without a trailing
 * '/'), for freeName.
 * @param {string} folder @param {Array<{ entry?: { path?: string } }>|null|undefined} items
 * @returns {string[]}
 */
export function namesInFolder(folder, items) {
    const prefix = folder && !folder.endsWith('/') ? `${folder}/` : folder || '';
    return (items || [])
        .map(item => item?.entry?.path)
        .filter(p => typeof p === 'string' && namesClash(p.substring(0, p.lastIndexOf('/') + 1), prefix))
        .map(p => /** @type {string} */ (p).substring(/** @type {string} */ (p).lastIndexOf('/') + 1));
}

/**
 * The text of the question, as useConfirm() options.
 * @param {string} path  the dataset path of the file (or its name alone)
 * @returns {{ title: string, message: string, confirmText: string, danger: true }}
 */
export function replaceConfirmation(path) {
    const clean = String(path ?? '').replace(/\/+$/, '');
    const slash = clean.lastIndexOf('/');
    const name = slash >= 0 ? clean.slice(slash + 1) : clean;
    const folder = slash >= 0 ? clean.slice(0, slash) : '';
    const where = folder ? `the folder <strong>${escapeHtml(folder)}</strong>` : 'this folder';
    return {
        title: `Replace “${name}”?`,
        message: `<p>A file named <strong>${escapeHtml(name)}</strong> already exists in ${where}. `
            + 'Replacing it overwrites its content.</p>'
            + `<p>${IRREVERSIBLE}</p>`,
        confirmText: 'Replace',
        danger: true
    };
}

/**
 * The path of the existing file when `error` is the Registry's refusal of an existing output
 * (409 with `conflictPath`, D-040); null for any other error.
 * @param {unknown} error
 * @returns {string|null}
 */
export function replaceConflictPath(error) {
    const e = /** @type {any} */ (error);
    return e && e.status === 409 && typeof e.conflictPath === 'string' && e.conflictPath ? e.conflictPath : null;
}

/**
 * Whether the entry a 409 names (`conflictPath`) is a folder, which no file replaces: the caller shows the
 * clash message instead of offering Replace. Read from the listing when it has the entry, else from the
 * listing of its parent folder (a failed read: false, the Registry still refuses a folder).
 * @param {{ list: (path?: string) => Promise<any[]> }} dataset
 * @param {string} path
 * @param {Array<{ entry?: { path?: string, type?: number } }>|null|undefined} [items]  the listing in view
 * @returns {Promise<boolean>}
 */
export async function conflictIsFolder(dataset, path, items) {
    const listed = existingItem(path, items);
    if (listed) return ddb.entry.isDirectory(listed.entry);
    try {
        const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
        const entries = await dataset.list(parent || undefined);
        const entry = (entries || []).find(e => namesClash(e?.path, path));
        return !!entry && ddb.entry.isDirectory(entry);
    } catch {
        return false;
    }
}

/**
 * @param {{ open: Function }} dialogs  from useDialogs()
 * @returns {(path: string) => Promise<boolean>}  true when the user chose Replace
 */
export function useConfirmReplace(dialogs) {
    const confirm = useConfirm(dialogs);
    return path => confirm(replaceConfirmation(path));
}

// @ts-check
/**
 * The summary of a selection of explorer items (FR-EXP-32): how many, how big, of what types, and
 * the first names. The one place that counts a selection, so the detail panel ("4 items selected
 * — 9.3 MB"), the properties window, the delete confirmation (FR-EXP-08) and the download
 * confirmation (FR-EXP-27) say the same numbers the same way.
 *
 * An item is an explorer item ({ path, label, entry }). A folder's entry has size 0, so `size`
 * is the size of the files of the selection; `hasFolder` says that the folders' contents are not
 * in it (folderContentSize reads them).
 */
import ddb from 'ddb';
import { countOf, formatBytes } from '@/libs/format';
import { getTypeDisplayName } from '@/libs/entryTypes';

/** Names listed by describeSelection before "and N more" */
export const LISTED_NAMES = 5;

/** What the summary shows for a size that has not been read yet */
export const CALCULATING = 'Calculating size…';

/** The folder searches selectionSize runs at the same time */
export const SEARCH_CONCURRENCY = 4;

/**
 * @typedef {object} SelectionSummary
 * @property {number} count         items selected
 * @property {number} files         items that are not folders
 * @property {number} folders       folders
 * @property {boolean} hasFolder
 * @property {number} size          bytes of the files (a folder counts 0: see folderContentSize)
 * @property {string} sizeText      `size` as every size is written
 * @property {string} countText     "4 items" ("1 item")
 * @property {string} summary       "4 items selected — 9.3 MB" ("1 item selected", "0 items selected" when none)
 * @property {Array<{ name: string, count: number }>} types   the type names, in order of appearance
 * @property {string} typesText     "Image (3), Folder (1)"
 * @property {string} typesSummary  "All of type Image" or "Multiple types" ('' when none)
 * @property {string[]} names       the first LISTED_NAMES names
 * @property {number} more          the names not listed
 */

/** @param {any} item */
const isFolder = item => !!item?.entry && ddb.entry.isDirectory(item.entry);

/** @param {any} item */
const nameOf = item => item?.label ?? item?.entry?.path ?? item?.path ?? '';

/**
 * @param {Array<any>} [items]  explorer items
 * @returns {SelectionSummary}
 */
export function describeSelection(items = []) {
    const list = (items || []).filter(Boolean);
    const folders = list.filter(isFolder).length;
    /** @type {Map<string, number>} */
    const byType = new Map();
    let size = 0;
    for (const item of list) {
        if (!item.entry) continue;
        const type = getTypeDisplayName(item.entry.type);
        byType.set(type, (byType.get(type) || 0) + 1);
        if (!isFolder(item) && typeof item.entry.size === 'number') size += item.entry.size;
    }
    const types = [...byType].map(([name, count]) => ({ name, count }));
    const sizeText = formatBytes(size);
    const countText = countOf(list.length, 'item');
    return {
        count: list.length,
        files: list.length - folders,
        folders,
        hasFolder: folders > 0,
        size,
        sizeText,
        countText,
        summary: list.length ? `${countText} selected — ${sizeText}` : '0 items selected',
        types,
        typesText: types.map(t => `${t.name} (${t.count})`).join(', '),
        typesSummary: !types.length ? '' : types.length > 1 ? 'Multiple types' : `All of type ${types[0].name}`,
        names: list.slice(0, LISTED_NAMES).map(nameOf),
        more: Math.max(0, list.length - LISTED_NAMES)
    };
}

/** The path a selected item has in the dataset. @param {any} item */
const pathOf = item => String(item?.entry?.path ?? '');

/** Whether `path` is `folder` or inside it. @param {string} path @param {string} folder */
const isInside = (path, folder) => path === folder || path.startsWith(`${folder}/`);

/**
 * The size in bytes of a selection with the content of its folders: the files selected one by
 * one, plus everything inside each selected folder (one recursive search of the folder,
 * `POST …/search` with `recursive`, at most SEARCH_CONCURRENCY at a time). A file inside a
 * selected folder, and a folder inside one, count once. Once `signal` is aborted, or a search
 * fails, no further search starts.
 * @param {{ search: (query: string, options?: { path?: string, recursive?: boolean, signal?: AbortSignal }) => Promise<Array<{ path: string, size?: number, type?: number }>> }} dataset
 * @param {Array<any>} items
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<number>}
 */
export async function selectionSize(dataset, items, { signal } = {}) {
    const list = (items || []).filter(Boolean);
    const topFolders = list.filter(isFolder).map(pathOf)
        .filter((path, i, all) => !all.some((other, j) => j !== i && other !== path && isInside(path, other)))
        .filter((path, i, all) => all.indexOf(path) === i);
    let total = 0;
    for (const item of list) {
        if (isFolder(item) || typeof item.entry?.size !== 'number') continue;
        if (!topFolders.some(folder => isInside(pathOf(item), folder))) total += item.entry.size;
    }
    // A few workers take the folders in turn, so a selection of many folders does not send all its searches at once
    let next = 0;
    let stopped = false;
    const worker = async () => {
        while (!stopped && next < topFolders.length) {
            signal?.throwIfAborted();
            const path = topFolders[next++];
            const entries = await dataset.search('*', { path, recursive: true, signal });
            for (const entry of entries || []) {
                if (entry && !ddb.entry.isDirectory(entry) && typeof entry.size === 'number') total += entry.size;
            }
        }
    };
    const workers = Array.from({ length: Math.min(SEARCH_CONCURRENCY, topFolders.length) }, worker);
    try {
        await Promise.all(workers);
    } finally {
        stopped = true;
    }
    return total;
}

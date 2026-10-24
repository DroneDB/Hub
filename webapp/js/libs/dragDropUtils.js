/**
 * Shared drag-and-drop utilities for file upload from the OS file explorer.
 * Used by Explorer.vue and TableView.vue to avoid code duplication.
 */

import { createLimiter } from '@/libs/concurrency';

// Browser file-system calls (entry.file(), readEntries()) in flight while walking a drop:
// one at a time costs a round trip per file; unbounded floods the browser
const TRAVERSAL_CONCURRENCY = 16;

/**
 * Read all entries from a directory reader recursively.
 * Chrome's readEntries() returns max 100 entries per call,
 * so we loop until we get an empty batch.
 * @param {FileSystemDirectoryReader} directoryReader
 * @param {{run: Function}} limiter
 * @returns {Promise<FileSystemEntry[]>}
 */
async function readDirectoryEntries(directoryReader, limiter) {
    const entries = [];
    let batch;
    do {
        batch = await limiter.run(() => new Promise((resolve, reject) => {
            directoryReader.readEntries(resolve, reject);
        }));
        entries.push(...batch);
    } while (batch.length > 0);
    return entries;
}

/**
 * Recursively traverse a FileSystemEntry and collect all files
 * with their relative paths preserved (for folder structure).
 * Siblings are walked in parallel through `limiter`; the result keeps the tree order
 * (a folder's files in reading order, depth first).
 * @param {FileSystemEntry} entry
 * @param {string} basePath
 * @param {{run: Function}} limiter
 * @returns {Promise<File[]>}
 */
async function traverseFileSystemEntry(entry, basePath, limiter) {
    if (entry.isFile) {
        const file = await limiter.run(() => new Promise((resolve, reject) => {
            entry.file(resolve, reject);
        }));
        // Set fullPath to preserve folder structure
        file.fullPath = basePath ? basePath + '/' + entry.name : entry.name;
        return [file];
    }

    if (entry.isDirectory) {
        const entries = await readDirectoryEntries(entry.createReader(), limiter);
        const newBasePath = basePath ? basePath + '/' + entry.name : entry.name;
        const children = await Promise.all(
            entries.map(childEntry => traverseFileSystemEntry(childEntry, newBasePath, limiter)));
        return children.flat();
    }

    return [];
}

/**
 * Extract files from a drag-and-drop event, supporting both
 * individual files and folders via webkitGetAsEntry.
 *
 * IMPORTANT: DataTransferItemList becomes invalid after async operations,
 * so webkitGetAsEntry() and getAsFile() are called synchronously first.
 *
 * @param {DragEvent} ev
 * @returns {Promise<File[]>}
 */
export async function getFilesFromDrop(ev) {
    const files = [];
    const entries = [];

    if (ev.dataTransfer.items) {
        // Collect all entries and files synchronously first.
        // DataTransferItemList becomes invalid after async operations,
        // so we must call webkitGetAsEntry() and getAsFile() before any await.
        for (const item of Array.from(ev.dataTransfer.items)) {
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry?.();
                if (entry) {
                    entries.push(entry);
                } else {
                    // Fallback to getAsFile for browsers without webkitGetAsEntry
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
        }

        // Walk every dropped entry in parallel, with a bounded number of browser calls in flight
        const limiter = createLimiter(TRAVERSAL_CONCURRENCY);
        const results = await Promise.all(
            entries.map(entry => traverseFileSystemEntry(entry, '', limiter))
        );
        files.push(...results.flat());
    } else if (ev.dataTransfer.files) {
        files.push(...Array.from(ev.dataTransfer.files));
    }

    return files;
}

/**
 * Check if a drop event comes from an internal drag (file move within the app)
 * rather than an external drag from the OS file explorer.
 * @param {DragEvent} evt
 * @returns {boolean}
 */
export function isInternalDrag(evt) {
    try {
        const data = evt.dataTransfer.getData('item');
        return data && data.length > 0;
    } catch {
        return false;
    }
}

import { clone } from '@/libs/utils';
import ddb from 'ddb';
const { entry: ddbEntry } = ddb;

/**
 * Build a synthetic directory entry representing a destination folder
 * (used when the user drops on the empty area of a view, so the move target
 * is the currently displayed folder).
 *
 * @param {string|null} currentPath
 * @returns {{entry: {path: string, type: number}}}
 */
export function syntheticFolderItem(currentPath) {
    if (!currentPath) {
        return { entry: { path: '', type: ddbEntry.type.DRONEDB } };
    }
    return { entry: { path: currentPath, type: ddbEntry.type.DIRECTORY } };
}

/**
 * Ask the dataset page to move items for an internal drag-drop (through the `datasetDrop` the page provides, not the global event bus).
 *
 * Multi-selection is supported: every currently-selected file in `extraSourceItems`
 * is also moved (deduplicated against the primary source).
 *
 * @param {{ move: (source: object, dest: object) => void }|null} datasetDrop - injected from the dataset page
 * @param {object} sourceItem - dragged item (file/node from the file browser)
 * @param {object} destItem - destination item (folder or any file; the handler
 *                            will use the parent folder if it is not a directory)
 * @param {object[]} [extraSourceItems=[]] - additional items selected at the
 *                            time of drop (multi-selection drag).
 */
export function requestMove(datasetDrop, sourceItem, destItem, extraSourceItems = []) {
    if (!datasetDrop) return;
    datasetDrop.move(sourceItem, destItem);
    for (const sel of extraSourceItems) {
        if (sel.entry.path === sourceItem.entry.path) continue;
        datasetDrop.move(sel, destItem);
    }
}

/**
 * Returns true when the string looks like an absolute http or https URL.
 * @param {string} text
 * @returns {boolean}
 */
export function isHttpUrl(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    return t.startsWith('http://') || t.startsWith('https://');
}

/**
 * Extracts File objects from a ClipboardEvent (OS paste).
 *
 * Only individual files are supported: the Clipboard API does not expose
 * directory entries (no webkitGetAsEntry on clipboard items), so folder
 * pasting is not possible and is silently skipped.
 *
 * Browser support note: Chromium fully supports file items in clipboardData.
 * Firefox (as of 2026) does not expose File items on paste events in most
 * configurations; in those cases an empty array is returned.
 *
 * @param {ClipboardEvent} e
 * @returns {File[]}
 */
export function getFilesFromClipboard(e) {
    const files = [];
    const cd = e.clipboardData;
    if (!cd) return files;

    // Prefer items (gives kind/type metadata) over the files shortcut.
    if (cd.items && cd.items.length) {
        for (const item of Array.from(cd.items)) {
            if (item.kind === 'file') {
                const f = item.getAsFile();
                if (f) files.push(f);
            }
        }
        return files;
    }

    // Fallback: FileList shortcut (older APIs).
    if (cd.files && cd.files.length) {
        files.push(...Array.from(cd.files));
    }
    return files;
}

/**
 * Common dragstart handler: serializes the dragged item on dataTransfer so
 * that any drop target in the app can read it back.
 */
export function startInternalDrag(evt, item) {
    evt.dataTransfer.dropEffect = 'move';
    evt.dataTransfer.effectAllowed = 'move';
    evt.dataTransfer.setData('item', JSON.stringify(clone(item)));
}

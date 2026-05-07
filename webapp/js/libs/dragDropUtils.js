/**
 * Shared drag-and-drop utilities for file upload from the OS file explorer.
 * Used by Explorer.vue and TableView.vue to avoid code duplication.
 */

/**
 * Read all entries from a directory reader recursively.
 * Chrome's readEntries() returns max 100 entries per call,
 * so we loop until we get an empty batch.
 * @param {FileSystemDirectoryReader} directoryReader
 * @returns {Promise<FileSystemEntry[]>}
 */
async function readDirectoryEntries(directoryReader) {
    const entries = [];
    let batch;
    do {
        batch = await new Promise((resolve, reject) => {
            directoryReader.readEntries(resolve, reject);
        });
        entries.push(...batch);
    } while (batch.length > 0);
    return entries;
}

/**
 * Recursively traverse a FileSystemEntry and collect all files
 * with their relative paths preserved (for folder structure).
 * @param {FileSystemEntry} entry
 * @param {string} basePath
 * @returns {Promise<File[]>}
 */
async function traverseFileSystemEntry(entry, basePath = '') {
    const files = [];

    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject);
        });
        // Set fullPath to preserve folder structure
        const relativePath = basePath ? basePath + '/' + entry.name : entry.name;
        file.fullPath = relativePath;
        files.push(file);
    } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await readDirectoryEntries(dirReader);
        const newBasePath = basePath ? basePath + '/' + entry.name : entry.name;

        for (const childEntry of entries) {
            const childFiles = await traverseFileSystemEntry(childEntry, newBasePath);
            files.push(...childFiles);
        }
    }

    return files;
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

        // Process all entries in parallel
        const results = await Promise.all(
            entries.map(entry => traverseFileSystemEntry(entry))
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

import emitter from '@/libs/eventBus';
import { clone } from '@/libs/utils';
import ddb from 'ddb';
const { entry: ddbEntry, pathutils } = ddb;

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
 * Emit a `moveItem` event on the global event bus for an internal drag-drop.
 *
 * Centralized here to keep a single source of truth for source/destination
 * resolution. Multi-selection is supported: every currently-selected file in
 * `extraSourceItems` is also moved (deduplicated against the primary source).
 *
 * @param {object} sourceItem - dragged item (file/node from the file browser)
 * @param {object} destItem - destination item (folder or any file; the handler
 *                            will use the parent folder if it is not a directory)
 * @param {object[]} [extraSourceItems=[]] - additional items selected at the
 *                            time of drop (multi-selection drag).
 */
export function emitMove(sourceItem, destItem, extraSourceItems = []) {
    emitter.emit('moveItem', sourceItem, destItem);
    for (const sel of extraSourceItems) {
        if (sel.entry.path === sourceItem.entry.path) continue;
        emitter.emit('moveItem', sel, destItem);
    }
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

/**
 * Mixin providing drag-and-drop support for file browser components.
 *
 * Responsibilities:
 *  - dragenter/dragleave counter to prevent flickering of the `dropping` flag
 *  - OS file upload drop handler (delegates to the upload pipeline)
 *  - internal drop handler: resolves source/destination and emits `moveItem`
 *    on the global event bus (a single rich handler in ViewDataset processes
 *    every move regardless of which view fired it -> DRY/SRP).
 *
 * Components using this mixin must have:
 *  - `dropping` in data
 *  - `canWrite` prop
 *  - `currentPath` prop
 *  - (optional) a `selectedFiles` computed for multi-selection drag.
 */
export const dragDropMixin = {
    data() {
        return {
            dragEnterCount: 0
        };
    },
    methods: {
        explorerDragEnter(evt) {
            this.dragEnterCount++;
            this.dropping = true;
        },

        explorerDragLeave(evt) {
            this.dragEnterCount--;
            if (this.dragEnterCount <= 0) {
                this.dragEnterCount = 0;
                this.dropping = false;
            }
        },

        /**
         * Standard handler for dragstart on a file/folder item.
         * Use as `@dragstart="startDrag($event, file)"`.
         */
        startDrag(evt, item) {
            startInternalDrag(evt, item);
        },

        /**
         * Standard handler for drop on a specific file/folder item.
         * Use as `@drop="onDrop($event, file)"`.
         *
         * - If the drop comes from the OS, delegates to the OS upload handler.
         * - Otherwise emits `moveItem` for the dragged item (and every other
         *   currently-selected item in the same view) targeting `destItem`.
         *   The rich handler (ViewDataset.handleMoveItem) decides whether to
         *   move into `destItem` itself (when it's a folder) or into its
         *   parent folder (when it's a file).
         */
        onDrop(evt, destItem) {
            this.dropping = false;
            this.dragEnterCount = 0;

            if (!isInternalDrag(evt)) {
                // OS drop -> upload pipeline
                this.explorerDropHandler(evt);
                return;
            }

            evt.stopPropagation();

            if (!this.canWrite) return;

            let sourceItem;
            try {
                sourceItem = JSON.parse(evt.dataTransfer.getData('item'));
            } catch {
                return;
            }
            if (!sourceItem || !sourceItem.entry) return;

            const extras = Array.isArray(this.selectedFiles) ? this.selectedFiles : [];
            emitMove(sourceItem, destItem, extras);
        },

        /**
         * Drop handler bound to the empty area of the view (background drop).
         * - Internal drag -> move into the currently displayed folder.
         * - OS drag       -> upload into the currently displayed folder.
         */
        async explorerDropHandler(ev) {
            // Internal drag dropped on the background = move to currentPath.
            if (isInternalDrag(ev)) {
                ev.preventDefault();
                this.dragEnterCount = 0;
                this.dropping = false;

                if (!this.canWrite) return;

                let sourceItem;
                try {
                    sourceItem = JSON.parse(ev.dataTransfer.getData('item'));
                } catch {
                    return;
                }
                if (!sourceItem || !sourceItem.entry) return;

                const destItem = syntheticFolderItem(this.currentPath);
                const extras = Array.isArray(this.selectedFiles) ? this.selectedFiles : [];
                emitMove(sourceItem, destItem, extras);
                return;
            }

            ev.preventDefault();
            this.dragEnterCount = 0;
            this.dropping = false;

            if (!this.canWrite) return;

            const files = await getFilesFromDrop(ev);
            if (files.length === 0) return;

            emitter.emit('uploadItems', { files: files, path: this.currentPath });
        }
    }
};

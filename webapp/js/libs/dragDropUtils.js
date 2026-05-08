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
    // mitt only forwards a single payload, so wrap source/dest in an object.
    emitter.emit('moveItem', { source: sourceItem, dest: destItem });
    for (const sel of extraSourceItems) {
        if (sel.entry.path === sourceItem.entry.path) continue;
        emitter.emit('moveItem', { source: sel, dest: destItem });
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
 * Per-item drag-and-drop mixin.
 *
 * Provides the handlers attached to each individual file/folder element in a
 * file browser view (Explorer thumbnails, TreeNode entries, future TableView
 * rows). Centralizes:
 *  - dragstart serialization on `dataTransfer`
 *  - drop-target highlight (via `dropTargetPath` + a per-target enter counter
 *    to avoid flicker when the pointer crosses internal child elements)
 *  - drop dispatch: OS file drops are forwarded to `explorerDropHandler` (if
 *    the host component provides one), internal drags emit a `moveItem` event.
 *
 * The host component is expected to expose:
 *  - `canWrite` (prop or computed)
 *  - optionally `selectedFiles` (computed array, for multi-selection drag)
 *  - optionally `explorerDropHandler` (for OS-file uploads on per-item drop)
 */
export const itemDnDMixin = {
    data() {
        return {
            // Path of the item currently hovered as a drop target during an
            // internal drag. Bound to `:class="{ 'drop-target': dropTargetPath === f.entry.path }"`.
            dropTargetPath: null,
            // Per-target enter counter (keyed by entry path) used to avoid
            // flicker when the pointer transitions to a nested child element
            // (which fires a synthetic dragleave on the parent).
            _dropEnterCounts: Object.create(null)
        };
    },
    methods: {
        /**
         * Standard handler for dragstart on a file/folder item.
         * Use as `@dragstart="startDrag($event, file)"`.
         */
        startDrag(evt, item) {
            if (!this.canWrite) { evt.preventDefault(); return; }
            startInternalDrag(evt, item);
        },

        /**
         * Per-item dragenter on a potential drop target. Always accepts the
         * drop for internal drags (so the browser fires `drop`), but only
         * highlights the target when it's a folder. Dropping on a file means
         * "move into the file's parent folder" (handled in `handleMoveItem`).
         * Use as `@dragenter="itemDragEnter($event, file)"`.
         */
        itemDragEnter(evt, item) {
            if (!this.canWrite) return;
            if (!isInternalDrag(evt)) return;
            if (!item || !item.entry) return;
            evt.preventDefault();
            evt.stopPropagation();
            if (!ddbEntry.isDirectory(item.entry)) return;
            const key = item.entry.path;
            this._dropEnterCounts[key] = (this._dropEnterCounts[key] || 0) + 1;
            this.dropTargetPath = key;
        },

        /**
         * Per-item dragover. Required for the browser to accept the drop.
         */
        itemDragOver(evt, item) {
            if (!this.canWrite) return;
            if (!isInternalDrag(evt)) return;
            if (!item || !item.entry) return;
            evt.preventDefault();
            evt.stopPropagation();
            if (!ddbEntry.isDirectory(item.entry)) return;
            if (this.dropTargetPath !== item.entry.path) {
                this.dropTargetPath = item.entry.path;
            }
        },

        /**
         * Per-item dragleave: clear the highlight only when the pointer truly
         * leaves the target (counter reaches zero). Crossing into a nested
         * child element fires a synthetic dragleave that we must ignore.
         */
        itemDragLeave(evt, item) {
            if (!item || !item.entry) return;
            const key = item.entry.path;
            if (this._dropEnterCounts[key]) {
                this._dropEnterCounts[key]--;
                if (this._dropEnterCounts[key] > 0) return;
                delete this._dropEnterCounts[key];
            }
            if (this.dropTargetPath === key) {
                this.dropTargetPath = null;
            }
        },

        /**
         * Standard handler for drop on a specific file/folder item.
         * Use as `@drop="onDrop($event, file)"`.
         *
         * - If the drop comes from the OS, delegates to the OS upload handler
         *   (when the host exposes one).
         * - Otherwise emits `moveItem` for the dragged item (and every other
         *   currently-selected item in the same view) targeting `destItem`.
         */
        onDrop(evt, destItem) {
            this.dropTargetPath = null;
            this._dropEnterCounts = Object.create(null);
            // Container-level state owned by dragDropMixin: reset defensively
            // so the `dropping` overlay doesn't stay stuck after a per-item drop.
            if ('dragEnterCount' in this) this.dragEnterCount = 0;
            if ('dropping' in this) this.dropping = false;

            if (!isInternalDrag(evt)) {
                if (typeof this.explorerDropHandler === 'function') {
                    this.explorerDropHandler(evt);
                }
                return;
            }

            // Mark the event as handled so a parent container with
            // `explorerDropHandler` (e.g. TreeView around TreeNodes) doesn't
            // double-process the drop, but still resets its own `dropping`
            // overlay state via the bubbled @drop listener.
            evt._ddbHandled = true;

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
        }
    }
};

/**
 * Mixin providing drag-and-drop support for file browser components.
 *
 * Composes `itemDnDMixin` (per-item handlers) with the container-level
 * handlers (background drop area + dropping flag + OS upload pipeline).
 *
 * Components using this mixin must have:
 *  - `dropping` in data
 *  - `canWrite` prop
 *  - `currentPath` prop
 *  - (optional) a `selectedFiles` computed for multi-selection drag.
 */
export const dragDropMixin = {
    mixins: [itemDnDMixin],
    data() {
        return {
            dragEnterCount: 0
        };
    },
    methods: {
        explorerDragEnter(evt) {
            if (!this.canWrite) return;
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
         * Drop handler bound to the empty area of the view (background drop).
         * - Internal drag -> move into the currently displayed folder.
         * - OS drag       -> upload into the currently displayed folder.
         */
        async explorerDropHandler(ev) {
            // Always reset container drop overlay state on any drop bubbled
            // up from a child target (per-item TreeNode/Thumbnail/row).
            this.dragEnterCount = 0;
            this.dropping = false;

            // Drop already fully handled by a per-item target inside this
            // container -> just reset the overlay (already done above) and
            // bail out so we don't fire a duplicate `moveItem`.
            if (ev._ddbHandled) return;

            // Internal drag dropped on the background = move to currentPath.
            if (isInternalDrag(ev)) {
                ev.preventDefault();
                this.dropTargetPath = null;
                this._dropEnterCounts = Object.create(null);

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
            this.dropTargetPath = null;
            this._dropEnterCounts = Object.create(null);

            if (!this.canWrite) return;

            const files = await getFilesFromDrop(ev);
            if (files.length === 0) return;

            emitter.emit('uploadItems', { files: files, path: this.currentPath });
        }
    }
};

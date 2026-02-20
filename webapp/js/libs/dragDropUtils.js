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

/**
 * Mixin providing drag-and-drop upload support for file browser components.
 * Handles dragenter/dragleave with a counter to prevent flickering,
 * the drop handler for OS file uploads, and delegates internal drags properly.
 *
 * Components using this mixin must have:
 * - `dropping` in data
 * - `canWrite` prop
 * - `currentPath` prop
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

        async explorerDropHandler(ev) {
            ev.preventDefault();

            this.dragEnterCount = 0;
            this.dropping = false;

            // Check if user has write permission
            if (!this.canWrite) return;

            const files = await getFilesFromDrop(ev);
            if (files.length === 0) return;

            this.$root.$emit('uploadItems', { files: files, path: this.currentPath });
        }
    }
};

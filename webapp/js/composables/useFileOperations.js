/**
 * File Operations Mixin
 * Manages file operations like rename, delete, create folder, etc.
 */
import { clone } from '@/libs/utils';
import icons from '@/libs/icons';
import BuildManager from '@/libs/build/buildManager';
import ddb from 'ddb';
import emitter from '@/libs/eventBus';
import clipboard from '@/composables/useClipboard';
import { resolvePasteStrategy } from '@/composables/usePasteStrategy';
import reg from '@/libs/api/sharedRegistry';
const { pathutils } = ddb;

export default {
    data() {
        return {
            isBusy: false,
            // Paste flow state (set lazily by clipboardPaste)
            pasteConflictDialogOpen: false,
            pasteConflictData: null,
            pasteResultDialogOpen: false,
            pasteResultData: null
        };
    },

    methods: {
        sortFiles() {
            console.log("ViewDataset.sortFiles");
            this.fileBrowserFiles = this.fileBrowserFiles.sort((n1, n2) => {
                var a = n1.entry;
                var b = n2.entry;

                // Folders first
                let aDir = ddb.entry.isDirectory(a);
                let bDir = ddb.entry.isDirectory(b);

                if (aDir && !bDir) return -1;
                else if (!aDir && bDir) return 1;
                else {
                    // then filename ascending
                    return pathutils.basename(a.path.toLowerCase()) > pathutils.basename(b.path.toLowerCase()) ? 1 : -1
                }
            });
        },

        async deleteSelectedFiles() {
            this.isBusy = true;

            try {
                const paths = this.contextMenuFiles.map(file => file.entry.path);

                // Use batch delete endpoint
                const response = await this.dataset.deleteObjs(paths);

                // Update file browser with successfully deleted paths
                if (response.deleted && response.deleted.length > 0) {
                    this.fileBrowserFiles = this.fileBrowserFiles.filter(
                        item => !response.deleted.includes(item.entry.path)
                    );
                    emitter.emit('deleteEntries', response.deleted);
                    this.$toast.add({ severity: 'success', summary: 'Deleted', detail: `${response.deleted.length} file${response.deleted.length > 1 ? 's' : ''} deleted successfully`, life: 3000 });
                }

                // Show result dialog only if there are failures
                if (response.failed && Object.keys(response.failed).length > 0) {
                    this.showDeleteResults({
                        deleted: response.deleted || [],
                        failed: response.failed
                    });
                }

            } catch (e) {
                this.showError(e, "Delete");
            }

            this.isBusy = false;
        },

        /**
         * Rename or move a file/folder.
         *
         * @param {object} file - the source item (with `.entry`)
         * @param {string} newPath - the destination full path
         * @param {object} [options]
         * @param {'rename'|'move'} [options.action='rename'] - controls the
         *        result toast and whether the build pipeline is re-triggered.
         *        DroneDB indexes builds by file hash, so a pure move never
         *        changes buildability and must NOT trigger build callbacks.
         */
        async renameFile(file, newPath, options = {}) {
            const action = options.action === 'move' ? 'move' : 'rename';
            try {
                var oldPath = file.entry.path;
                var updatedEntry = await this.dataset.moveObj(oldPath, newPath);

                // Remove both the new file path and the old one because it could be a replace
                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => item.entry.path != oldPath && item.entry.path != newPath);

                var newItem = clone(file);
                newItem.path = this.dataset.remoteUri(newPath);
                newItem.label = pathutils.basename(newPath);

                // Use server-returned entry (includes updated type after extension change)
                if (updatedEntry && typeof updatedEntry === 'object') {
                    newItem.entry = updatedEntry;
                } else {
                    newItem.entry.path = newPath;
                }

                // Add it to our explorer (we are in the same folder)
                if (pathutils.getParentFolder(newPath) == (this.currentPath || null)) {
                    this.fileBrowserFiles.push(newItem);
                }

                // Tell filebrowser to remove the file in the old location and add to the new location
                emitter.emit('deleteEntries', [oldPath]);
                emitter.emit('addItems', [newItem]);

                this.sortFiles();

                // Only re-trigger build pipeline on rename (extension may have changed,
                // making the file buildable). On move the hash is unchanged, so any
                // existing build artifacts still apply and no notification is needed.
                if (action === 'rename' && BuildManager.isBuildableType(newItem.entry.type)) {
                    BuildManager.onFilesAdded(this.dataset, [newItem.entry]);
                }

                if (action === 'move') {
                    this.$toast.add({ severity: 'success', summary: 'Moved', detail: `File moved successfully`, life: 3000 });
                } else {
                    this.$toast.add({ severity: 'success', summary: 'Renamed', detail: `File renamed successfully`, life: 3000 });
                }

            } catch (e) {
                this.showError(e, action === 'move' ? "Move file" : "Rename file");
            }
        },

        async renameSelectedFile(newPath) {
            var source;

            if (this.selectedUsingFileBrowserList) {
                if (this.fileBrowserFiles.length == 0) return;
                source = this.fileBrowserFiles[0];
            } else {
                if (this.selectedFiles.length == 0) return;
                source = this.selectedFiles[0];
            }

            this.isBusy = true;

            await this.renameFile(source, newPath);

            this.isBusy = false;
        },

        async createFolder(newPath) {
            this.isBusy = true;

            newPath = this.currentPath ? this.currentPath + "/" + newPath : newPath;

            try {
                var entry = await this.dataset.createFolder(newPath);

                const base = pathutils.basename(entry.path);

                var remoteUri = this.dataset.remoteUri(this.currentPath != null ? pathutils.join(this.currentPath, base) : base);

                console.log("Remote uri", remoteUri);

                var folderItem = {
                    icon: icons.getForType(entry.type, entry.path),
                    label: base,
                    path: remoteUri,
                    selected: false,
                    entry,
                    empty: true,
                    isExpandable: ddb.entry.isDirectory(entry)
                };

                this.fileBrowserFiles.push(folderItem);

                this.sortFiles();

                // Tell filebrowser to add items
                emitter.emit('addItems', [folderItem]);

            } catch (e) {
                this.showError(e, "Create folder");
            }

            this.isBusy = false;
        },

        /**
         * Rich move handler shared by every drag-and-drop view (Explorer, TableView,
         * TreeNode) and by the future Copy/Cut/Paste operations.
         *
         * Resolves the destination path applying "folder magic":
         *  - if `destItem` is a directory   -> move inside it
         *  - if `destItem` is the root (DRONEDB) -> move to root
         *  - if `destItem` is a file        -> move into its parent folder
         *
         * Validates obvious no-ops (move onto self, descendant) and toggles
         * `isBusy` so that the global `<Loader>` reflects the operation.
         */
        async handleMoveItem(sourceItem, destItem) {
            if (!sourceItem || !sourceItem.entry || !destItem || !destItem.entry) return;

            if (sourceItem.entry.type === ddb.entry.type.DRONEDB) {
                this.$toast.add({ severity: 'warn', summary: 'Move', detail: 'Cannot move dataset root', life: 3000 });
                return;
            }

            const sourceItemName = pathutils.basename(sourceItem.entry.path);
            let destPath = "";

            if (ddb.entry.isDirectory(destItem.entry)) {
                destPath = destItem.entry.type === ddb.entry.type.DRONEDB
                    ? sourceItemName
                    : pathutils.join(destItem.entry.path, sourceItemName);
            } else {
                const destParentFolder = pathutils.getParentFolder(destItem.entry.path);
                destPath = destParentFolder == null
                    ? sourceItemName
                    : pathutils.join(destParentFolder, sourceItemName);
            }

            if (destPath === sourceItem.entry.path) {
                this.$toast.add({
                    severity: 'info',
                    summary: 'Move',
                    detail: 'Item is already in this folder',
                    life: 2500
                });
                return;
            }

            // Block move into self or descendant for directories
            if (ddb.entry.isDirectory(sourceItem.entry)
                && (destPath + '/').startsWith(sourceItem.entry.path + '/')) {
                this.$toast.add({
                    severity: 'warn',
                    summary: 'Move',
                    detail: 'Cannot move a folder onto itself or one of its descendants',
                    life: 3500
                });
                return;
            }

            this.isBusy = true;
            try {
                await this.renameFile(sourceItem, destPath, { action: 'move' });
            } finally {
                this.isBusy = false;
            }
        },

        handleAddMarkdown(document, entry) {
            this.handleAddClose([entry]);
            this.handleOpenItem({
                label: document,
                entry,
                path: this.dataset.remoteUri(document)
            });
            this.showSettings = false;
        },

        // ────────────────────────────────────────────────────────────────────
        // Copy / Cut / Paste — clipboard flow
        // (See DroneDB-Roadmap/CopyPaste/README.md.)
        //
        // Source views call `clipboardCopySelected` / `clipboardCutSelected`
        // (typically wired to Ctrl+C / Ctrl+X / context menu).
        // The paste flow lives in `clipboardPaste`, opens a conflict dialog
        // when needed, and emits a result toast/dialog summary.
        // ────────────────────────────────────────────────────────────────────

        _selectedItemsForClipboard() {
            // Prefer multi-selection in the explorer; fall back to context menu files
            // for right-click on a single non-selected item.
            if (this.selectedFiles && this.selectedFiles.length > 0) return this.selectedFiles;
            if (this.contextMenuFiles && this.contextMenuFiles.length > 0) return this.contextMenuFiles;
            return [];
        },

        clipboardCopySelected() {
            const items = this._selectedItemsForClipboard()
                .filter(f => f.entry && f.entry.type !== ddb.entry.type.DRONEDB);
            if (items.length === 0) {
                this.$toast.add({ severity: 'info', summary: 'Copy', detail: 'No items selected', life: 2000 });
                return;
            }
            clipboard.copy({
                orgSlug: this.dataset.org,
                dsSlug: this.dataset.ds,
                basePath: this.currentPath || ''
            }, items);
            this.$toast.add({ severity: 'success', summary: 'Copied', detail: `${items.length} item${items.length > 1 ? 's' : ''} copied to clipboard`, life: 2000 });
        },

        clipboardCutSelected() {
            if (!this.canWrite) {
                this.$toast.add({ severity: 'warn', summary: 'Cut', detail: 'You do not have write access to this dataset', life: 3000 });
                return;
            }
            const items = this._selectedItemsForClipboard()
                .filter(f => f.entry && f.entry.type !== ddb.entry.type.DRONEDB);
            if (items.length === 0) {
                this.$toast.add({ severity: 'info', summary: 'Cut', detail: 'No items selected', life: 2000 });
                return;
            }
            clipboard.cut({
                orgSlug: this.dataset.org,
                dsSlug: this.dataset.ds,
                basePath: this.currentPath || ''
            }, items);
            this.$toast.add({ severity: 'success', summary: 'Cut', detail: `${items.length} item${items.length > 1 ? 's' : ''} ready to move`, life: 2000 });
        },

        clipboardClear() {
            clipboard.clear();
        },

        async _resolveSourceDataset() {
            // Source dataset object: same as `this.dataset` if intra, else build a
            // remote dataset wrapper for the source org/ds (server-side transfer).
            if (clipboard.state.source.orgSlug === this.dataset.org
                && clipboard.state.source.dsSlug === this.dataset.ds) {
                return this.dataset;
            }
            const org = reg.Organization(clipboard.state.source.orgSlug);
            return org.Dataset(clipboard.state.source.dsSlug);
        },

        async clipboardPaste() {
            if (clipboard.isEmpty.value) return;
            if (!this.canWrite) {
                this.$toast.add({ severity: 'warn', summary: 'Paste', detail: 'You do not have write access to this dataset', life: 3000 });
                return;
            }

            const mode = clipboard.state.mode;
            const items = clipboard.state.items.slice();
            const source = clipboard.state.source;
            const target = {
                orgSlug: this.dataset.org,
                dsSlug: this.dataset.ds,
                basePath: this.currentPath || '',
                dataset: this.dataset
            };

            // Block obvious no-ops (paste in same folder)
            if (source && source.orgSlug === target.orgSlug
                && source.dsSlug === target.dsSlug
                && (source.basePath || '') === (target.basePath || '')) {
                this.$toast.add({
                    severity: 'info',
                    summary: 'Paste',
                    detail: mode === 'cut'
                        ? 'Cannot move into the same folder'
                        : 'Cannot copy into the same folder',
                    life: 3000
                });
                return;
            }

            let strategy;
            try {
                strategy = resolvePasteStrategy(source, mode, target);
            } catch (e) {
                this.showError(e, 'Paste');
                return;
            }

            // Detect conflicts: same-name entry already in target folder.
            const existingNames = new Set(this.fileBrowserFiles.map(f => pathutils.basename(f.entry.path)));
            const conflicts = items.filter(it => existingNames.has(pathutils.basename(it.path)));

            let conflictMode = 'overwrite';
            if (conflicts.length > 0) {
                conflictMode = await this._askPasteConflict(conflicts);
                if (conflictMode === 'cancel') return;
            }

            const sourceDataset = await this._resolveSourceDataset();
            const sourceCtx = { ...source, dataset: sourceDataset };

            this.isBusy = true;
            let result;
            try {
                result = await strategy.execute(items, sourceCtx, target, { conflictMode });
            } catch (e) {
                this.isBusy = false;
                this.showError(e, 'Paste');
                return;
            }
            this.isBusy = false;

            // For cut → move: remove source entries from local view.
            if (mode === 'cut'
                && source.orgSlug === target.orgSlug
                && source.dsSlug === target.dsSlug
                && result.succeeded.length > 0) {
                const movedSources = new Set(result.succeeded.map(s => s.source));
                this.fileBrowserFiles = this.fileBrowserFiles.filter(f => !movedSources.has(f.entry.path));
                emitter.emit('deleteEntries', Array.from(movedSources));
            }

            // Inject newly created destination entries into the current folder view
            // and into the treeview (FileBrowser/TreeNode).
            // Build minimal fileBrowser items from the original clipboard entries
            // (we know type + path; full metadata will be picked up on next navigation).
            if (result.succeeded.length > 0) {
                const itemByPath = new Map(items.map(it => [it.path, it]));
                const allNewItems = result.succeeded.map(s => {
                    const original = itemByPath.get(s.source);
                    const type = original ? original.type : ddb.entry.type.GENERIC;
                    const entry = { path: s.dest, type, size: original ? original.size : 0 };
                    return {
                        icon: icons.getForType(type, s.dest),
                        label: pathutils.basename(s.dest),
                        path: this.dataset.remoteUri(s.dest),
                        selected: false,
                        entry,
                        empty: ddb.entry.isDirectory(entry),
                        isExpandable: ddb.entry.isDirectory(entry)
                    };
                });

                // Items that land in the currently viewed folder: update content view
                const currentFolderItems = allNewItems.filter(it =>
                    (pathutils.getParentFolder(it.entry.path) || '') === (this.currentPath || '')
                );
                if (currentFolderItems.length > 0) {
                    // Deduplicate (overwrite replaces an existing entry)
                    const newPaths = new Set(currentFolderItems.map(it => it.entry.path));
                    this.fileBrowserFiles = this.fileBrowserFiles.filter(f => !newPaths.has(f.entry.path));
                    this.fileBrowserFiles.push(...currentFolderItems);
                    this.sortFiles();
                }

                // Always notify the treeview for every pasted item (any folder)
                if (allNewItems.length > 0) emitter.emit('addItems', allNewItems);
            }

            // cut consumed; copy persists (Windows-Explorer-like behaviour)
            if (mode === 'cut') clipboard.clear();

            const failedCount = Object.keys(result.failed).length;
            const skippedCount = result.skipped.length;
            const ok = result.succeeded.length;

            if (failedCount === 0 && skippedCount === 0) {
                this.$toast.add({
                    severity: 'success',
                    summary: 'Paste',
                    detail: `${ok} item${ok !== 1 ? 's' : ''} ${mode === 'cut' ? 'moved' : 'copied'} successfully`,
                    life: 3000
                });
            } else {
                this.pasteResultData = {
                    mode,
                    succeeded: result.succeeded,
                    failed: result.failed,
                    skipped: result.skipped
                };
                this.pasteResultDialogOpen = true;
            }
        },

        // Internal: resolve a Promise with the conflict strategy chosen by
        // the user. Implemented via the PasteConflictDialog in ViewDataset.
        _askPasteConflict(conflicts) {
            return new Promise((resolve) => {
                this.pasteConflictData = {
                    items: conflicts,
                    resolve
                };
                this.pasteConflictDialogOpen = true;
            });
        },

        closeFlash() {
            // No-op: Toast auto-closes
        }
    }
};

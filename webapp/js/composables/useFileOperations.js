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
import { selectionBasePath } from '@/features/dataset/explorer/treeSelection';
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
                const selected = this.contextMenuFiles.slice();
                const paths = selected.map(file => file.entry.path);

                // Use batch delete endpoint
                const response = await this.dataset.deleteObjs(paths);

                // Update file browser with successfully deleted paths
                if (response.deleted && response.deleted.length > 0) {
                    this.fileBrowserFiles = this.fileBrowserFiles.filter(
                        item => !response.deleted.includes(item.entry.path)
                    );

                    // If the deleted file is the one shown in the detail panel, close it
                    if (this.selectedDetailFile && response.deleted.includes(this.selectedDetailFile.entry.path)) {
                        this.selectedDetailFile = null;
                    }

                    emitter.emit('deleteEntries', response.deleted);

                    // Distinguish folders from files in the message instead of always
                    // saying "file": the deleted paths map back to the original selection,
                    // which carries each entry's type.
                    const deletedSet = new Set(response.deleted);
                    const folderCount = selected.filter(
                        f => deletedSet.has(f.entry.path) && ddb.entry.isDirectory(f.entry)
                    ).length;
                    const fileCount = response.deleted.length - folderCount;
                    const parts = [];
                    if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
                    if (folderCount > 0) parts.push(`${folderCount} folder${folderCount > 1 ? 's' : ''}`);
                    const what = parts.length > 0
                        ? parts.join(' and ')
                        : `${response.deleted.length} item${response.deleted.length > 1 ? 's' : ''}`;
                    this.$notify.success(`${what} deleted successfully`, { summary: 'Deleted' });
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
         * @param {boolean} [options.silent=false] - skip the result toast (used
         *        when the caller shows its own aggregate toast, e.g. sidecar renames).
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

                // Only notify the build pipeline when the rename's extension change made a
                // previously non-buildable file buildable. Hash-based build artifacts already
                // apply to files that were buildable before the rename, so no new build is
                // ever queued in that case - showing the "buildable files detected" toast then
                // would be misleading since nothing is actually being built.
                const wasBuildable = BuildManager.isBuildableType(file.entry.type);
                const isBuildable = BuildManager.isBuildableType(newItem.entry.type);
                if (action === 'rename' && !wasBuildable && isBuildable) {
                    BuildManager.onFilesAdded(this.dataset, [newItem.entry]);
                }

                if (options.silent) {
                    // Caller shows its own (aggregate) toast
                } else if (action === 'move') {
                    this.$notify.success(`File moved successfully`, { summary: 'Moved' });
                } else {
                    this.$notify.success(`File renamed successfully`, { summary: 'Renamed' });
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
                this.$notify.warn('Cannot move dataset root', { summary: 'Move', life: 'short' });
                return;
            }

            const sourceItemName = pathutils.basename(sourceItem.entry.path);
            let destPath;

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
                this.$notify.info('Item is already in this folder', { summary: 'Move' });
                return;
            }

            // Block move into self or descendant for directories
            if (ddb.entry.isDirectory(sourceItem.entry)
                && (destPath + '/').startsWith(sourceItem.entry.path + '/')) {
                this.$notify.warn('Cannot move a folder onto itself or one of its descendants', { summary: 'Move' });
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
        // Copy / Cut / Paste - clipboard flow
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

        // `selection` is an explicit list of items (from the tree). When omitted,
        // the explorer selection is used. Tree items can come from any folder, so
        // their source folder is their own parent, not the current folder.
        _clipboardSelection(selection) {
            const explicit = Array.isArray(selection);
            const items = (explicit ? selection : this._selectedItemsForClipboard())
                .filter(f => f.entry && f.entry.type !== ddb.entry.type.DRONEDB);
            const basePath = explicit ? selectionBasePath(items) : (this.currentPath || '');
            return { items, basePath };
        },

        clipboardCopySelected(selection) {
            const { items, basePath } = this._clipboardSelection(selection);
            if (items.length === 0) {
                this.$notify.info('No items selected', { summary: 'Copy' });
                return;
            }
            clipboard.copy({
                orgSlug: this.dataset.org,
                dsSlug: this.dataset.ds,
                basePath
            }, items);
            this.$notify.success(`${items.length} item${items.length > 1 ? 's' : ''} copied to clipboard`, { summary: 'Copied' });
        },

        clipboardCutSelected(selection) {
            if (!this.canWrite) {
                this.$notify.warn('You do not have write access to this dataset', { summary: 'Cut', life: 'short' });
                return;
            }
            const { items, basePath } = this._clipboardSelection(selection);
            if (items.length === 0) {
                this.$notify.info('No items selected', { summary: 'Cut' });
                return;
            }
            clipboard.cut({
                orgSlug: this.dataset.org,
                dsSlug: this.dataset.ds,
                basePath
            }, items);
            this.$notify.success(`${items.length} item${items.length > 1 ? 's' : ''} ready to move`, { summary: 'Cut' });
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
                this.$notify.warn('You do not have write access to this dataset', { summary: 'Paste', life: 'short' });
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
                this.$notify.info(mode === 'cut'
                        ? 'Cannot move into the same folder'
                        : 'Cannot copy into the same folder', { summary: 'Paste' });
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
            const existingNames = await this._pasteTargetNames(target.basePath);
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
            // Reuse the original source entry (preserved in the clipboard) so the
            // newly injected entries carry hash + properties + geometries. The
            // DroneDB hash is content-based, so it stays valid after copy/move.
            // When the source entry is missing (legacy clipboard from sessionStorage
            // pre-fix), fall back to a server `listOne` to populate it.
            if (result.succeeded.length > 0) {
                const itemByPath = new Map(items.map(it => [it.path, it]));
                const allNewItems = result.succeeded.map(s => {
                    const original = itemByPath.get(s.source);
                    const sourceEntry = original && original.entry ? original.entry : null;
                    const type = sourceEntry ? sourceEntry.type
                        : (original ? original.type : ddb.entry.type.GENERIC);

                    let entry;
                    if (sourceEntry) {
                        // Deep-copy so we don't mutate the clipboard entry (copy mode
                        // keeps the clipboard alive after paste).
                        entry = JSON.parse(JSON.stringify(sourceEntry));
                        entry.path = s.dest;
                    } else {
                        entry = { path: s.dest, type, size: original ? original.size : 0 };
                    }

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

                // Fallback: for non-directory entries that ended up without a hash
                // (legacy clipboard items), fetch the entry from the server so the
                // viewer can build the `Entry` object on open. Run in parallel and
                // tolerate failures (the next folder navigation will refresh anyway).
                const needsFetch = allNewItems.filter(it =>
                    !it.entry.hash && !ddb.entry.isDirectory(it.entry)
                );
                if (needsFetch.length > 0) {
                    await Promise.all(needsFetch.map(async (it) => {
                        try {
                            const fetched = await this.dataset.listOne(it.entry.path);
                            if (fetched) {
                                it.entry = fetched;
                                it.empty = ddb.entry.isDirectory(fetched);
                                it.isExpandable = ddb.entry.isDirectory(fetched);
                            }
                        } catch (e) {
                            console.warn(`Could not fetch entry for pasted item ${it.entry.path}:`, e);
                        }
                    }));
                }

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
                this.$notify.success(`${ok} item${ok !== 1 ? 's' : ''} ${mode === 'cut' ? 'moved' : 'copied'} successfully`, { summary: 'Paste' });
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

        // Internal: names of the entries in the paste destination folder. Lists
        // the folder on the server: fileBrowserFiles can hold only part of it
        // (e.g. a single file selected in the tree), which would hide conflicts
        // and let the paste overwrite files without asking.
        async _pasteTargetNames(basePath) {
            try {
                const entries = await this.dataset.list(basePath || undefined) || [];
                return new Set(entries.map(e => pathutils.basename(e.path)));
            } catch (e) {
                console.warn(`Could not list paste destination "${basePath}", using the loaded view:`, e);
                return new Set(this.fileBrowserFiles
                    .filter(f => (pathutils.getParentFolder(f.entry.path) || '') === (basePath || ''))
                    .map(f => pathutils.basename(f.entry.path)));
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

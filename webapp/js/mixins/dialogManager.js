/**
 * Dialog Manager Mixin
 * Manages the state and handlers for various dialogs in ViewDataset
 */
export default {
    data() {
        return {
            // Dialog states
            uploadDialogOpen: false,
            deleteDialogOpen: false,
            deleteResultDialogOpen: false,
            renameDialogOpen: false,
            createFolderDialogOpen: false,
            transferDialogOpen: false,
            showSettings: false,
            showProperties: false,
            errorDialogOpen: false,

            // Dialog data
            fileToRename: null,
            filesToUpload: null,
            errorMessage: null,
            errorMessageTitle: null,
            shareFile: null,
            deleteResultData: { deleted: [], failed: {} }
        };
    },

    methods: {
        // Settings Dialog
        openSettingsDialog() {
            this.showSettings = true;
        },

        handleSettingsClose() {
            this.showSettings = false;
        },

        // Upload Dialog
        openUploadDialog(files = null) {
            this.filesToUpload = files;
            this.uploadDialogOpen = true;
        },

        handleAddClose(uploaded, uploadSuccess) {
            this.uploadDialogOpen = false;
            this.filesToUpload = null;

            if (uploaded.length == 0) return;

            var items = [];
            var addedPaths = new Set(); // Track paths we've already added to avoid duplicates

            // Normalize currentPath for comparison (null/undefined/"" all mean root)
            const normalizedCurrentPath = (this.currentPath != null && this.currentPath.length > 0) ? this.currentPath : null;

            for (var entry of uploaded) {
                // Get the parent folder of the uploaded entry
                const entryParentPath = this.pathutils.getParentFolder(entry.path);

                // Determine what to show in the current view
                let itemToAdd = null;
                let itemPath = null;
                let itemLabel = null;
                let itemEntry = entry;
                let isDirectory = false;

                if (normalizedCurrentPath === null) {
                    // We're at root level
                    if (entryParentPath === null) {
                        // Entry is directly in root - add it as-is
                        itemPath = entry.path;
                        itemLabel = this.pathutils.basename(entry.path);
                        isDirectory = this.ddb.entry.isDirectory(entry);
                    } else {
                        // Entry is in a subfolder - add the top-level folder
                        const pathParts = entry.path.split('/');
                        itemPath = pathParts[0];
                        itemLabel = pathParts[0];
                        isDirectory = true;
                        // Create a synthetic folder entry
                        itemEntry = {
                            path: itemPath,
                            type: this.ddb.entry.type.DIRECTORY,
                            size: 0,
                            mtime: entry.mtime
                        };
                    }
                } else {
                    // We're in a subfolder
                    if (entryParentPath === normalizedCurrentPath) {
                        // Entry is directly in current folder - add it as-is
                        itemPath = entry.path;
                        itemLabel = this.pathutils.basename(entry.path);
                        isDirectory = this.ddb.entry.isDirectory(entry);
                    } else if (entryParentPath !== null && entryParentPath.startsWith(normalizedCurrentPath + '/')) {
                        // Entry is in a subfolder of current folder - add the immediate subfolder
                        const relativePath = entry.path.substring(normalizedCurrentPath.length + 1);
                        const pathParts = relativePath.split('/');
                        itemPath = normalizedCurrentPath + '/' + pathParts[0];
                        itemLabel = pathParts[0];
                        isDirectory = true;
                        // Create a synthetic folder entry
                        itemEntry = {
                            path: itemPath,
                            type: this.ddb.entry.type.DIRECTORY,
                            size: 0,
                            mtime: entry.mtime
                        };
                    } else {
                        // Entry doesn't belong to current view - skip it
                        continue;
                    }
                }

                // Skip if we've already processed this path (for folders with multiple files)
                if (addedPaths.has(itemPath)) {
                    continue;
                }
                addedPaths.add(itemPath);

                // Don't add if it already exists in the file browser
                if (this.fileBrowserFiles.filter(file => file.entry.path === itemPath).length > 0) {
                    continue;
                }

                var item = {
                    icon: this.icons.getForType(itemEntry.type),
                    label: itemLabel,
                    path: this.dataset.remoteUri(itemPath),
                    entry: itemEntry,
                    isExpandable: isDirectory,
                    selected: false
                };

                this.fileBrowserFiles.push(item);
                items.push(item);
            }

            this.sortFiles();

            if (items.length > 0) {
                this.$root.$emit('addItems', items);

                // Notify BuildManager about new files (use original entries, not synthetic ones)
                const newEntries = uploaded;
                this.BuildManager.onFilesAdded(this.dataset, newEntries);
            }

            if (uploadSuccess) this.flash = `Uploaded ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}`;
        },

        // Delete Dialog
        openDeleteItemsDialog() {
            if (this.selectedFiles.length == 0) return;
            this.selectedUsingFileBrowserList = false;
            this.deleteDialogOpen = true;
        },

        openDeleteItemsDialogFromFileBrowser() {
            this.selectedUsingFileBrowserList = true;
            this.deleteDialogOpen = true;
        },

        async handleDeleteClose(id) {
            if (id == "remove") {
                await this.deleteSelectedFiles();
            }
            this.deleteDialogOpen = false;
        },

        // Delete Result Dialog
        showDeleteResults(result) {
            this.deleteResultData = result;
            this.deleteResultDialogOpen = true;
        },

        handleDeleteResultClose() {
            this.deleteResultDialogOpen = false;
            this.deleteResultData = { deleted: [], failed: {} };
        },

        // Rename Dialog
        openRenameItemsDialog() {
            if (this.selectedFiles.length != 1) return;
            this.selectedUsingFileBrowserList = false;
            this.fileToRename = this.selectedFiles[0];
            this.renameDialogOpen = true;
        },

        openRenameItemsDialogFromFileBrowser() {
            this.renameDialogOpen = true;
            this.fileToRename = this.fileBrowserFiles[0];
            this.selectedUsingFileBrowserList = true;
        },

        async handleRenameClose(id, newPath, entry, measurementsInfo) {
            if (id == "rename") {
                if (newPath == null || newPath.length == 0) return;

                // Handle measurements rename if requested
                if (measurementsInfo && measurementsInfo.renameMeasurements) {
                    this.isBusy = true;
                    try {
                        // First rename the point cloud
                        await this.renameSelectedFile(newPath);

                        // Then rename the measurements file
                        console.log('Renaming measurements file...');
                        await this.dataset.moveObj(
                            measurementsInfo.oldMeasurementsPath,
                            measurementsInfo.newMeasurementsPath
                        );

                        console.log('Both files renamed successfully');
                        this.flash = 'Point cloud and measurements file renamed successfully';
                    } catch (e) {
                        // If measurements rename fails, show warning but not critical error
                        if (e.message && e.message.includes('measurements')) {
                            this.flash = 'Point cloud renamed, but measurements file could not be renamed';
                            console.warn('Measurements rename failed:', e);
                        } else {
                            this.showError(e, "Rename");
                        }
                    } finally {
                        this.isBusy = false;
                    }
                } else {
                    // Normal rename without measurements
                    await this.renameSelectedFile(newPath);
                }
            } else if (id == "renameddb") {
                if (newPath == null || newPath.length == 0) return;
                this.isBusy = true;
                try {
                    const newDs = await this.renameDataset(this.$route.params.org, this.$route.params.ds, newPath);
                    this.$router.push({
                        name: "ViewDataset", params: {
                            org: this.$route.params.org,
                            ds: newDs.slug
                        }
                    });
                    location.reload(true);
                } catch (e) {
                    this.showError(e, "Rename");
                }
                this.isBusy = false;
            }
            this.renameDialogOpen = false;
        },

        // New Folder Dialog
        handleCreateFolder() {
            this.createFolderDialogOpen = true;
        },

        async handleNewFolderClose(id, newFolderPath) {
            if (id == "createFolder") {
                if (newFolderPath == null || newFolderPath.length == 0) return;
                await this.createFolder(newFolderPath);
            }
            this.createFolderDialogOpen = false;
        },

        // Transfer Dialog
        openTransferItemsDialog() {
            if (this.selectedFiles.length === 0) return;
            this.selectedUsingFileBrowserList = false;
            this.transferDialogOpen = true;
        },

        openTransferItemsDialogFromFileBrowser() {
            if (this.fileBrowserFiles.length === 0) return;
            this.selectedUsingFileBrowserList = true;
            this.transferDialogOpen = true;
        },

        async handleTransferClose(id, transferredFiles) {
            this.transferDialogOpen = false;

            if (id === "transferred" && transferredFiles && transferredFiles.length > 0) {
                const transferredPaths = transferredFiles.map(f => f.entry.path);
                this.fileBrowserFiles = this.fileBrowserFiles.filter(
                    item => !transferredPaths.includes(item.entry.path)
                );

                this.$root.$emit('deleteEntries', transferredPaths);

                this.flash = `${transferredFiles.length} item${transferredFiles.length > 1 ? 's' : ''} transferred successfully`;
            }
        },

        // Properties Dialog
        handleExplorerOpenProperties() {
            if (this.selectedFiles.length == 0) return;
            this.showProperties = true;
            this.selectedUsingFileBrowserList = false;
        },

        handleFileBrowserOpenProperties() {
            this.showProperties = true;
            this.selectedUsingFileBrowserList = true;
        },

        handleCloseProperties() {
            this.showProperties = false;
        },

        // Share/Embed Dialog
        handleShareEmbed(file) {
            this.shareFile = file;
        },

        handleCloseShareEmbed() {
            this.shareFile = null;
        },

        // Error Dialog
        showError(text, title) {
            this.errorMessage = text;
            this.errorMessageTitle = (typeof title === 'undefined' || title == null) ? "Error" : title;
            this.errorDialogOpen = true;
        },

        handleErrorDialogClose() {
            this.errorDialogOpen = false;
        }
    }
};

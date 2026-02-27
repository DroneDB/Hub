/**
 * Dialog Manager Mixin
 * Manages the state and handlers for various dialogs in ViewDataset
 */
import reg from '../libs/sharedRegistry';
import { Features } from '../libs/features';
import emitter from '../libs/eventBus';

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
            deleteResultData: { deleted: [], failed: {} },
            rescanResultDialogOpen: false,
            rescanResultData: null,
            rescanConfirmDialogOpen: false,
            setCoverDialogOpen: false,
            setCoverFile: null,
            setCoverExistingCovers: []
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

            if (!uploaded || uploaded.length == 0) return;

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
                emitter.emit('addItems', items);

                // Notify BuildManager about new files (use original entries, not synthetic ones)
                const newEntries = uploaded;
                this.BuildManager.onFilesAdded(this.dataset, newEntries);
            }

            if (uploadSuccess) this.$toast.add({ severity: 'success', summary: 'Upload Complete', detail: `Uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`, life: 3000 });
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
                        this.$toast.add({ severity: 'success', summary: 'Renamed', detail: 'Point cloud and measurements file renamed successfully', life: 3000 });
                    } catch (e) {
                        // If measurements rename fails, show warning but not critical error
                        if (e.message && e.message.includes('measurements')) {
                            this.$toast.add({ severity: 'warn', summary: 'Partial Rename', detail: 'Point cloud renamed, but measurements file could not be renamed', life: 5000 });
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

                emitter.emit('deleteEntries', transferredPaths);

                this.$toast.add({ severity: 'success', summary: 'Transfer Complete', detail: `${transferredFiles.length} item${transferredFiles.length > 1 ? 's' : ''} transferred successfully`, life: 3000 });
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

        // Rescan
        handleRescanRequested() {
            this.rescanConfirmDialogOpen = true;
        },

        handleRescanConfirmClose(id) {
            this.rescanConfirmDialogOpen = false;
            if (id === 'confirm') {
                this.startRescan();
            }
        },

        async startRescan() {
            this.showSettings = false;
            this.isBusy = true;

            try {
                const result = await this.dataset.rescan(false);
                this.rescanResultData = result;
                this.rescanResultDialogOpen = true;
            } catch (e) {
                this.showError(e.message, 'Rescan Error');
            } finally {
                this.isBusy = false;
            }
        },

        handleRescanResultClose() {
            this.rescanResultDialogOpen = false;
            this.rescanResultData = null;
        },

        // Set as Dataset Cover
        async setAsCover(file) {
            try {
                // Get the thumbnail candidates from features
                const candidates = reg.getFeatureValue(Features.DATASET_THUMBNAIL_CANDIDATES);
                if (!candidates || candidates.length === 0) {
                    this.showError('Dataset thumbnail candidates not configured', 'Error');
                    return;
                }

                // Check if any cover already exists in the dataset root
                const rootEntries = await this.dataset.list();
                const existingCovers = rootEntries.filter(e => {
                    const filename = e.path.split('/').pop().toLowerCase();
                    return candidates.some(c => c.toLowerCase() === filename);
                });

                this.setCoverFile = file;

                if (existingCovers.length > 0) {
                    this.setCoverExistingCovers = existingCovers;
                    this.setCoverDialogOpen = true;
                } else {
                    await this.performSetAsCover();
                }
            } catch (e) {
                this.showError(e.message || e, 'Set as Dataset Cover');
            }
        },

        handleSetCoverClose(id) {
            this.setCoverDialogOpen = false;
            if (id === 'confirm') {
                this.performSetAsCover();
            } else {
                this.setCoverFile = null;
                this.setCoverExistingCovers = [];
            }
        },

        async performSetAsCover() {
            try {
                const candidates = reg.getFeatureValue(Features.DATASET_THUMBNAIL_CANDIDATES);
                const targetFilename = candidates[0];
                const file = this.setCoverFile;

                this.isBusy = true;

                // Delete all existing cover files
                if (this.setCoverExistingCovers.length > 0) {
                    const coverPaths = this.setCoverExistingCovers.map(e => e.path);
                    await this.dataset.deleteObjs(coverPaths);
                    emitter.emit('deleteEntries', coverPaths);
                }

                // Fetch the thumbnail at 1024px
                const thumbUrl = this.dataset.thumbUrl(file.entry.path, 1024);
                const response = await fetch(thumbUrl, { credentials: 'include' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
                }
                const blob = await response.blob();

                // Upload to the dataset root with the target filename
                await this.dataset.uploadObj(targetFilename, new File([blob], targetFilename, { type: blob.type }));

                this.$toast.add({ severity: 'success', summary: 'Cover Set', detail: 'Dataset cover set successfully', life: 3000 });

                // Refresh entries to show the new file
                emitter.emit('refreshEntries');
            } catch (e) {
                this.showError(e.message || e, 'Set as Dataset Cover');
            } finally {
                this.isBusy = false;
                this.setCoverFile = null;
                this.setCoverExistingCovers = [];
            }
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

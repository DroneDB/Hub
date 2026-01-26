<template>
    <div id="browser" class="cui app">
        <Message bindTo="error" />
        <Panel split="vertical" class="container main" amount="23.6%" mobileAmount="0%" tabletAmount="30%"
            mobileCollapsed>
            <div class="sidebar">
                <FileBrowser v-show="!isMobile" :rootNodes="rootNodes" @openItem="handleOpenItem"
                    @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                    @openProperties="handleFileBrowserOpenProperties"
                    @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                    @moveSelectedItems="openRenameItemsDialogFromFileBrowser"
                    @transferSelectedItems="openTransferItemsDialogFromFileBrowser"
                    @openAsText="handleOpenAsText" @error="handleError" />
            </div>
            <TabSwitcher :tabs="mainTabs" :selectedTab="startTab" position="top" buttonWidth="auto" :hideSingle="false"
                ref="mainTabSwitcher">
                <template v-if="isMobile" v-slot:filebrowser>
                    <FileBrowser :rootNodes="rootNodes" @openItem="handleOpenItem"
                        @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                        @openProperties="handleFileBrowserOpenProperties"
                        @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                        @moveSelectedItems="openRenameItemsDialogFromFileBrowser"
                        @transferSelectedItems="openTransferItemsDialogFromFileBrowser"
                        @openAsText="handleOpenAsText" @error="handleError" />
                </template> <template v-slot:map>
                    <Map lazyload :files="fileBrowserFiles" :dataset="dataset" :canWrite="canWrite" @scrollTo="handleScrollTo"
                        @openItem="handleOpenItem" />
                </template>
                <template v-slot:explorer>
                    <!-- Grid View (Explorer) -->
                    <Explorer v-if="viewMode === 'grid'" ref="explorer" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                        :dataset="dataset" :viewMode="viewMode" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                        @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                        @transferSelectedItems="openTransferItemsDialog"
                        @moveItem="handleMoveItem" @openProperties="handleExplorerOpenProperties"
                        @shareEmbed="handleShareEmbed" @buildStarted="handleBuildStarted" @buildError="handleBuildError" />

                    <!-- Table View with Detail Panel (Desktop/Tablet only) -->
                    <Panel v-else-if="selectedDetailFile && !isMobile" split="vertical" amount="70%" tabletAmount="60%">
                        <TableView ref="tableview" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                            :dataset="dataset" :viewMode="viewMode" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                            @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                            @transferSelectedItems="openTransferItemsDialog"
                            @moveItem="handleMoveItem" @openProperties="handleExplorerOpenProperties"
                            @shareEmbed="handleShareEmbed" @buildStarted="handleBuildStarted" @buildError="handleBuildError"
                            @selectionChanged="handleTableSelectionChanged" />

                        <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                            @close="handleDetailPanelClose"
                            @open="handleDetailPanelOpen"
                            @properties="handleDetailPanelProperties"
                            @share="handleDetailPanelShare"
                            @buildStarted="handleBuildStarted"
                            @buildError="handleBuildError" />
                    </Panel>

                    <!-- Table View without Detail Panel -->
                    <TableView v-else ref="tableview" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                        :dataset="dataset" :viewMode="viewMode" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                        @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                        @transferSelectedItems="openTransferItemsDialog"
                        @moveItem="handleMoveItem" @openProperties="handleExplorerOpenProperties"
                        @shareEmbed="handleShareEmbed" @buildStarted="handleBuildStarted" @buildError="handleBuildError"
                        @selectionChanged="handleTableSelectionChanged" />
                </template>
                <template v-slot:buildhistory>
                    <BuildHistory :dataset="dataset" @buildRetried="handleBuildRetried" @buildRetryError="handleBuildRetryError" />
                </template>
            </TabSwitcher>
        </Panel>
        <Properties v-if="showProperties" :files="contextMenuFiles" @onClose="handleCloseProperties" />
        <SettingsDialog v-if="showSettings" :dataset="dataset" @onClose="handleSettingsClose"
            @addMarkdown="handleAddMarkdown" />
        <AddToDatasetDialog v-if="uploadDialogOpen" @onClose="handleAddClose" :path="currentPath"
            :organization="dataset.org" :dataset="dataset.ds" :filesToUpload="filesToUpload" :open="true">
        </AddToDatasetDialog>
        <DeleteDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :files="contextMenuFiles"></DeleteDialog>
        <RenameDialog v-if="renameDialogOpen" @onClose="handleRenameClose" :file="fileToRename"></RenameDialog>
        <NewFolderDialog v-if="createFolderDialogOpen" @onClose="handleNewFolderClose"></NewFolderDialog>
        <TransferDialog v-if="transferDialogOpen" @onClose="handleTransferClose" :files="contextMenuFiles"
            :sourceOrg="dataset.org" :sourceDs="dataset.ds"></TransferDialog>
        <Alert :title="errorMessageTitle" v-if="errorDialogOpen" @onClose="handleErrorDialogClose">
            {{ errorMessage }}
        </Alert>
        <Loader v-if="isBusy"></Loader>
        <Flash v-if="flash" color="positive" icon="check circle outline" @onClose="closeFlash">{{ flash }}</Flash>
        <ShareEmbed v-if="shareFile" @onClose="handleCloseShareEmbed" :file="shareFile" />
        <FileAvailabilityDialog
            v-if="showAvailabilityDialog"
            :show="showAvailabilityDialog"
            :title="availabilityDialogData.title"
            :message="availabilityDialogData.message"
            :status="availabilityDialogData.status"
            :actions="availabilityDialogData.actions"
            :buildState="availabilityDialogData.buildState"
            :dataset="dataset"
            :entry="availabilityDialogData.entry"
            @close="handleAvailabilityDialogClose"
            @build-started="handleBuildStarted"
            @build-completed="handleBuildCompleted"
            @build-failed="handleBuildFailed"
            @timeout="handleBuildTimeout"
            @error="handleError"
        />
        <TextEditorDialog
            v-if="textEditorDialogOpen"
            :dataset="dataset"
            :entry="textEditorEntry"
            :readonly="textEditorReadonly"
            @onClose="handleTextEditorClose"
            @saved="handleTextEditorSaved"
        />
    </div>
</template>

<script>
import Header from './Header.vue';
import SettingsDialog from './SettingsDialog.vue';
import AddToDatasetDialog from './AddToDatasetDialog.vue';
import DeleteDialog from './DeleteDialog.vue';
import RenameDialog from './RenameDialog.vue';
import NewFolderDialog from './NewFolderDialog.vue';
import TransferDialog from './TransferDialog.vue';
import Message from './Message.vue';
import FileBrowser from './FileBrowser.vue';
import Map from './Map.vue';
import Explorer from './Explorer.vue';
import TableView from './TableView.vue';
import DetailPanel from './DetailPanel.vue';
import Properties from './Properties.vue';
import TabSwitcher from './TabSwitcher.vue';
import Panel from './Panel.vue';
import Alert from './Alert.vue';
import Loader from './Loader.vue';
import Flash from './Flash.vue';
import ShareEmbed from './ShareEmbed.vue';
import BuildHistory from './BuildHistory.vue';
import FileAvailabilityDialog from './FileAvailabilityDialog.vue';
import TextEditorDialog from './TextEditorDialog.vue';

import icons from '../libs/icons';
import reg from '../libs/sharedRegistry';
import { setTitle } from '../libs/utils';
import { clone } from '../libs/utils';
import shell from '../dynamic/shell';
import { isMobile } from '../libs/responsive';
import { renameDataset, entryLabel } from '../libs/registryUtils';
import { b64encode } from '../libs/base64';
import BuildManager from '../libs/buildManager';
import FileAvailabilityChecker from '../libs/fileAvailabilityChecker';
import { shouldOpenAsText, canOpenAsText } from '../libs/textFileUtils';

import ddb from 'ddb';
const { pathutils, utils } = ddb;

import { OpenItemDefaults } from '../libs/openItemDefaults';

// Import mixins
import dialogManager from '../mixins/dialogManager';
import fileOperations from '../mixins/fileOperations';
import buildEvents from '../mixins/buildEvents';

export default {
    mixins: [dialogManager, fileOperations, buildEvents],
    components: {
        Header,
        Message,
        FileBrowser,
        Map,
        Explorer,
        TableView,
        DetailPanel,
        Properties,
        TabSwitcher,
        SettingsDialog,
        Panel,
        AddToDatasetDialog,
        DeleteDialog,
        RenameDialog,
        NewFolderDialog,
        TransferDialog,
        Alert,
        Loader,
        Flash,
        ShareEmbed,
        BuildHistory,
        FileAvailabilityDialog,
        TextEditorDialog
    },
    data: function () {
        const mobile = isMobile();

        var mainTabs = [];

        if (mobile) {
            mainTabs.unshift({
                label: 'Browser',
                icon: 'sitemap',
                key: 'filebrowser'
            });
        }

        mainTabs = mainTabs.concat([{
            label: 'Files',
            icon: 'folder open',
            key: 'explorer'
        }]);

        mainTabs = mainTabs.concat([{
            label: 'Map',
            icon: 'map',
            key: 'map'
        }, {
            label: 'Build History',
            icon: 'history',
            key: 'buildhistory'
        }]);

        // Load view mode preference from localStorage
        const savedViewMode = localStorage.getItem('fileViewMode') || 'grid';

        return {
            startTab: mainTabs[0].key,
            error: "",
            isMobile: mobile,
            mainTabs: mainTabs,
            fileBrowserFiles: [],
            selectedUsingFileBrowserList: false,
            explorerTools: [],
            dataset: reg.Organization(this.$route.params.org)
                .Dataset(this.$route.params.ds),
            currentPath: null,
            viewMode: savedViewMode, // 'grid' or 'table'
            selectedDetailFile: null, // For DetailPanel in table view
            rootDatasetEntry: null, // Root dataset entry with permissions

            // File availability dialog
            showAvailabilityDialog: false,
            availabilityDialogData: {
                title: '',
                message: '',
                status: '',
                actions: [],
                buildState: null,
                entry: null
            },

            // Text editor dialog
            textEditorDialogOpen: false,
            textEditorEntry: null,
            textEditorReadonly: false,

            // Helper references for mixins
            icons: icons,
            pathutils: pathutils,
            ddb: ddb,
            BuildManager: BuildManager,
            renameDataset: renameDataset
        };
    },
    mounted: function () {
        document.getElementById("app").classList.add("fullpage");
        setTitle(this.$route.params.ds);

        // Initialize BuildManager
        BuildManager.registerDataset(this.dataset);
        BuildManager.loadBuilds(this.dataset).catch(error => {
            console.warn('Error loading builds:', error);
        });

        // Listen for Delete key to delete selected files
        document.addEventListener('keydown', this.handleKeyDown);

        // Listen to build state change events
        BuildManager.on('buildStateChanged', this.handleBuildStateNotification);
        BuildManager.on('buildStarted', this.handleBuildStartedNotification);
        BuildManager.on('buildError', this.handleBuildErrorNotification);
        BuildManager.on('newBuildableFilesDetected', this.handleNewBuildableFilesNotification);

        this.$root.$on('openSettings', () => {
            this.showSettings = true;
        });

        this.$root.$on('uploadItems', msg => {
            this.filesToUpload = msg.files;
            this.uploadDialogOpen = true;
        });

        this.$root.$on('moveItem', async (sourceItem, destItem) => {

            if (sourceItem.entry.type == ddb.entry.type.DRONEDB) {
                this.$log.info("Cannot move root");
                return;
            }

            var destPath = "";
            var sourceItemName = pathutils.basename(sourceItem.entry.path);

            // Folder magics: if dest is file let's use its parent.
            if (ddb.entry.isDirectory(destItem.entry))
                destPath = destItem.entry.type == ddb.entry.type.DRONEDB ? sourceItemName : pathutils.join(destItem.entry.path, sourceItemName);
            else {
                var destParentFolder = pathutils.getParentFolder(destItem.entry.path);
                destPath = destParentFolder == null ? sourceItemName : pathutils.join(destParentFolder, sourceItemName);
            }

            if (destPath.startsWith(sourceItem.entry.path)) {
                this.$log.info("Cannot move a file onto itself");
                return;
            }

            this.$log.info(`Moving ${sourceItem.entry.path} -> ${destPath}`);

            this.isBusy = true;
            await this.renameFile(sourceItem, destPath);
            this.isBusy = false;

        });
    },
    beforeDestroy: function () {
        document.getElementById("app").classList.remove("fullpage");

        // Remove Delete key listener
        document.removeEventListener('keydown', this.handleKeyDown);

        // Cleanup BuildManager listeners
        BuildManager.off('buildStateChanged', this.handleBuildStateNotification);
        BuildManager.off('buildStarted', this.handleBuildStartedNotification);
        BuildManager.off('buildError', this.handleBuildErrorNotification);
        BuildManager.off('newBuildableFilesDetected', this.handleNewBuildableFilesNotification);

        // Cleanup BuildManager
        BuildManager.cleanup();
    },
    computed: {
        selectedFiles: function () {
            return this.fileBrowserFiles.filter(f => f.selected);
        },
        contextMenuFiles: function () {
            if (this.selectedUsingFileBrowserList) {
                return this.fileBrowserFiles;
            } else {
                return this.selectedFiles;
            }
        },
        // Dataset permissions from backend
        datasetPermissions: function () {
            // Get permissions from the root dataset entry
            if (this.rootDatasetEntry &&
                this.rootDatasetEntry.properties &&
                this.rootDatasetEntry.properties.permissions) {
                return this.rootDatasetEntry.properties.permissions;
            }
            // Default to no permissions if not available
            return { canRead: false, canWrite: false, canDelete: false };
        },
        canRead: function () {
            return this.datasetPermissions.canRead;
        },
        canWrite: function () {
            return this.datasetPermissions.canWrite;
        },
        canDelete: function () {
            return this.datasetPermissions.canDelete;
        }
    },
    methods: {
        // Handle Delete key press to delete selected files
        handleKeyDown(e) {
            // Only handle Delete key
            if (e.key !== 'Delete') return;

            // Don't trigger if we're in an input field or dialog is open
            const tagName = e.target.tagName.toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || e.target.isContentEditable) return;

            // Don't trigger if any dialog is already open
            if (this.deleteDialogOpen || this.renameDialogOpen || this.uploadDialogOpen ||
                this.createFolderDialogOpen || this.transferDialogOpen || this.showProperties ||
                this.showSettings || this.textEditorDialogOpen) return;

            // Check if we have selected files and can write
            if (this.canWrite && this.selectedFiles.length > 0) {
                e.preventDefault();
                this.selectedUsingFileBrowserList = false;
                this.deleteDialogOpen = true;
            }
        },

        // View mode switching
        switchViewMode(mode) {
            this.viewMode = mode;
            localStorage.setItem('fileViewMode', mode);

            // Clear selection when switching views
            if (mode === 'table') {
                this.selectedDetailFile = null;
            }
        },

        toggleViewMode() {
            this.switchViewMode(this.viewMode === 'grid' ? 'table' : 'grid');
        },

        handleTableSelectionChanged(file) {
            // Update selected file for DetailPanel
            const selectedFiles = this.fileBrowserFiles.filter(f => f.selected);
            this.selectedDetailFile = selectedFiles.length === 1 ? selectedFiles[0] : null;
        },

        handleDetailPanelClose() {
            this.selectedDetailFile = null;
        },

        handleDetailPanelOpen(file) {
            this.handleOpenItem(file);
        },

        handleDetailPanelProperties(file) {
            this.selectedUsingFileBrowserList = false;
            this.showProperties = true;
        },

        handleDetailPanelShare(file) {
            this.handleShareEmbed(file);
        },

        rootNodes: async function () {

            try {

                const entries = await this.dataset.info();

                // Save the root dataset entry (contains permissions)
                if (entries.length > 0) {
                    this.rootDatasetEntry = entries[0];
                }

                // Set title
                if (entries.length > 0 && entries[0]?.properties?.meta?.name) {
                    setTitle(entries[0]?.properties?.meta?.name.data);
                }

                return entries.map(e => {
                    return {
                        icon: icons.getForType(e.type),
                        label: utils.entryLabel(e),
                        path: e.path,
                        expanded: true,
                        entry: e,
                        isExpandable: ddb.entry.isDirectory(e)
                    };
                });

            } catch (e) {
                if (e.status === 401) {
                    this.$router.push({ name: "Login" }).catch(() => { });
                } else {
                    this.showError(e, "Dataset");
                }
                return [];
            }
        },

        handleOpenItem: async function (node, view) {
            const t = node.entry.type;
            if (!view) view = OpenItemDefaults[t];

            // Check if file should open as text
            if (!view && shouldOpenAsText(node.entry)) {
                this.openTextEditor(node.entry, false);
                return;
            }

            if (view) {
                // Pre-opening check of file availability
                try {
                    const availability = await FileAvailabilityChecker.check(
                        this.dataset,
                        node.entry,
                        view
                    );

                    if (!availability.available) {
                        // File not available - show dialog
                        this.showFileNotAvailableDialog(availability, node);
                        return;
                    }

                    // File available - proceed with opening
                    const [_, path] = ddb.utils.datasetPathFromUri(node.path);
                    const url = `/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(path)}/${view}`;
                    window.open(url, `${path}-${view}`);

                } catch (error) {
                    this.showError(error.message, "Error");
                }
            } else {
                shell.openItem(node.path);
            }
        },

        openTextEditor: function(entry, readonly = false) {
            this.textEditorEntry = entry;
            this.textEditorReadonly = readonly || !this.canWrite;
            this.textEditorDialogOpen = true;
        },

        handleOpenAsText: function(node) {
            this.openTextEditor(node.entry, false);
        },

        handleTextEditorClose: function() {
            this.textEditorDialogOpen = false;
            this.textEditorEntry = null;
        },

        handleTextEditorSaved: function(path) {
            this.flash = `File saved: ${path}`;
        },

        showFileNotAvailableDialog: function(availability, node) {
            this.availabilityDialogData = {
                title: availability.title,
                message: availability.message,
                status: availability.status,
                actions: availability.actions,
                buildState: availability.buildState,
                entry: node.entry
            };
            this.showAvailabilityDialog = true;
        },

        handleAvailabilityDialogClose: function() {
            this.showAvailabilityDialog = false;
        },

        handleBuildCompleted: function(entry) {
            this.showAvailabilityDialog = false;
            this.flash = `Build completed for ${entry.path}. Opening viewer...`;

            // Automatically open the viewer
            setTimeout(() => {
                const view = OpenItemDefaults[entry.type];
                if (view) {
                    const [_, path] = ddb.utils.datasetPathFromUri(entry.path);
                    const url = `/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(path)}/${view}`;
                    window.open(url, `${path}-${view}`);
                }
            }, 500);
        },

        handleBuildFailed: function(buildState) {
            this.showError(`Build failed for ${buildState.path}`, "Build Error");
        },

        handleBuildTimeout: function() {
            this.showError("Timeout while waiting for build completion. Please try again later.", "Timeout");
            this.showAvailabilityDialog = false;
        },


        addComponentTab: function (uri, label, icon, component, view) {
            if (!this.$refs.mainTabSwitcher.hasTab(label)) {
                this.$refs.mainTabSwitcher.addTab({
                    label,
                    icon,
                    key: `${uri}-${view}`,
                    hideLabel: false,
                    canClose: true,
                    component,
                    props: {
                        uri
                    }
                }, { activate: true });
            } else {
                this.$refs.mainTabSwitcher.activateTab(label);
            }
        },



        handleFileSelectionChanged: function (fileBrowserFiles) {
            this.fileBrowserFiles.forEach(f => f.selected = false);
            this.fileBrowserFiles = fileBrowserFiles;
        },

        handleCurrentUriChanged: function (currentUri) {
            this.currentPath = currentUri != null ? utils.pathFromUri(currentUri).replace(/^\//, "") : null;
        },



        handleScrollTo: function (file) {
            this.$refs.explorer.scrollTo(file);
        },

        handleError: function (e) {
            this.showError(e, "Error");
        },

        updateExplorerTools: function() {
            // Rebuild explorer tools based on current selection and view mode
            this.explorerTools = [];

            // Upload and create folder only if user has write permissions
            if (this.canWrite) {
                this.explorerTools.push({
                    id: 'upload',
                    title: "Upload",
                    icon: "plus",
                    onClick: () => {
                        this.uploadDialogOpen = true;
                    }
                }, {
                    id: 'newfolder',
                    title: "Create folder",
                    icon: "folder",
                    onClick: () => {
                        this.createFolderDialogOpen = true;
                    }
                });
            }

            // Rename and delete only if user has write permissions and files are selected
            if (this.canWrite && this.selectedFiles.length == 1) {
                this.explorerTools.push({
                    id: 'rename',
                    title: "Rename",
                    icon: "edit",
                    onClick: () => {
                        this.fileToRename = this.selectedFiles[0];
                        this.renameDialogOpen = true;
                    }
                });
            }

            if (this.canWrite && this.selectedFiles.length > 0) {
                this.explorerTools.push({
                    id: 'remove',
                    title: "Remove",
                    icon: "trash alternate",
                    onClick: () => {
                        this.selectedUsingFileBrowserList = false;
                        this.deleteDialogOpen = true;
                    }
                });

                this.explorerTools.push({
                    id: 'separator'
                });

                let addedOpen = false;

                if (this.selectedFiles.length === 1) {
                    this.explorerTools.push({
                        id: 'share-embed',
                        title: "Share/Embed",
                        icon: "share alternate",
                        onClick: () => {
                            this.handleShareEmbed(this.selectedFiles[0]);
                        }
                    });

                    if ([ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-map',
                            title: "Open Map",
                            icon: "map",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'map');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-pointcloud',
                            title: "Open Point Cloud",
                            icon: "cube",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'pointcloud');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.MODEL].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-3dmodel',
                            title: "Open 3D Model",
                            icon: "cube",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'model');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-panorama',
                            title: "Open Panorama",
                            icon: "globe",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'panorama');
                            }
                        });
                        addedOpen = true;
                    }
                }

                if (!addedOpen) {
                    this.explorerTools.push({
                        id: 'open',
                        title: "Open",
                        icon: "folder open outline",
                        onClick: () => {
                            this.handleOpenItem(this.selectedFiles[0]);
                        }
                    });
                }
            }

            // Add spacer and view mode toggle button
            this.explorerTools.push({
                id: 'spacer'
            });

            // Show only the button to switch to the opposite view
            if (this.viewMode === 'grid') {
                this.explorerTools.push({
                    id: 'view-toggle',
                    title: "Table View",
                    icon: "list",
                    onClick: () => {
                        this.toggleViewMode();
                    }
                });
            } else {
                this.explorerTools.push({
                    id: 'view-toggle',
                    title: "Grid View",
                    icon: "th",
                    onClick: () => {
                        this.toggleViewMode();
                    }
                });
            }
        }
    },
    watch: {
        viewMode: function(newMode) {
            // When switching to grid view, trigger thumbnail loading
            if (newMode === 'grid') {
                this.$nextTick(() => {
                    if (this.$refs.explorer) {
                        this.$refs.explorer.lazyLoadThumbs();
                    }
                });
            }
        },

        fileBrowserFiles: {
            deep: true,
            handler: function (newVal, oldVal) {
                const $header = this.$parent.$children[0];
                if (!this.$embed)
                    $header.selectedFiles = this.selectedFiles;
            }
        },

        selectedFiles: {
            handler: function () {
                this.updateExplorerTools();
            }
        },

        viewMode: function(newMode) {
            // When viewMode changes, rebuild explorerTools to show the correct icon
            this.updateExplorerTools();
        }
    }
}
</script>

<style scoped>
</style>

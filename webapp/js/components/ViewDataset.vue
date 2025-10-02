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
                    @transferSelectedItems="openTransferItemsDialogFromFileBrowser" @error="handleError" />
            </div>
            <TabSwitcher :tabs="mainTabs" :selectedTab="startTab" position="top" buttonWidth="auto" :hideSingle="false"
                ref="mainTabSwitcher">
                <template v-if="isMobile" v-slot:filebrowser>
                    <FileBrowser :rootNodes="rootNodes" @openItem="handleOpenItem"
                        @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                        @openProperties="handleFileBrowserOpenProperties"
                        @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                        @moveSelectedItems="openRenameItemsDialogFromFileBrowser"
                        @transferSelectedItems="openTransferItemsDialogFromFileBrowser" @error="handleError" />
                </template> <template v-slot:map>
                    <Map lazyload :files="fileBrowserFiles" :dataset="dataset" @scrollTo="handleScrollTo"
                        @openItem="handleOpenItem" />
                </template>
                <template v-slot:explorer>
                    <!-- View mode toggle -->
                    <div class="view-mode-toggle" style="padding: 0.5rem 1rem; border-bottom: 1px solid #d4d4d5; display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button class="ui icon button" :class="{ active: viewMode === 'grid' }" @click="switchViewMode('grid')" title="Grid View">
                            <i class="th icon"></i>
                        </button>
                        <button class="ui icon button" :class="{ active: viewMode === 'table' }" @click="switchViewMode('table')" title="Table View">
                            <i class="list icon"></i>
                        </button>
                    </div>

                    <!-- Grid View (Explorer) -->
                    <Explorer v-if="viewMode === 'grid'" ref="explorer" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                        :dataset="dataset" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                        @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                        @transferSelectedItems="openTransferItemsDialog"
                        @moveItem="handleMoveItem" @openProperties="handleExplorerOpenProperties"
                        @shareEmbed="handleShareEmbed" @buildStarted="handleBuildStarted" @buildError="handleBuildError" />

                    <!-- Table View with Detail Panel -->
                    <Panel v-else split="vertical" amount="70%" mobileAmount="100%" tabletAmount="60%" :mobileCollapsed="true">
                        <TableView ref="tableview" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                            :dataset="dataset" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
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

import icons from '../libs/icons';
import reg from '../libs/sharedRegistry';
import { setTitle } from '../libs/utils';
import { clone } from '../libs/utils';
import shell from '../dynamic/shell';
import { isMobile } from '../libs/responsive';
import { renameDataset, entryLabel } from '../libs/registryUtils';
import { b64encode } from '../libs/base64';
import BuildManager from '../libs/buildManager';

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
        BuildHistory
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
        }
    },
    methods: {
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

        handleOpenItem: function (node, view) {
            const t = node.entry.type;
            if (!view) view = OpenItemDefaults[t];
            if (view) {
                const [_, path] = ddb.utils.datasetPathFromUri(node.path);
                const url = `/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(path)}/${view}`;
                window.open(url, `${path}-${view}`);
            } else {
                shell.openItem(node.path);
            }
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
                this.explorerTools = [{
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
                }];

                if (this.selectedFiles.length == 1) {
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

                if (this.selectedFiles.length > 0) {
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
            }
        }
    }
}
</script>

<style scoped>
.view-mode-toggle .ui.button.active {
    background-color: #2185d0;
    color: white;
}

.view-mode-toggle .ui.button.active:hover {
    background-color: #1678c2;
}
</style>

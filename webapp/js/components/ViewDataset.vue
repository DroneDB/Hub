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
                    @moveSelectedItems="openRenameItemsDialogFromFileBrowser" @error="handleError" />
            </div>
            <TabSwitcher :tabs="mainTabs" :selectedTab="startTab" position="top" buttonWidth="auto" :hideSingle="false"
                ref="mainTabSwitcher">
                <template v-if="isMobile" v-slot:filebrowser>
                    <FileBrowser :rootNodes="rootNodes" @openItem="handleOpenItem"
                        @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                        @openProperties="handleFileBrowserOpenProperties"
                        @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                        @moveSelectedItems="openRenameItemsDialogFromFileBrowser" @error="handleError" />
                </template> <template v-slot:map>
                    <Map lazyload :files="fileBrowserFiles" :dataset="dataset" @scrollTo="handleScrollTo"
                        @openItem="handleOpenItem" />
                </template>
                <template v-slot:explorer>
                    <Explorer ref="explorer" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                        :dataset="dataset" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                        @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                        @moveItem="handleMoveItem" @openProperties="handleExplorerOpenProperties"
                        @shareEmbed="handleShareEmbed" @buildStarted="handleBuildStarted" @buildError="handleBuildError" />
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
import Message from './Message.vue';
import FileBrowser from './FileBrowser.vue';
import Map from './Map.vue';
import Explorer from './Explorer.vue';
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

export default {
    components: {
        Header,
        Message,
        FileBrowser,
        Map,
        Explorer,
        Properties,
        TabSwitcher,
        SettingsDialog,
        Panel,
        AddToDatasetDialog,
        DeleteDialog,
        RenameDialog,
        NewFolderDialog,
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

        return {
            startTab: mainTabs[0].key,
            error: "",
            isMobile: mobile,
            mainTabs: mainTabs,
            fileBrowserFiles: [],
            showProperties: false,
            selectedUsingFileBrowserList: false,
            explorerTools: [],
            dataset: reg.Organization(this.$route.params.org)
                .Dataset(this.$route.params.ds),
            uploadDialogOpen: false,
            deleteDialogOpen: false,
            renameDialogOpen: false,
            createFolderDialogOpen: false,
            fileToRename: null,
            isBusy: false,
            currentPath: null,
            errorDialogOpen: false,
            errorMessage: null,
            errorMessageTitle: null,
            showSettings: false,
            filesToUpload: null,
            shareFile: null,
            flash: ""
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

        handleShareEmbed: function (file) {
            this.shareFile = file;
        },

        handleCloseShareEmbed: function () {
            this.shareFile = null;
        },

        handleMoveItem: async function (node, path) {
            await this.renameFile(node, path);
        },
        handleCreateFolder: function () {
            this.createFolderDialogOpen = true;
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

        sortFiles: function () {
            this.$log.info("ViewDataset.sortFiles");
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
        showError: function (text, title) {
            this.errorMessage = text;
            this.errorMessageTitle = (typeof title === 'undefined' || title == null) ? "Error" : title;
            this.errorDialogOpen = true;
        },
        handleSettingsClose: function () {
            this.showSettings = false;
        },
        handleRenameClose: async function (id, newPath, entry) {
            if (id == "rename") {
                if (newPath == null || newPath.length == 0) return;
                await this.renameSelectedFile(newPath);
            } else if (id == "renameddb") {
                if (newPath == null || newPath.length == 0) return;
                this.isBusy = true;
                try {
                    const newDs = await renameDataset(this.$route.params.org, this.$route.params.ds, newPath);
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
        handleDeleteClose: async function (id) {
            if (id == "remove") {
                await this.deleteSelectedFiles();
            }

            this.deleteDialogOpen = false;
        },

        openDeleteItemsDialog: function () {

            if (this.selectedFiles.length == 0) return;

            this.selectedUsingFileBrowserList = false;
            this.deleteDialogOpen = true;
        },

        openDeleteItemsDialogFromFileBrowser: function () {

            this.selectedUsingFileBrowserList = true;
            this.deleteDialogOpen = true;
        },

        openRenameItemsDialog: function () {

            if (this.selectedFiles.length != 1) return;

            this.selectedUsingFileBrowserList = false;
            this.fileToRename = this.selectedFiles[0];
            this.renameDialogOpen = true;
        },

        openRenameItemsDialogFromFileBrowser: function () {

            this.renameDialogOpen = true;
            this.fileToRename = this.fileBrowserFiles[0];
            this.selectedUsingFileBrowserList = true;
        },

        deleteSelectedFiles: async function () {

            this.isBusy = true;

            try {
                var deleted = [];

                for (var file of this.contextMenuFiles) {
                    await this.dataset.deleteObj(file.entry.path);
                    deleted.push(file.entry.path);
                }

                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => !deleted.includes(item.entry.path));

                this.$root.$emit('deleteEntries', deleted);

            } catch (e) {
                this.showError(e, "Delete");
            }

            this.isBusy = false;

        },
        renameFile: async function (file, newPath) {

            try {
                var oldPath = file.entry.path;
                await this.dataset.moveObj(oldPath, newPath);

                // Remove both the new file path and the old one because it could be a replace
                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => item.entry.path != oldPath && item.entry.path != newPath);

                var newItem = clone(file);
                newItem.path = this.dataset.remoteUri(newPath),
                    newItem.label = pathutils.basename(newPath);
                newItem.entry.path = newPath;

                // Add it to our explorer (we are in the same folder)
                if (pathutils.getParentFolder(newPath) == (this.currentPath || null)) {
                    this.fileBrowserFiles.push(newItem);
                }

                // Tell filebrowser to remove the file in the old location and add to the new location
                this.$root.$emit('deleteEntries', [oldPath]);
                this.$root.$emit('addItems', [newItem]);

                this.sortFiles();

            } catch (e) {
                this.showError(e, "Rename file");
            }

        },

        renameSelectedFile: async function (newPath) {

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

        createFolder: async function (newPath) {

            this.isBusy = true;

            newPath = this.currentPath ? this.currentPath + "/" + newPath : newPath;

            try {

                var entry = await this.dataset.createFolder(newPath);

                const base = pathutils.basename(entry.path);

                var remoteUri = this.dataset.remoteUri(this.currentPath != null ? pathutils.join(this.currentPath, base) : base);

                this.$log.info("Remote uri", remoteUri);

                var folderItem = {
                    icon: icons.getForType(entry.type),
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
                this.$root.$emit('addItems', [folderItem]);

            } catch (e) {
                this.showError(e, "Create folder");
            }

            this.isBusy = false;
        },

        handleFileSelectionChanged: function (fileBrowserFiles) {
            this.fileBrowserFiles.forEach(f => f.selected = false);
            this.fileBrowserFiles = fileBrowserFiles;
        },

        handleCurrentUriChanged: function (currentUri) {
            this.currentPath = currentUri != null ? utils.pathFromUri(currentUri).replace(/^\//, "") : null;
        },

        handleExplorerOpenProperties: function () {

            if (this.selectedFiles.length == 0) return;

            this.showProperties = true;
            this.selectedUsingFileBrowserList = false;
        },
        handleFileBrowserOpenProperties: function () {

            this.showProperties = true;
            this.selectedUsingFileBrowserList = true;
        },
        handleErrorDialogClose: function () {
            this.errorDialogOpen = false;
        },
        handleCloseProperties: function () {
            this.showProperties = false;
        },
        handleNewFolderClose: async function (id, newFolderPath) {

            if (id == "createFolder") {
                if (newFolderPath == null || newFolderPath.length == 0) return;
                await this.createFolder(newFolderPath);
            }

            this.createFolderDialogOpen = false;
        },
        handleAddClose: function (uploaded, uploadSuccess) {

            this.uploadDialogOpen = false;
            this.filesToUpload = null;

            if (uploaded.length == 0) return;

            var items = [];

            for (var entry of uploaded) {

                // Don't add the same file twice
                if (this.fileBrowserFiles.filter(file => file.entry.path == entry.path) != 0)
                    continue;

                const base = pathutils.basename(entry.path);

                var item = {
                    icon: icons.getForType(entry.type),
                    label: base,
                    path: this.dataset.remoteUri((this.currentPath != null && this.currentPath.length > 0) ? pathutils.join(this.currentPath, base) : base),
                    entry,
                    isExpandable: ddb.entry.isDirectory(entry),
                    selected: false
                };

                // Add the file to the explorer
                this.fileBrowserFiles.push(item);
                items.push(item);
            }

            this.sortFiles();

            // Only if any add is necessary, send addItems message to filebrowser
            if (items.length > 0) {
                this.$root.$emit('addItems', items);

                // Notify BuildManager about new files for build monitoring
                const newEntries = items.map(item => item.entry);
                BuildManager.onFilesAdded(this.dataset, newEntries);
            }

            // Show flash
            if (uploadSuccess) this.flash = `Uploaded ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}`;
        },

        handleAddMarkdown: function (document, entry) {
            this.handleAddClose([entry]);
            this.handleOpenItem({
                label: document,
                entry,
                path: this.dataset.remoteUri(document)
            });
            this.showSettings = false;
        },

        handleScrollTo: function (file) {
            this.$refs.explorer.scrollTo(file);
        },

        handleError: function (e) {
            this.showError(e, "Error");
        },

        closeFlash: function () {
            this.flash = "";
        },

        // Build event handlers
        handleBuildStarted: function(file) {
            this.flash = `Build started for ${file.label}`;
        },

        handleBuildError: function(data) {
            this.showError(data.error, "Build Error");
        },

        handleBuildRetried: function(build) {
            this.flash = `Build restarted for ${build.path}`;
        },

        handleBuildRetryError: function(data) {
            this.showError(data.error, "Build Retry Error");
        },

        // Build notification handlers
        handleBuildStateNotification: function(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';

            switch (data.newState) {
                case 'Succeeded':
                    this.flash = `Build completed for ${fileName}`;
                    break;
                case 'Failed':
                    this.flash = `❌ Build failed for ${fileName}`;
                    break;
                case 'Processing':
                    this.flash = `⚙️ Building ${fileName}...`;
                    break;
            }
        },

        handleBuildStartedNotification: function(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';
            this.flash = `🚀 Build started for ${fileName}`;
        },

        handleBuildErrorNotification: function(data) {
            this.showError(data.error, "Build Error");
        },

        handleNewBuildableFilesNotification: function(data) {
            console.log('New buildable files detected notification:', data);
            if (data.dataset === this.dataset) {
                // Show info flash
                const fileCount = data.filePaths.length;
                this.flash = `${fileCount} buildable file${fileCount > 1 ? 's' : ''} detected - processing in background`;
            }
        }
    },
    watch: {
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

<style scoped></style>

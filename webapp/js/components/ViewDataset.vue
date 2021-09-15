<template>
<div id="browser" class="cui app">
    <Message bindTo="error" />
    <Panel split="vertical" class="container main" amount="23.6%">
        <div class="sidebar">
            <FileBrowser :rootNodes="rootNodes" 
                @selectionChanged="handleFileSelectionChanged"
                @currentUriChanged="handleCurrentUriChanged"
                @openProperties="handleFileBrowserOpenProperties"
                @error="handleError" />
        </div>

        <TabSwitcher :tabs="mainTabs"
                position="top"
                buttonWidth="auto"
                :hideSingle="true"
                ref="mainTabSwitcher" >
            <template v-slot:map>
                <Map :files="fileBrowserFiles" @scrollTo="handleScrollTo" />
            </template>
            <template v-slot:potree>
                <Potree :files="fileBrowserFiles" />
            </template>
            <template v-slot:explorer>
                <Explorer ref="explorer"
                    :files="fileBrowserFiles"
                    :tools="explorerTools"
                    :currentPath="currentPath"
                    @openProperties="handleExplorerOpenProperties" />
            </template>
            <template v-slot:settings>
                <Settings :dataset="dataset" @addMeta="handleAddMeta" />
            </template>
        </TabSwitcher>

        <Properties v-if="showProperties" :files="contextMenuFiles" @onClose="handleCloseProperties" />
    </Panel>
    <AddToDatasetDialog v-if="uploadDialogOpen" @onClose="handleAddClose" :path="currentPath" :organization="dataset.org" :dataset="dataset.ds"></AddToDatasetDialog>
    <DeleteDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :files="selectedFiles"></DeleteDialog>
    <RenameDialog v-if="renameDialogOpen" @onClose="handleRenameClose" :path="renamePath"></RenameDialog>
    <NewFolderDialog v-if="createFolderDialogOpen" @onClose="handleNewFolderClose"></NewFolderDialog>
    <Alert :title="errorMessageTitle" v-if="errorDialogOpen" @onClose="handleErrorDialogClose">
        {{errorMessage}}
    </Alert>

    <Loader v-if="isBusy"></Loader>
</div>
</template>

<script>
import Header from './Header.vue';
import Settings from './Settings.vue';
import AddToDatasetDialog from './AddToDatasetDialog.vue';
import DeleteDialog from './DeleteDialog.vue';
import RenameDialog from './RenameDialog.vue';
import NewFolderDialog from './NewFolderDialog.vue';
import Message from 'commonui/components/Message.vue';
import FileBrowser from 'commonui/components/FileBrowser.vue';
import Map from 'commonui/components/Map.vue';
import Potree from 'commonui/components/Potree.vue';
import Explorer from 'commonui/components/Explorer.vue';
import Properties from 'commonui/components/Properties.vue';
import TabSwitcher from 'commonui/components/TabSwitcher.vue';
import Panel from 'commonui/components/Panel.vue';
import Markdown from 'commonui/components/Markdown.vue';
import Alert from 'commonui/components/Alert.vue';
import Loader from 'commonui/components/Loader.vue';

import icons from 'commonui/classes/icons';
import reg from '../libs/sharedRegistry';
import { setTitle } from '../libs/utils';
import { clone } from 'commonui/classes/utils';

import ddb from 'ddb';
const { pathutils, utils } = ddb;

export default {
    props: ["org", "ds"],
    components: {
        Header,
        Message,
        FileBrowser,
        Map,
        Potree,
        Explorer,
        Properties,
        TabSwitcher,
        Settings,
        Panel,
        AddToDatasetDialog,
        DeleteDialog,
        RenameDialog,
        NewFolderDialog,
        Alert,
        Loader
    },
    data: function () {
        return {
            error: "",
            mainTabs: [{
                label: 'Map',
                icon: 'map',
                key: 'map'
            },{
                label: '3D',
                icon: 'cube',
                key: 'potree'
            },{
                label: 'Files',
                icon: 'folder open',
                key: 'explorer'
            },{
                label: 'Settings',
                icon: 'wrench',
                key: 'settings'
            }],
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
            renamePath: null,
            isBusy: false,
            currentPath: null,
            errorDialogOpen: false,
            errorMessage: null,
            errorMessageTitle: null,
            readme: null,
            license: null
        };
    },
    mounted: function(){
        document.getElementById("app").classList.add("fullpage");
        setTitle(this.$route.params.ds);
    },
    beforeDestroy: function(){
        document.getElementById("app").classList.remove("fullpage");
    },
    computed: {
        selectedFiles: function () {
            return this.fileBrowserFiles.filter(f => f.selected);
        },
        contextMenuFiles: function(){
            if (this.selectedUsingFileBrowserList){
                return this.fileBrowserFiles;
            }else{
                return this.selectedFiles;
            }
        }
    },
    methods: {
        rootNodes: async function () {

            try {

                const entries = await this.dataset.info();

                // Add license / readme tabs
                if (entries.length === 1){
                    const entry = entries[0];
                    if (typeof entry.properties.readme !== 'undefined'){
                        this.addMarkdownTab(this.dataset.remoteUri(entry.properties.readme), entry.properties.readme, "Readme", "book", false);
                        this.readme = entry.properties.readme;
                    }
                    if (typeof entry.properties.license !== 'undefined'){
                        this.addMarkdownTab(this.dataset.remoteUri(entry.properties.license), entry.properties.license, "License", "balance scale", false);
                        this.license = entry.properties.license;
                    }
                }

                return entries.map(e => { return {
                        icon: icons.getForType(e.type),
                        label: pathutils.basename(e.path),
                        path: e.path,
                        expanded: true,
                        entry: e,
                        isExpandable: ddb.entry.isDirectory(e)
                    };
                });

            } catch (e) {
                this.showError(e, "Dataset");
                return [];
            }
        },        
        addMarkdownTab: function(uri, path, label, icon, activate){
            this.$refs.mainTabSwitcher.addTab({
                label,
                icon,
                key: label.toLowerCase(),
                hideLabel: false,
                component: Markdown,
                props: {
                    uri
                }
            }, {tabIndex: -1, activate }); // Add before "settings" tab
        },

        sortFiles: function() {
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
        showError: function(text, title) {
            this.errorMessage = text;
            this.errorMessageTitle = (typeof title === 'undefined' || title == null) ? "Error" : title;
            this.errorDialogOpen = true;
        },
        handleRenameClose: async function(id, newPath) {
            
            if (id == "rename") {
                if (newPath == null || newPath.length == 0) return;
                await this.renameSelectedFile(newPath);
            }

            this.renameDialogOpen = false;
        },
        handleDeleteClose: async function(id) {
            if (id == "remove") {
                await this.deleteSelectedFiles();
            }

            this.deleteDialogOpen = false;
        },
        deleteSelectedFiles: async function() {

            this.$log.info("ViewDataset.deleteSelectedFiles");

            this.isBusy = true;

            try {
                var deleted = [];

                for(var file of this.selectedFiles) {
                    await this.dataset.deleteObj(file.entry.path);
                    deleted.push(file.entry.path);
                }
                
                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => !deleted.includes(item.entry.path));

                if (deleted.includes('README.md')) {
                    this.$refs.mainTabSwitcher.removeTab("readme");
                }

                if (deleted.includes('LICENSE.md')) {
                    this.$refs.mainTabSwitcher.removeTab("license");
                }

                this.$root.$emit('deleteEntries', deleted);
           
            } catch(e) {
                this.showError(e, "Delete");
            }

            this.isBusy = false;
           
        },
        renameSelectedFile: async function(newPath) {

            this.$log.info("ViewDataset.renameSelectedFile(newPath)", newPath);

            this.isBusy = true;

            if (this.selectedFiles.length == 0) return;

            try {

                var item = this.selectedFiles[0];
                var oldPath = item.entry.path;
                await this.dataset.moveObj(oldPath, newPath);
                            
                // Let's remove both the new file path and the old one because it could be a replace
                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => item.entry.path != oldPath && item.entry.path != newPath);

                var newItem = clone(item);
                newItem.path = this.dataset.remoteUri(newPath),
                newItem.label = pathutils.basename(newPath);
                newItem.entry.path = newPath;

                // Let's add it to our explorer (we are in the same folder)
                if (pathutils.getParentFolder(newPath) == this.currentPath) 
                    this.fileBrowserFiles.push(newItem);

                // Tell filebrowser to remove the file in the old location and add to the new location
                this.$root.$emit('deleteEntries', [oldPath]);
                this.$root.$emit('addItems', [newItem]);

                this.sortFiles();

            } catch(e) {
                this.showError(e, "Rename file");
            }

            this.isBusy = false;
        },

        createFolder: async function(newPath) {
            
            this.$log.info("ViewDataset.createFolder(newPath)", newPath);

            this.isBusy = true;
            
            newPath = this.currentPath ? this.currentPath + "/" + newPath : newPath;

            try {

                var entry = await this.dataset.createFolder(newPath);

                const base = pathutils.basename(entry.path);

                this.$log.info("Creating folder", clone(entry));
                this.$log.info("Current path", this.currentPath);

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

            } catch(e) {
                this.showError(e, "Create folder");
            }

            this.isBusy = false;
        },

        handleFileSelectionChanged: function (fileBrowserFiles) {
        
            this.$log.info("ViewDataset.handleFileSelectionChanged(fileBrowserFiles)", fileBrowserFiles);

            this.fileBrowserFiles.forEach(f => f.selected = false);
            this.fileBrowserFiles = fileBrowserFiles;
        },

        handleCurrentUriChanged: function(currentUri){
            this.currentPath = currentUri != null ? utils.pathFromUri(currentUri).replace(/^\//, "") : null;
        },

        handleExplorerOpenProperties: function () {
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
        handleNewFolderClose: async function(id, newFolderPath) {

            if (id == "createFolder") {
                if (newFolderPath == null || newFolderPath.length == 0) return;
                await this.createFolder(newFolderPath);
            }

            this.createFolderDialogOpen = false;
        },
        handleAddClose: function(uploaded) {
            
            this.uploadDialogOpen = false;

            if (uploaded.length == 0) return;

            var items = [];

            for(var entry of uploaded) {

                // Don't add the same file twice
                if (this.fileBrowserFiles.filter(file => file.entry.path == entry.path) != 0)
                    continue;
                
                const base = pathutils.basename(entry.path);

                var item = {
                    icon: icons.getForType(entry.type),
                    label: base,
                    path: this.dataset.remoteUri(this.currentPath != null ? pathutils.join(this.currentPath, base) : base),//pathutils.join(this.currentPath, base),
                    entry,
                    isExpandable: ddb.entry.isDirectory(entry),
                    selected: false
                };

                // Add the file to the explorer
                this.fileBrowserFiles.push(item);
                items.push(item);
            }

            this.sortFiles();

            if (uploaded.find(item => item.path == 'README.md')) {
                this.addReadme();
            }

            if (uploaded.find(item => item.path == 'LICENSE.md')) {   
                this.addLicense();
            }

            // Only if any add is necessary, send addItems message to filebrowser
            if (items.length > 0) {
                this.$root.$emit('addItems', items);
            }

        },

        addLicense: async function() {
            this.$log.info("addLicense");
            
            var remoteUri = this.dataset.remoteUri("LICENSE.md");
            this.$root.$emit('refreshMarkdown', remoteUri);
                
            this.addMarkdownTab(remoteUri, "LICENSE.md", "License", "balance scale", true);
        },

        addReadme: async function() {
            this.$log.info("addReadme");

            var remoteUri = this.dataset.remoteUri("README.md");
            this.$root.$emit('refreshMarkdown', remoteUri);

            this.addMarkdownTab(remoteUri, "README.md", "Readme", "book", true);
        },

        handleAddMeta: async function(meta, entry) {
            this.$log.info("handleAddMeta(meta, entry)", meta, clone(entry));
            this.handleAddClose([entry]);
        },

        handleScrollTo: function(file){
            this.$refs.explorer.scrollTo(file);
        },

        handleError: function(e){
            this.showError(e, "Error");
        }
    },
    watch: {
        fileBrowserFiles: {
            deep: true,
            handler: function (newVal, oldVal) {
                const $header = this.$parent.$children[0];
                $header.selectedFiles = this.selectedFiles;
            }
        },

        selectedFiles: {
            handler: function(){
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
                            this.renamePath = this.selectedFiles[0].entry.path;
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
                            this.deleteDialogOpen = true;
                        }
                    });
                }
            }
        }
    }
}
</script>

<style scoped>
</style>

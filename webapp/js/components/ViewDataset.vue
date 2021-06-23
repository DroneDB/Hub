<template>
<div id="browser" class="cui app">
    <Message bindTo="error" />
    <Panel split="vertical" class="container main" amount="25%">
        <div class="sidebar">
            <TabSwitcher :tabs="tabs">
                <template v-slot:filebrowser>
                    <FileBrowser :rootNodes="rootNodes" 
                        @selectionChanged="handleFileSelectionChanged" 
                        @openProperties="handleFileBrowserOpenProperties"
                        @error="handleError" />
                </template>
                <template v-slot:settings>
                    <Settings :dataset="dataset" @addMeta="handleAddMeta" />
                </template>
            </TabSwitcher>
        </div>
        <TabSwitcher :tabs="mainTabs"
                    position="top"
                    buttonWidth="auto"
                    :hideSingle="true"
                    ref="mainTabSwitcher" >
            <template v-slot:map>
                <div style="padding: 4px">{{currentPath}}</div>
                <Toolbar :tools="tools" ref="toolbar" />
                <Panel split="horizontal" class="container vertical" amount="50%">                    
                    <Explorer ref="explorer" 
                            :files="fileBrowserFiles" 
                            @openProperties="handleExplorerOpenProperties" />
                    <Map :files="fileBrowserFiles" @scrollTo="handleScrollTo" />
                </Panel>
            </template>
        </TabSwitcher>
        <Properties v-if="showProperties" :files="selectedFiles" @onClose="handleCloseProperties" />
    </Panel>
    <AddToDatasetDialog v-if="uploadDialogOpen" @onClose="handleAddClose" :path="currentPath" :organization="dataset.org" :dataset="dataset.ds"></AddToDatasetDialog>
    <DeleteDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :files="selectedFiles"></DeleteDialog>
    <RenameDialog v-if="renameDialogOpen" @onClose="handleRenameClose" :path="renamePath"></RenameDialog>
    <NewFolderDialog v-if="createFolderDialogOpen" @onClose="handleNewFolderClose"></NewFolderDialog>
    <Alert title="File saved" v-if="saveOkOpen" @onClose="handleSaveOkClose">
        The file has been saved successfully
    </Alert>
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
import Explorer from 'commonui/components/Explorer.vue';
import Properties from 'commonui/components/Properties.vue';
import TabSwitcher from 'commonui/components/TabSwitcher.vue';
import Panel from 'commonui/components/Panel.vue';
import Markdown from 'commonui/components/Markdown.vue';
import Toolbar from 'commonui/components/Toolbar.vue';
import Alert from 'commonui/components/Alert.vue';
import Loader from 'commonui/components/Loader.vue';

import icons from 'commonui/classes/icons';
import reg from '../libs/sharedRegistry';
import { setTitle } from '../libs/utils';
import { clone } from 'commonui/classes/utils';

import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    props: ["org", "ds"],
    components: {
        Header,
        Message,
        FileBrowser,
        Map,
        Explorer,
        Properties,
        TabSwitcher,
        Settings,
        Panel,
        Toolbar,
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
            tabs: [{
                label: 'Browser',
                icon: 'folder open',
                key: 'filebrowser'
            },{
                label: 'Settings',
                icon: 'wrench',
                key: 'settings'
            }],
            mainTabs: [{
                label: 'Map',
                icon: 'map',
                key: 'map' 
            }],
            fileBrowserFiles: [],
            showProperties: false,
            selectedUsingFileBrowserList: false,
            dataset: reg.Organization(this.$route.params.org)
                               .Dataset(this.$route.params.ds),
            uploadDialogOpen: false,
            deleteDialogOpen: false,
            renameDialogOpen: false,
            createFolderDialogOpen: false,
            saveOkOpen: false,
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
            if (this.selectedUsingFileBrowserList) {
                return this.fileBrowserFiles;
            } else {
                return this.fileBrowserFiles.filter(f => f.selected);
            }
        },
        tools: function() {

            var tools = [{
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
                tools.push({
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
                tools.push({
                    id: 'remove',
                    title: "Remove",
                    icon: "trash alternate",
                    onClick: () => {
                        this.deleteDialogOpen = true;
                    }
                });
            }

            return tools;
        },
    },
    methods: {
        rootNodes: async function () {

            try {

            const entries = await this.dataset.info();

            // Add license / readme tabs
            if (entries.length === 1){
                const entry = entries[0];
                if (entry.meta.readme){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.readme), entry.meta.readme, "Readme", "book");
                    this.readme = entry.meta.readme;
                }
                if (entry.meta.license){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.license), entry.meta.license, "License", "balance scale");
                    this.license = entry.meta.license;
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
        addMarkdownTab: function(uri, path, label, icon, opts = {}){

            var ds = this.dataset;
            var showOk = this.showOkSave;
            var setBusy = this.setBusy;

            this.$refs.mainTabSwitcher.addTab({
                label,
                icon,
                key: label.toLowerCase(),
                hideLabel: !!opts.hideLabel,
                component: Markdown,
                props: {
                    uri
                },
                on: {
                    onSave: async function(newContent) {
                        setBusy(true);
                        await ds.writeObj(path, newContent);
                        setBusy(false);
                        showOk();
                    }
                }
            }, !!opts.activate, !!opts.prepend);
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
        showOkSave: function() {
            this.saveOkOpen = true;
        },
        setBusy: function(busy) {
            this.isBusy = busy;
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
            
            if (typeof this.currentPath !== 'undefined' && this.currentPath != null) 
                newPath = this.currentPath + "/" + newPath;

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

        handleFileSelectionChanged: function (fileBrowserFiles, path) {
        
            if (typeof fileBrowserFiles === 'undefined') return;

            this.$log.info("ViewDataset.handleFileSelectionChanged(fileBrowserFiles, path)", fileBrowserFiles, path);

            this.fileBrowserFiles.forEach(f => f.selected = (f.entry.path == path));
            this.fileBrowserFiles = fileBrowserFiles;
            this.sortFiles();
            
            this.currentPath = (typeof path !== 'undefined' && path != null) ? (ddb.utils.isDDBUri(path) ? null : path) : 
                                    (fileBrowserFiles.length > 0) ? pathutils.getParentFolder(fileBrowserFiles[0].entry.path) : null;

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
        handleSaveOkClose: function() {
            this.saveOkOpen = false;
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
                
            this.addMarkdownTab(remoteUri, "LICENSE.md", "License", "balance scale");
        },

        addReadme: async function() {
            this.$log.info("addReadme");

            var remoteUri = this.dataset.remoteUri("README.md");
            this.$root.$emit('refreshMarkdown', remoteUri);

            this.addMarkdownTab(remoteUri, "README.md", "Readme", "book");
        },

        handleAddMeta: async function(meta, entry) {
            this.$log.info("handleAddMeta(meta, entry)", meta, clone(entry));
            /*éswitch(meta) {
                case "license":

                    this.addLicense();

                    break;
                case "readme":

                    this.addReadme();

                    break;

            }*/

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
        }
    }
}
</script>

<style scoped>
</style>

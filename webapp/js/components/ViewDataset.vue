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
                        @unauthorized="handleUnauthorized" />
                </template>
                <template v-slot:settings>
                    <Settings :dataset="dataset" />
                </template>
            </TabSwitcher>
        </div>
        <TabSwitcher :tabs="mainTabs" 
                    position="top" 
                    buttonWidth="auto"
                    :hideSingle="true"
                    ref="mainTabSwitcher" >
            <template v-slot:map>
                <Toolbar :tools="tools" ref="toolbar" />
                <Panel split="horizontal" class="container vertical" amount="50%">                    
                    <Explorer ref="explorer" 
                            :files="fileBrowserFiles" 
                            @folderOpened="handleFileSelectionChanged" 
                            @openProperties="handleExplorerOpenProperties" />
                    <Map :files="fileBrowserFiles" @scrollTo="handleScrollTo" />
                </Panel>
            </template>
        </TabSwitcher>
        <Properties v-if="showProperties" :files="selectedFiles" @onClose="handleCloseProperties" />
    </Panel>
    <AddToDatasetDialog v-if="uploadDialogOpen" @onClose="uploadDialogOpen = false" :path="getPath" :organization="dataset.org" :dataset="dataset.ds"></AddToDatasetDialog>
    <DeleteDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :files="selectedFiles"></DeleteDialog>
    <RenameDialog v-if="renameDialogOpen" @onClose="handleRenameClose" :path="renamePath"></RenameDialog>
    <Alert title="File saved" v-if="saveOkOpen" @onClose="handleSaveOkClose">
        The file has been saved successfully
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

import { pathutils } from 'ddb';
import icons from 'commonui/classes/icons';
import reg from '../libs/sharedRegistry';
import { setTitle } from '../libs/utils';

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
            saveOkOpen: false,
            renamePath: null,
            isBusy: false     
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
        getPath: function() {
            if (this.fileBrowserFiles.length == 0) return null;

            var cur = this.fileBrowserFiles[0].entry.path;
            
            var idx = cur.lastIndexOf('/');

            if (idx == -1) return null;

            return cur.substr(0, idx);
            
        },
        tools: function() {

            var tools = [{
                    id: 'upload',
                    title: "Upload",
                    icon: "upload",
                    onClick: () => {
                        this.uploadDialogOpen = true;
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
            const entries = await this.dataset.info();

            // Add license / readme tabs
            if (entries.length === 1){
                const entry = entries[0];
                if (entry.meta.readme){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.readme), entry.meta.readme, "Readme", "book");
                }
                if (entry.meta.license){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.license), entry.meta.license, "License", "balance scale");
                }
            }

            return entries.map(e => { return {
                    icon: icons.getForType(e.type),
                    label: pathutils.basename(e.path),
                    path: e.path,
                    expanded: true,
                    entry: e
                };
            });
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

            this.isBusy = true;

            for(var file of this.selectedFiles)                 
                await this.dataset.deleteObj(file.entry.path);
            
            this.isBusy = false;
           
        },
        renameSelectedFile: async function(newPath) {
            this.isBusy = true;
            await this.dataset.moveObj(this.selectedFiles[0].entry.path, newPath);
            this.isBusy = false;
        },
        handleFileSelectionChanged: function (fileBrowserFiles) {
            this.fileBrowserFiles.forEach(f => f.selected = false);
            this.fileBrowserFiles = fileBrowserFiles;
        },
        handleExplorerOpenProperties: function () {
            this.showProperties = true;
            this.selectedUsingFileBrowserList = false;
        },
        handleFileBrowserOpenProperties: function () {
            this.showProperties = true;
            this.selectedUsingFileBrowserList = true;
        },
        handleCloseProperties: function () {
            this.showProperties = false;
        },
        handleSaveOkClose: function() {
            this.saveOkOpen = false;
        },

        handleScrollTo: function(file){
            this.$refs.explorer.scrollTo(file);
        },

        handleUnauthorized: function(){

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

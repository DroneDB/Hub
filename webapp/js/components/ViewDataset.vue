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

    <sui-modal v-model="uploadDialogOpen">
      <sui-modal-header>Upload new files</sui-modal-header>
      <sui-modal-content>        
        <dataset-upload :organization="dataset.org" :dataset="dataset.ds"></dataset-upload>
      </sui-modal-content>
      <sui-modal-actions>
        <sui-button positive @click.native="uploadDialogOpen=false">
          Close
        </sui-button>
      </sui-modal-actions>
    </sui-modal>
</div>
</template>

<script>
import Header from './Header.vue';
import Settings from './Settings.vue';
import Message from 'commonui/components/Message.vue';
import FileBrowser from 'commonui/components/FileBrowser.vue';
import Map from 'commonui/components/Map.vue';
import Explorer from 'commonui/components/Explorer.vue';
import Properties from 'commonui/components/Properties.vue';
import TabSwitcher from 'commonui/components/TabSwitcher.vue';
import Panel from 'commonui/components/Panel.vue';
import Markdown from 'commonui/components/Markdown.vue';
import Toolbar from 'commonui/components/Toolbar.vue';
import DatasetUpload from './DatasetUpload.vue';

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
        DatasetUpload
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
            tools: [
                {
                    id: 'upload',
                    title: "Upload",
                    icon: "upload",
                    onClick: () => {
                        this.uploadDialogOpen = true;
                    }
                },
                {
                    id: 'rename',
                    title: "Rename",
                    icon: "edit",
                    onClick: () => {
                        alert("edit");
                    }
                },
                {
                    id: 'remove',
                    title: "Remove",
                    icon: "trash alternate",
                    onClick: () => {
                        alert("remove");
                    }
                },
            ],
        }
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
        }
    },
    methods: {
        rootNodes: async function () {
            const entries = await this.dataset.info();

            // Add license / readme tabs
            if (entries.length === 1){
                const entry = entries[0];
                if (entry.meta.readme){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.readme), "Readme", "book");
                }
                if (entry.meta.license){
                    this.addMarkdownTab(this.dataset.remoteUri(entry.meta.license), "License", "balance scale");
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

        addMarkdownTab: function(uri, label, icon, opts = {}){
            this.$refs.mainTabSwitcher.addTab({
                label,
                icon,
                key: label.toLowerCase(),
                hideLabel: !!opts.hideLabel,
                component: Markdown,
                props: {
                    uri
                }
            }, !!opts.activate, !!opts.prepend);
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

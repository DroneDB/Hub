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
        <Panel split="horizontal" class="container vertical" amount="50%">
            <TabSwitcher :tabs="explorerTabs" 
                        position="top" 
                        buttonWidth="auto"
                        :hideSingle="true"
                        ref="explorerTabSwitcher" >
                <template v-slot:explorer>
                    <Explorer :files="fileBrowserFiles" @folderOpened="handleFileSelectionChanged" @openProperties="handleExplorerOpenProperties" />
                </template>
            </TabSwitcher>
            <Map :files="fileBrowserFiles" />
        </Panel>
        <Properties v-if="showProperties" :files="selectedFiles" @onClose="handleCloseProperties" />
    </Panel>
</div>
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
import Test from 'commonui/components/Test.vue';

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
        Panel
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
            explorerTabs: [{
                label: 'Files',
                icon: 'file',
                key: 'explorer' 
            }],
            fileBrowserFiles: [],
            showProperties: false,
            selectedUsingFileBrowserList: false,
            dataset: reg.Organization(this.$route.params.org)
                               .Dataset(this.$route.params.ds),

            test: "REMOVE ME!"
        }
    },
    mounted: function(){
        document.getElementById("app").classList.add("fullpage");
        setTitle(this.$route.params.ds);

        // TODO REMOVE
        setTimeout(() =>{
        this.$refs.explorerTabSwitcher.addTab({
            label: "Test",
            icon: "wrench",
            key: "test",
            component: Test,
        });
        }, 1000);
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

            return entries.map(e => { return {
                    icon: icons.getForType(e.type),
                    label: pathutils.basename(e.path),
                    path: e.path,
                    expanded: true,
                    entry: e
                };
            });
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

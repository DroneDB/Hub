<template>
    <div class="file-browser">
        <ContextMenu :items="contextMenu" />
        <div id="search-box">
            <IconField style="width: 100%;">
                <InputIcon class="fa-solid fa-magnifying-glass" />
                <InputText v-model="filterRaw" @keyup.enter="search()" placeholder="Search files" style="width: 100%;" />
            </IconField>
            <div v-if="filterRaw != null && filterRaw.length > 0" id="cancel" v-on:click="clearSearch()">
                <i class="fa-solid fa-xmark"></i>
            </div>
        </div>
        <TreeView v-show="!noResults" :nodes="nodes" @selectionChanged="handleSelectionChanged" @opened="handleOpen"
            :getChildren="getChildren" />
        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div v-if="!loading && noResults" class="no-results">
            No files found
        </div>
    </div>
</template>

<script>
import TreeView from './TreeView.vue';
import TreeNode from './TreeNode.vue';
import ContextMenu from './ContextMenu';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import env from '../dynamic/env';
import ddb from 'ddb';
import icons from '../libs/icons';
import { clone, debounce } from '../libs/utils';
import { canOpenAsText, shouldOpenAsText } from '../libs/textFileUtils';
import reg from '../libs/sharedRegistry';
import BuildManager, { BUILD_STATES } from '../libs/buildManager';
import { Features } from '../libs/features';

const { pathutils } = ddb;

export default {
    components: {
        TreeView, ContextMenu, InputText, InputIcon, IconField
    },
    props: {
        rootNodes: {
            type: Function,
            required: true
        },
        canWrite: {
            type: Boolean,
            default: false
        },
        dataset: {
            type: Object,
            default: null
        }
    },
    data: function () {
        let contextMenu = [];

        if (env.isElectron()) {
            contextMenu = contextMenu.concat([{
                label: "Open Item Location",
                icon: 'fa-regular fa-folder-open',
                isVisible: () => {
                    return this.lastSelectedNode !== null;
                },
                click: () => {
                    if (this.lastSelectedNode !== null) shell.showItemInFolder(this.lastSelectedNode.node.path);
                }
            }, {
                type: 'separator'
            }
            ]);
        }

        contextMenu = contextMenu.concat([{
            label: 'Open Item',
            icon: 'fa-regular fa-folder-open',
            isVisible: () => { return this.lastSelectedNode !== null; },
            click: () => {
                if (this.lastSelectedNode !== null) this.$emit('openItem', this.lastSelectedNode.node);
            }
        },
        {
            label: 'Open as Text',
            icon: 'fa-regular fa-file-lines',
            isVisible: () => {
                if (this.lastSelectedNode === null) return false;
                const entry = this.lastSelectedNode.node.entry;
                // Show only for non-directory files that can be opened as text
                // but are not already default text files (those open automatically)
                return !ddb.entry.isDirectory(entry) &&
                       canOpenAsText(entry) &&
                       !shouldOpenAsText(entry);
            },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('openAsText', this.lastSelectedNode.node);
                }
            }
        },
        {
            label: 'Properties',
            icon: 'fa-solid fa-circle-info',
            isVisible: () => { return this.lastSelectedNode !== null; },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("openProperties");
                }
            }
        },
        {
            label: 'Download',
            icon: 'fa-solid fa-download',
            isVisible: () => { return this.lastSelectedNode !== null; },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('downloadItems', [this.lastSelectedNode.node]);
                }
            }
        },
        {
            label: "Rename",
            icon: 'fa-solid fa-pencil',
            isVisible: () => { return this.canWrite && this.lastSelectedNode !== null; },
            accelerator: "CmdOrCtrl+M",
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("moveSelectedItems");
                }
            }
        },
        {
            label: "Transfer to Dataset",
            icon: 'fa-solid fa-right-left',
            isVisible: () => { return reg.isLoggedIn() && this.lastSelectedNode !== null && this.lastSelectedNode.node.entry.type !== ddb.entry.type.DRONEDB; },
            accelerator: "CmdOrCtrl+T",
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("transferSelectedItems");
                }
            }
        },
        {
            label: "Set as Dataset Thumbnail",
            icon: 'fa-solid fa-image',
            isVisible: () => {
                if (!this.canWrite || this.lastSelectedNode === null) return false;
                const node = this.lastSelectedNode.node;
                const type = node.entry.type;
                const isImageType = [ddb.entry.type.IMAGE, ddb.entry.type.GEOIMAGE, ddb.entry.type.GEORASTER].includes(type);
                if (!isImageType) return false;
                // Hide for files that are themselves thumbnail candidates
                const candidates = reg.getFeatureValue(Features.DATASET_THUMBNAIL_CANDIDATES);
                if (candidates && candidates.some(c => c.toLowerCase() === pathutils.basename(node.entry.path).toLowerCase())) return false;
                if (type === ddb.entry.type.GEORASTER) {
                    if (!this.dataset) return false;
                    const buildState = BuildManager.getBuildState(this.dataset, node.entry.path);
                    if (!buildState) return true;
                    return buildState.currentState !== BUILD_STATES.FAILED;
                }
                return true;
            },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("setAsCover", this.lastSelectedNode.node);
                }
            }
        },
        {
            type: 'separator',
            isVisible: () => { return this.canWrite && this.lastSelectedNode !== null && this.lastSelectedNode.node.entry.type !== ddb.entry.type.DRONEDB; },
        },
        {
            label: "Delete",
            icon: 'fa-solid fa-trash',
            accelerator: "CmdOrCtrl+D",
            isVisible: () => { return this.canWrite && this.lastSelectedNode !== null && this.lastSelectedNode.node.entry.type !== ddb.entry.type.DRONEDB; },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("deleteSelecteditems");
                }
            }
        },
        ]);

        return {
            nodes: [],
            loading: true,
            lastSelectedNode: null,
            contextMenu,
            filterRaw: null,
            filter: null,
            searchStaticPaths: null,
            noResults: false,
        };
    },
    watch: {
        filterRaw: debounce(function (newVal) {
            this.filter = newVal;
            if ((newVal == null || newVal.length === 0) && this.searchStaticPaths == null) return;
            this.search();
        }, 500)
    },
    mounted: async function () {
        await this.refreshNodes();
    },
    beforeUnmount: function () {
    },
    methods: {

        clearSearch: async function () {
            this.filter = null;
            this.searchStaticPaths = null;
            this.filterRaw = null;
            this.noResults = false;
            await this.refreshNodes();
        },

        search: async function () {

            if (this.filter == null || this.filter.length == 0) {
                await this.clearSearch();
                return;
            };

            try {

                var rootPath = this.nodes[0].path;

                var query = this.filter;

                if (!query.includes('*') && !query.includes('*'))
                    query = "*" + query + "*";

                const entries = await ddb.searchEntries(rootPath, query);

                var res = entries.filter(entry => {
                    return pathutils.basename(entry.path)[0] != "." // Hidden files/folders
                })
                    .sort((a, b) => {
                        // Folders first
                        let aDir = ddb.entry.isDirectory(a);
                        let bDir = ddb.entry.isDirectory(b);

                        if (aDir && !bDir) return -1;
                        else if (!aDir && bDir) return 1;
                        else {
                            // then filename ascending
                            return pathutils.basename(a.path.toLowerCase()) > pathutils.basename(b.path.toLowerCase()) ? 1 : -1
                        }
                    })
                    .map(entry => {
                        const base = pathutils.basename(entry.path);
                        return {
                            icon: icons.getForType(entry.type, entry.path),
                            label: base,
                            path: pathutils.join(rootPath, entry.path),
                            selected: false,
                            entry,
                            isExpandable: ddb.entry.isDirectory(entry)
                        }
                    });

                this.searchStaticPaths = {};
                this.searchStaticPaths[rootPath] = res;

                this.noResults = res.length === 0;

                await this.refreshNodes();

            } catch (e) {
                console.error("Exception", clone(e));

                if (e.message == "Unauthorized") {
                    this.$emit('error', "You are not allowed to perform this action", "Load entries");
                } else {
                    this.$emit('error', e, "Load entries");
                }

                this.nodes = [];

            }
        },

        getChildren: async function (path) {

            if (this.searchStaticPaths != null && (typeof this.searchStaticPaths[path] !== 'undefined')) {
                console.log("using static path");
                return this.searchStaticPaths[path];
            }

            try {
                const entries = await ddb.fetchEntries(path, {
                    withHash: false,
                    recursive: true,
                    maxRecursionDepth: 1,
                    stopOnError: false
                });

                var res = entries.filter(entry => {
                    return pathutils.basename(entry.path)[0] != "." // Hidden files/folders
                })
                    .sort((a, b) => {
                        // Folders first
                        let aDir = ddb.entry.isDirectory(a);
                        let bDir = ddb.entry.isDirectory(b);

                        if (aDir && !bDir) return -1;
                        else if (!aDir && bDir) return 1;
                        else {
                            // then filename ascending
                            return pathutils.basename(a.path.toLowerCase()) > pathutils.basename(b.path.toLowerCase()) ? 1 : -1
                        }
                    })
                    .map(entry => {
                        const base = pathutils.basename(entry.path);

                        return {
                            icon: icons.getForType(entry.type, entry.path),
                            label: base,
                            path: pathutils.join(path, base),
                            selected: false,
                            entry,
                            isExpandable: ddb.entry.isDirectory(entry)
                        }
                    });
                return res;
            } catch (e) {
                console.error("Exception", clone(e));

                if (e.message == "Unauthorized") {
                    this.$emit('error', "You are not allowed to perform this action", "Load entries");
                } else {
                    this.$emit('error', e, "Load entries");
                }
                return [];
            }

        },

        refreshNodes: async function () {

            this.nodes = [];
            this.loading = true;

            const rootNodes = await this.rootNodes();

            for (let i = 0; i < rootNodes.length; i++) {
                const n = rootNodes[i];

                try {
                    const entry = n.entry || (await ddb.fetchEntries(n.path, {
                        withHash: false
                    }))[0];

                    this.nodes.push({
                        icon: n.icon,
                        label: n.label,
                        path: n.path,
                        selected: false,
                        expanded: !!n.expanded,
                        root: true,
                        entry
                    });
                } catch (e) {
                    if (e.message == "Unauthorized") {
                        this.$emit('error', "You are not allowed to perform this action", "Load entries");
                    } else {
                        this.$emit('error', e, "Load entries");
                    }
                }
            }

            this.loading = false;
        },

        handleSelectionChanged: async function (selectedNodes) {

            // Keep track of nodes for "Open Item Location"
            this.lastSelectedNode = selectedNodes.length > 0 ? selectedNodes[selectedNodes.length - 1] : null;

            // If a folder is expanded and we select it,
            // we select it's children instead.
            if (selectedNodes.length === 1) {
                const n = selectedNodes[0];

                if (n.isExpandable || n.expanded) {

                    if (!n.loadedChildren) {
                        // Let's expand it
                        await n.expand();
                    }

                    n.children.forEach(c => c.selected = false);

                    this.$emit('currentUriChanged', n.node.path);
                    this.$emit('selectionChanged', n.children);
                    return;
                }
            }

            if (selectedNodes.length > 0) {
                this.$emit('currentUriChanged', pathutils.getParentFolder(selectedNodes[0].node.path));
            } else {
                this.$emit('currentUriChanged', null);
            }
            this.$emit('selectionChanged', selectedNodes.map(n => n.node));

        },
        handleOpen: function (component, sender) {

            const node = component.node;

            // Open file in default program
            if (!ddb.entry.isDirectory(node.entry)) {
                this.$emit("openItem", node);
            } else {
                // Select children of item
                if (component.children && (sender === "dblclick" || sender === "explorer")) {
                    this.$emit('currentUriChanged', node.path);
                    this.$emit('selectionChanged', component.children);
                }
            }
        }
    }
}
</script>

<style scoped>
.file-browser {
    .loading {
        margin-left: 0.125rem;
    }

    user-select: none;
    -webkit-user-select: none;

    height: 100%;
    min-width: 100%;
    min-height: 6.25rem;
    display: flex;
    flex-direction: column;
}

#search-box {

    padding: 0.5rem;
    border-bottom: 1px solid black;
    display: flex;
    width: 100%;

    .box {
        width: 100%;
        position: relative;
    }

    input {
        width: 100%;
        text-align: left;
    }

    #cancel {
        cursor: pointer;
        visibility: hidden;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        padding-right: 0.5rem;
        display: flex;
        align-items: center;
        margin-top: -0.25rem;

        .icon {
            margin: 0;
        }
    }

    #src {
        margin-left: 0.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        margin-top: -0.25rem;
    }

    .no-results {
        text-align: center;
        padding: 1rem;
        color: #999;
        font-style: italic;
    }
}
</style>

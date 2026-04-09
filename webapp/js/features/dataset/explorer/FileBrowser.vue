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
import ContextMenu from '@/components/ContextMenu';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import env from '@/dynamic/env';
import ddb from 'ddb';
import icons from '@/libs/icons';
import { clone, debounce } from '@/libs/utils';
import { buildViewerMenuItems, buildActionMenuItems, deleteItem, deleteSeparator } from '@/libs/contextMenuItems';
import { sortEntriesDirectoriesFirst } from '@/libs/entryTypes';

const { pathutils } = ddb;

export default {
    components: {
        TreeView, ContextMenu, InputText, InputIcon, IconField
    },
    emits: ['openItem', 'openAsText', 'selectionChanged', 'openProperties', 'downloadItems', 'moveSelectedItems', 'transferSelectedItems', 'setAsCover', 'deleteSelecteditems', 'error', 'currentUriChanged', 'createFolder', 'selectAll', 'shareEmbed', 'buildStarted', 'buildError', 'mergeMultispectral'],
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
        // Adapter: wrap lastSelectedNode as single-element array for the shared context menu factory
        const self = this;
        const ctx = {
            getSelectedEntries: () => {
                if (self.lastSelectedNode === null) return [];
                return [self.lastSelectedNode.node];
            },
            get canWrite() { return self.canWrite; },
            get dataset() { return self.dataset; },
            emit: (event, ...args) => {
                // For FileBrowser, some actions need to emit selectionChanged first
                const needsSelectionSync = ['openProperties', 'moveSelectedItems', 'transferSelectedItems', 'setAsCover', 'deleteSelecteditems'];
                if (needsSelectionSync.includes(event) && self.lastSelectedNode !== null) {
                    self.$emit('selectionChanged', [self.lastSelectedNode.node]);
                }
                self.$emit(event, ...args);
            },
            component: self
        };

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

        contextMenu = contextMenu.concat([
        {
            label: 'Select All',
            icon: 'fa-regular fa-square-check',
            isVisible: () => { return this.lastSelectedNode === null; },
            click: () => {
                this.$emit('selectAll');
            }
        },
        {
            label: 'Create folder',
            icon: 'fa-solid fa-folder',
            isVisible: () => { return this.canWrite && this.lastSelectedNode === null; },
            click: () => {
                this.$emit('createFolder');
            }
        },
        ...buildViewerMenuItems(ctx),
        ...buildActionMenuItems(ctx),
        deleteSeparator(ctx),
        deleteItem(ctx),
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

                var res = sortEntriesDirectoriesFirst(
                    entries.filter(entry => pathutils.basename(entry.path)[0] != "."),
                    e => pathutils.basename(e.path)
                )
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

                var res = sortEntriesDirectoriesFirst(
                    entries.filter(entry => pathutils.basename(entry.path)[0] != "."),
                    e => pathutils.basename(e.path)
                )
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
        margin-left: 0.25rem;
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
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
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
        color: var(--ddb-text-muted);
        font-style: italic;
    }
}
</style>

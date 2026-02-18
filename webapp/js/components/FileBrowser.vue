<template>
    <div class="file-browser">
        <ContextMenu :items="contextMenu" />
        <div id="search-box">
            <div class="box">
                <div id="cancel" :style="{ visibility: filterRaw != null && filterRaw.length > 0 ? 'visible' : 'hidden' }"
                    v-on:click="clearSearch()">
                    <i class="icon cancel"></i>
                </div>
                <input type="text" v-model="filterRaw" v-on:keyup.enter="search()">
            </div>
            <div id="src" v-on:click="search()"><i class="icon search"></i></div>
        </div>
        <TreeView :nodes="nodes" @selectionChanged="handleSelectionChanged" @opened="handleOpen"
            :getChildren="getChildren" />
        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
    </div>
</template>

<script>
import TreeView from './TreeView.vue';
import TreeNode from './TreeNode.vue';
import ContextMenu from './ContextMenu';
import env from '../dynamic/env';
import ddb from 'ddb';
import icons from '../libs/icons';
import { clone, debounce } from '../libs/utils';
import { canOpenAsText, shouldOpenAsText } from '../libs/textFileUtils';
import reg from '../libs/sharedRegistry';

const { pathutils } = ddb;

export default {
    components: {
        TreeView, ContextMenu
    },
    props: {
        rootNodes: {
            type: Function,
            required: true
        },
        canWrite: {
            type: Boolean,
            default: false
        }
    },
    data: function () {
        let contextMenu = [];

        if (env.isElectron()) {
            contextMenu = contextMenu.concat([{
                label: "Open Item Location",
                icon: 'open folder outline',
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
            icon: 'folder open outline',
            isVisible: () => { return this.lastSelectedNode !== null; },
            click: () => {
                if (this.lastSelectedNode !== null) this.$emit('openItem', this.lastSelectedNode.node);
            }
        },
        {
            label: 'Open as Text',
            icon: 'file alternate outline',
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
            icon: 'info circle',
            isVisible: () => { return this.lastSelectedNode !== null; },
            click: () => {
                if (this.lastSelectedNode !== null) {
                    this.$emit('selectionChanged', [this.lastSelectedNode.node]);
                    this.$emit("openProperties");
                }
            }
        },
        {
            label: "Rename",
            icon: 'pencil alternate',
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
            label: "Transfer to Dataset...",
            icon: 'exchange',
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
            type: 'separator',
            isVisible: () => { return this.canWrite && this.lastSelectedNode !== null && this.lastSelectedNode.node.entry.type !== ddb.entry.type.DRONEDB; },
        },
        {
            label: "Delete",
            icon: 'trash alternate outline',
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
        };
    },
    watch: {
        filterRaw: debounce(function (newVal) {
            this.filter = newVal;
            this.search();
        }, 500)
    },
    mounted: async function () {
        await this.refreshNodes();
    },
    beforeDestroy: function () {
    },
    methods: {

        clearSearch: async function () {
            this.filter = null;
            this.searchStaticPaths = null;
            this.filterRaw = null;
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
                            icon: icons.getForType(entry.type),
                            label: base,
                            path: pathutils.join(rootPath, entry.path),
                            selected: false,
                            entry,
                            isExpandable: ddb.entry.isDirectory(entry)
                        }
                    });

                this.searchStaticPaths = {};
                this.searchStaticPaths[rootPath] = res;

                await this.refreshNodes();

            } catch (e) {
                this.$log.error("Exception", clone(e));

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
                this.$log.info("using static path");
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
                            icon: icons.getForType(entry.type),
                            label: base,
                            path: pathutils.join(path, base),
                            selected: false,
                            entry,
                            isExpandable: ddb.entry.isDirectory(entry)
                        }
                    });
                return res;
            } catch (e) {
                this.$log.error("Exception", clone(e));

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
        margin-left: 2px;
    }

    user-select: none;
    -webkit-user-select: none;

    height: 100%;
    min-width: 100%;
    min-height: 100px;
}

#search-box {

    padding: 8px;
    border-bottom: 1px solid black;
    display: flex;

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
        right: 0px;
        top: 0;
        bottom: 0;
        padding-right: 8px;
        display: flex;
        align-items: center;
        margin-top: -4px;

        .icon {
            margin: 0;
        }
    }

    #src {
        margin-left: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        margin-top: -4px;
    }
}
</style>

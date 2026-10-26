<template>
    <div class="file-browser">
        <ContextMenu :items="contextMenu" />
        <div id="search-box">
            <IconField style="flex: 1; min-width: 0;">
                <InputIcon class="fa-solid fa-magnifying-glass" />
                <InputText v-model="filterRaw" placeholder="Search files" aria-label="Search files" style="width: 100%;" @keyup.enter="search()" />
            </IconField>
            <Button v-if="filterRaw != null && filterRaw.length > 0" icon="fa-solid fa-xmark"
                    title="Clear search" aria-label="Clear search" severity="secondary" text size="small"
                    @click="clearSearch()" />
            <Button
                :icon="sortDescending ? 'fa-solid fa-arrow-down-z-a' : 'fa-solid fa-arrow-down-a-z'"
                :title="sortDescending ? 'Sort Z→A (click to sort A→Z)' : 'Sort A→Z (click to sort Z→A)'"
                :aria-label="sortDescending ? 'Sorted Z to A, sort A to Z' : 'Sorted A to Z, sort Z to A'"
                severity="secondary" text size="small"
                style="flex-shrink: 0;"
                @click="toggleSortDirection"
            />
        </div>
        <TreeView v-show="!noResults" ref="treeView" :nodes="nodes" :get-children="getChildren"
                  :can-write="canWrite" @selection-changed="handleSelectionChanged" @opened="handleOpen" />
        <LoadingSpinner v-if="loading" />
        <div v-if="!loading && noResults" class="no-results">
            No files found
        </div>
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import TreeView from './TreeView.vue';
import ContextMenu from '@/features/dataset/explorer/ContextMenu';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import Button from 'primevue/button';
import ddb from 'ddb';
import icons from '@/libs/icons';
import { clone, debounce } from '@/libs/utils';
import { buildViewerMenuItems, buildActionMenuItems, deleteItem, deleteSeparator } from '@/libs/contextMenuItems';
import { sortEntriesDirectoriesFirst } from '@/libs/entryTypes';
import emitter from '@/libs/eventBus';
import { isPathRemoved, liveSelectionEntries } from './treeSelection';
import { useRequestScope, isAbort } from '@/composables/useRequestScope';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { usePreference } from '@/composables/usePreference';
import { isUnauthorized } from '@/libs/ddb/apiError';

const { pathutils } = ddb;

export default {
    components: {
        LoadingSpinner,
        TreeView, ContextMenu, InputText, InputIcon, IconField, Button
    },
    // Listings in flight are aborted when the browser goes away
    inject: { showBuildConfirm: { default: null } },
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
    emits: ['openItem', 'openAsText', 'selectionChanged', 'openProperties', 'downloadItems', 'moveSelectedItems', 'transferSelectedItems', 'setAsCover', 'deleteSelecteditems', 'error', 'currentUriChanged', 'createFolder', 'selectAll', 'shareEmbed', 'buildStarted', 'buildError', 'mergeMultispectral', 'maskBorders', 'extractItem', 'setCrs', 'copySelectedItems', 'cutSelectedItems', 'pasteFromClipboard'],
    setup() {
        return { requestSignal: useRequestScope().signal, sortDescending: usePreference(PREF.SORT_DESCENDING, PREF_DEFAULTS[PREF.SORT_DESCENDING]) };
    },
    data: function () {
        // Adapter: expose the tree selection to the shared context menu factory
        const self = this;
        const ctx = {
            getSelectedEntries: () => self.getTreeSelectionEntries(),
            get canWrite() { return self.canWrite; },
            get dataset() { return self.dataset; },
            get showBuildConfirm() { return self.showBuildConfirm; },
            emit: (event, ...args) => self.emitTreeAction(event, ...args),
            component: self
        };

        let contextMenu = [];

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
        }, 500),
        sortDescending: function () {
            if (this.searchStaticPaths != null) {
                this.search();
            } else {
                this.refreshNodes();
            }
        }
    },
    mounted: async function () {
        // Forget a deleted/moved node so the context menu doesn't offer actions for it.
        this._onDeleteEntries = (deleted) => {
            if (this.lastSelectedNode && isPathRemoved(this.lastSelectedNode.node.entry.path, deleted)) {
                this.lastSelectedNode = null;
            }
        };
        emitter.on('deleteEntries', this._onDeleteEntries);

        await this.refreshNodes();
    },
    beforeUnmount: function () {
        emitter.off('deleteEntries', this._onDeleteEntries);
    },
    methods: {

        // Node data of the nodes currently selected in the tree.
        getTreeSelectionEntries: function () {
            const tree = this.$refs.treeView;
            return liveSelectionEntries(tree ? tree.selectedNodes : null);
        },

        // Emits an action (context menu or keyboard) for the current tree selection.
        emitTreeAction: function (event, ...args) {
            const entries = this.getTreeSelectionEntries();

            // Copy/cut carry the tree selection explicitly: the clipboard handlers
            // otherwise read the explorer selection, which the tree never sets.
            if (event === 'copySelectedItems' || event === 'cutSelectedItems') {
                this.$emit(event, entries);
                return;
            }

            // For FileBrowser, some actions need to emit selectionChanged first
            const needsSelectionSync = ['openProperties', 'moveSelectedItems', 'transferSelectedItems', 'setAsCover', 'deleteSelecteditems'];
            if (needsSelectionSync.includes(event) && entries.length > 0) {
                this.$emit('selectionChanged', entries);
            }
            this.$emit(event, ...args);
        },

        // Ctrl/Cmd + C / X and Delete typed in the tree (routed by ViewDataset).
        // Ctrl+V is handled by the document paste listener and pastes into the
        // current folder.
        handleTreeKeyDown: function (e) {
            const entries = this.getTreeSelectionEntries();
            if (entries.length === 0) return;

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                const k = (e.key || '').toLowerCase();
                if (k === 'c') {
                    e.preventDefault();
                    this.emitTreeAction('copySelectedItems');
                } else if (k === 'x' && this.canWrite) {
                    e.preventDefault();
                    this.emitTreeAction('cutSelectedItems');
                }
                return;
            }

            if (e.key === 'Delete' && this.canWrite
                && !entries.some(f => f.entry.type === ddb.entry.type.DRONEDB)) {
                e.preventDefault();
                this.emitTreeAction('deleteSelecteditems');
            }
        },

        reportLoadError: function (e) {
            this.$emit('error', isUnauthorized(e) ? "You are not allowed to perform this action" : e, "Load entries");
        },

        toggleSortDirection: function () {
            this.sortDescending = !this.sortDescending;
            // Watcher handles the refresh
        },

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

                const res = this.nodesOf(entries, entry => pathutils.join(rootPath, entry.path));

                this.searchStaticPaths = {};
                this.searchStaticPaths[rootPath] = res;

                this.noResults = res.length === 0;

                await this.refreshNodes();

            } catch (e) {
                console.error("Exception", clone(e));

                this.reportLoadError(e);

                this.nodes = [];

            }
        },

        // Tree nodes of listed entries: folders first, hidden entries left out
        nodesOf: function (entries, pathOf) {
            return sortEntriesDirectoriesFirst(
                entries.filter(entry => pathutils.basename(entry.path)[0] != "."),
                e => pathutils.basename(e.path),
                this.sortDescending
            ).map(entry => ({
                icon: icons.getForType(entry.type, entry.path),
                label: pathutils.basename(entry.path),
                path: pathOf(entry),
                selected: false,
                entry,
                isExpandable: ddb.entry.isDirectory(entry)
            }));
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
                    stopOnError: false,
                    signal: this.requestSignal
                });

                return this.nodesOf(entries, entry => pathutils.join(path, pathutils.basename(entry.path)));
            } catch (e) {
                // The browser is gone: nobody waits for this listing
                if (isAbort(e)) return [];
                console.error("Exception", clone(e));

                this.reportLoadError(e);
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
                        withHash: false,
                        signal: this.requestSignal
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
                    this.reportLoadError(e);
                }
            }

            this.loading = false;
        },

        /**
         * Refresh the tree and then navigate back to targetPath (the path
         * relative to the dataset root, e.g. "folderA/folderB"). Expands the
         * tree level by level; if a folder along the way no longer exists, it
         * stops at the closest existing parent. When targetPath is null/empty
         * it navigates to the dataset root.
         */
        refreshAndNavigate: async function (targetPath) {
            await this.refreshNodes();
            await this.$nextTick();

            const rootTreeNodes = this.$refs.treeView?.$refs?.treeNodes;
            if (!rootTreeNodes || !rootTreeNodes.length) return;

            // The single root node represents the dataset root directory.
            let currentNode = rootTreeNodes[0];

            // Ensure the root is expanded and its children are mounted.
            if (currentNode.isExpandable) {
                await currentNode.expand();
                await this.$nextTick();
            }

            const segments = targetPath ? targetPath.split('/').filter(Boolean) : [];

            for (const segment of segments) {
                const children = (currentNode.$refs && currentNode.$refs.nodes) || [];
                const next = children.find(
                    c => c.node && c.node.entry && pathutils.basename(c.node.entry.path) === segment
                );

                // Folder no longer exists: stop at the closest existing parent.
                if (!next) break;

                if (next.isExpandable) {
                    await next.expand();
                    await this.$nextTick();
                }
                currentNode = next;
            }

            await this.handleSelectionChanged([currentNode]);
        },

        handleSelectionChanged: async function (selectedNodes) {

            // Keep track of nodes for "Open Item Location"
            this.lastSelectedNode = selectedNodes.length > 0 ? selectedNodes[selectedNodes.length - 1] : null;

            // If a folder is expanded and we select it,
            // we select it's children instead.
            if (selectedNodes.length === 1) {
                const n = selectedNodes[0];

                if (n.isExpandable || n.expanded) {

                    // Load the children without expanding: only the caret
                    // (or the arrow keys) expands a node in the tree.
                    if (!n.loadedChildren) {
                        await n.loadChildren();
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
    align-items: center;
    gap: 0.25rem;
    width: 100%;

    input {
        width: 100%;
        text-align: left;
    }


    .no-results {
        text-align: center;
        padding: 1rem;
        color: var(--ddb-text-muted);
        font-style: italic;
    }
}
</style>

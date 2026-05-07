<template>
    <div class="tree-node">
        <div class="entry" :draggable="true" @dragstart="startDrag($event, node)" @drop="onDrop($event, node)"
            @dragover="onDragOver($event)" @dragenter="onDragEnter($event)" @dragleave="onDragLeave($event)"
            @click="onClick" @dblclick="handleOpenDblClick" @contextmenu="onRightClick"
            :class="{ selected: selected, 'drop-target': isDropTarget }">
            <i class="fa-solid fa-circle-notch fa-spin" v-if="loading" />
            <i class="icon" @click="handleOpenCaret" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'"
                v-if="isExpandable && !loading && (!empty || !loadedChildren)" />
            <i class="icon nonexistent" v-if="!isExpandable || (empty && loadedChildren)" />

            <i class="icon" :class="node.icon" />
            <div class="text">{{ node.label }}</div>
        </div>        <div class="children" v-show="expanded">
            <TreeNode v-for="(node, index) in children" :key="'N,' + node.path + ',' + index" :node="node" ref="nodes"
                :getChildren="getChildren" @selected="(n, btn) => $emit('selected', n, btn)"
                @opened="(n, sender) => $emit('opened', n, sender)" />
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import { clone } from '@/libs/utils';
import { startInternalDrag, isInternalDrag, emitMove } from '@/libs/dragDropUtils';
import ddb from 'ddb';
import emitter from '@/libs/eventBus';
const { pathutils } = ddb;

export default {
    emits: ['opened', 'selected'],
    props: {
        node: {
            type: Object
        },
        getChildren: {
            type: Function,
            required: true
        }
    },
    components: { TreeNode: defineAsyncComponent(() => import('./TreeNode.vue')) },
    data: function () {
        return {
            children: [],
            loading: false,
            loadedChildren: false,
            selected: false,
            expanded: false,
            isDropTarget: false,
        }
    },
    computed: {
        isExpandable: function () {
            return ddb.entry.isDirectory(this.node.entry);
        },
        empty: function () {
            return this.children.length === 0;
        }

    },
    mounted: async function () {
        if (this.node.expanded) {
            await this.handleOpenDblClick(new CustomEvent('click'));
        }

        this._onDeleteEntries = async (deleted) => {

            var els = this.children.filter(item => deleted.includes(item.entry.path));

            // It's not our business
            if (els.length == 0)
                return;

            this.children = this.children.filter(item => !deleted.includes(item.entry.path));

        };
        emitter.on('deleteEntries', this._onDeleteEntries);

        this._onFolderOpened = async (tree) => {

            var ourPath = this.node.entry.path;

            if (tree.length === 0)
                return;

            if (tree.includes(ourPath))
                await this.expand();

            if (tree[tree.length - 1] === ourPath ||
                (tree[tree.length - 1] === "/" && this.node.root))
                this.$emit('opened', this, "explorer");

        };
        emitter.on('folderOpened', this._onFolderOpened);

        this._onAddItems = async (items) => {

            if (items.length == 0)
                return;

            if (!this.isExpandable)
                return;

            var parentPath = pathutils.getParentFolder(items[0].entry.path);

            if (parentPath == null) {
                if (!this.node.root) {
                    return;
                }
            } else {
                if (parentPath != this.node.entry.path) {
                    return;
                }
            }

            // Let's remove first the duplicates
            this.children = this.children.filter(ch => !items.find(i => i.entry.path === ch.entry.path));

            // Add new items
            for (var item of items) {
                this.children.push(item);
            }

            if (!this.expanded) {
                await this.expand();
                this.$emit('opened', this, "addItems");
            }

            this.sortChildren();

        };
        emitter.on('addItems', this._onAddItems);

        this._onMoveItemInit = (payload) => {
            // Backwards-compatible: accept both the legacy raw destItem (no
            // `destItem` key) and the new { destItem, primaryPath } shape.
            const destItem = payload && payload.destItem ? payload.destItem : payload;
            const primaryPath = payload && payload.primaryPath ? payload.primaryPath : null;
            if (!this.selected) return;
            this.selected = false;
            // Skip if this node is the primary dataTransfer source (already moved by emitMove).
            if (primaryPath != null && this.node.entry.path === primaryPath) return;
            console.log(`node '${this.node.entry.path}' calling moveItem to '${destItem.entry.path}'`);
            emitMove(this.node, destItem);
        };
        emitter.on('moveItemInit', this._onMoveItemInit);

    },
    beforeUnmount: function () {
        emitter.off('deleteEntries', this._onDeleteEntries);
        emitter.off('folderOpened', this._onFolderOpened);
        emitter.off('addItems', this._onAddItems);
        emitter.off('moveItemInit', this._onMoveItemInit);
    },
    methods: {
        onClick: function (e) {
            Keyboard.updateState(e);
            this.$emit('selected', this, Mouse.LEFT);
        },
        onRightClick: function (e) {
            Keyboard.updateState(e);
            this.$emit('selected', this, Mouse.RIGHT);
        },
        handleOpenDblClick: async function (e) {
            e.preventDefault();
            return this._handleOpen(e, "dblclick");
        },
        handleOpenCaret: async function (e) {
            return this._handleOpen(e, "caret");
        },

        startDrag(evt, item) {

            evt.stopPropagation();

            startInternalDrag(evt, item);

            this.selected = true;
            console.log(`drag start '${item.entry.path}'`);
        },

        onDragEnter(evt) {
            if (!isInternalDrag(evt)) return;
            if (!ddb.entry.isDirectory(this.node.entry)) return;
            evt.preventDefault();
            evt.stopPropagation();
            this.isDropTarget = true;
        },

        onDragOver(evt) {
            if (!isInternalDrag(evt)) return;
            if (!ddb.entry.isDirectory(this.node.entry)) return;
            evt.preventDefault();
            evt.stopPropagation();
        },

        onDragLeave(evt) {
            this.isDropTarget = false;
        },

        onDrop(evt, item) {
            this.isDropTarget = false;
            if (!isInternalDrag(evt)) return;
            evt.stopPropagation();

            // Read the dragged source from dataTransfer. This works for both
            // in-tree drags (TreeNode -> TreeNode) and cross-component drags
            // (Explorer/FileBrowser -> TreeNode), since startInternalDrag is
            // used in every drag origin.
            let sourceItem;
            try {
                sourceItem = JSON.parse(evt.dataTransfer.getData('item'));
            } catch {
                return;
            }
            if (!sourceItem || !sourceItem.entry) return;

            emitMove(sourceItem, item);

            // Multi-selection in tree: every other selected TreeNode (set by
            // its own startDrag or click) self-emits a moveItem with itself
            // as source and `item` as destination. Skip the primary source
            // to avoid a duplicate.
            emitter.emit('moveItemInit', { destItem: item, primaryPath: sourceItem.entry.path });
        },

        sortChildren: function () {
            this.children = this.children.sort((n1, n2) => {

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

        loadChildren: async function () {

            this.loading = true;

            this.children = await this.getChildren(this.node.path);
            this.loadedChildren = true;

            this.loading = false;
        },

        expand: async function () {

            if (!this.isExpandable) {
                console.log("Only folders can be expanded");
                return;
            }

            if (!this.loadedChildren)
                await this.loadChildren();

            this.expanded = true;

        },

        _handleOpen: async function (e, sender) {

            e.stopPropagation();
            if (Keyboard.isModifierPressed()) return; // We are selecting

            if (sender == "caret") {
                if (!this.expanded) {
                    await this.expand();
                    this.$emit('opened', this, sender);
                } else {
                    this.expanded = false;
                }
            } else {
                await this.expand(sender);
                this.$emit('opened', this, sender);
            }


        }
    }
}
</script>

<style scoped>
.tree-node {
    .entry {
        padding: 0.25rem;
        display: inline-block;
        white-space: nowrap;
        min-width: 100%;
        user-select: none;

        &:hover {
            background: var(--ddb-bg-secondary);
            cursor: pointer;
        }

        &:focus,
        &:active {
            background: var(--ddb-border);
        }

        &.selected {
            background: var(--ddb-border);
        }

        &.drop-target {
            outline: 2px dashed var(--ddb-color-primary, #1976d2);
            outline-offset: -2px;
            background: var(--ddb-bg-hover);
        }
    }

    @media only screen and (max-width: 767px) {
        .entry {
            padding: 0.25rem;
        }
    }

    i {
        display: inline-block;
        margin-top: var(--ddb-border-width);
        margin-right: var(--ddb-spacing-xs);
        width: 1.3rem;
        text-align: center;
    }

    i.nonexistent {
        width: 1rem;
    }

    .text {
        display: inline-block;
        margin-left: 0.25rem;
        white-space: nowrap;
        word-break: keep-all;
    }

    .circle.notch {
        margin-left: -0.25rem;
        margin-top: var(--ddb-spacing-xs);
    }

    .children {
        margin-left: 1rem;
    }
}
</style>

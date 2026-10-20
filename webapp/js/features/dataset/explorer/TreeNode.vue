<template>
    <div class="tree-node">
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -- the tree owns the keyboard (arrows, Enter) and points at this item with aria-activedescendant -->
        <div :id="domId" class="entry" role="treeitem" tabindex="-1"
             :aria-selected="selected" :aria-expanded="isExpandable ? expanded : undefined"
             :draggable="!node.root && canWrite"
             :class="{ selected: selected, 'drop-target': dropTargetPath === node.entry.path }"
             @dragstart="onDragStart($event, node)"
             @drop="onItemDrop($event, node)"
             @dragover="itemDragOver($event, node)"
             @dragenter="itemDragEnter($event, node)"
             @dragleave="itemDragLeave($event, node)" @click="onClick" @dblclick="handleOpenDblClick"
             @contextmenu="onRightClick">
            <i v-if="loading" class="fa-solid fa-circle-notch fa-spin" />
            <i v-if="isExpandable && !loading && (!empty || !loadedChildren)" class="icon" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'"
               aria-hidden="true" @click="handleOpenCaret" />
            <i v-if="!isExpandable || (empty && loadedChildren)" class="icon nonexistent" />

            <i class="icon" :class="node.icon" />
            <div class="text">{{ node.label }}</div>
        </div>
        <div v-show="expanded" class="children" role="group">
            <TreeNode v-for="(child, index) in children" :key="'N,' + child.path + ',' + index" ref="nodes" :node="child"
                      :get-children="getChildren" :can-write="canWrite" @selected="(n, btn) => $emit('selected', n, btn)"
                      @opened="(n, sender) => $emit('opened', n, sender)" />
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import { startInternalDrag, isInternalDrag } from '@/libs/dragDropUtils';
import ddb from 'ddb';
import { useItemDragDrop } from '@/composables/useDragDrop';
const { pathutils } = ddb;

export default {
    components: { TreeNode: defineAsyncComponent(() => import('./TreeNode.vue')) },
    inject: { treeRegistry: { default: null } },
    props: {
        node: {
            type: Object,
            required: true
        },
        getChildren: {
            type: Function,
            required: true
        },
        // Gates internal drops (useItemDragDrop)
        canWrite: {
            type: Boolean,
            default: true
        }
    },
    emits: ['opened', 'selected'],
    setup(props) {
        return useItemDragDrop(props);
    },
    data: function () {
        return {
            children: [],
            loading: false,
            loadedChildren: false,
            selected: false,
            expanded: false,
        }
    },
    computed: {
        // Target of the tree's aria-activedescendant
        domId: function () {
            return 'tree-node-' + this.$.uid;
        },
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

        this.treeRegistry?.add(this);
    },
    beforeUnmount: function () {
        this.treeRegistry?.remove(this);
    },
    methods: {
        // ---- called by TreeView, which listens to the file-system events once for all nodes ----

        removeChildren: function (deleted) {
            if (!this.children.some(item => deleted.includes(item.entry.path))) return;
            this.children = this.children.filter(item => !deleted.includes(item.entry.path));
        },

        // `tree` lists the folders from the root to the one just opened (pathutils.getTree)
        openFromTree: async function (tree) {
            const ourPath = this.node.entry.path;
            if (tree.length === 0) return;
            if (tree.includes(ourPath)) await this.expand();
            if (tree[tree.length - 1] === ourPath || (tree[tree.length - 1] === "/" && this.node.root)) {
                this.$emit('opened', this, "explorer");
            }
        },

        addItems: async function (items) {
            if (items.length == 0 || !this.isExpandable) return;

            const parentPath = pathutils.getParentFolder(items[0].entry.path);
            if (parentPath == null ? !this.node.root : parentPath != this.node.entry.path) return;

            // Replace duplicates, then add
            this.children = this.children.filter(ch => !items.find(i => i.entry.path === ch.entry.path));
            this.children.push(...items);

            if (!this.expanded) {
                await this.expand();
                this.$emit('opened', this, "addItems");
            }

            this.sortChildren();
        },

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

        /**
         * Drag start on a TreeNode entry. Stop propagation so a parent
         * TreeNode does not also try to start a drag, mark this node as
         * (multi-)selected, then delegate dataTransfer setup to the shared
         * helper.
         */
        onDragStart(evt, item) {
            evt.stopPropagation();
            startInternalDrag(evt, item);
            this.selected = true;
        },

        /**
         * Drop on a TreeNode entry. Reuses the mixin's `onDrop` (validates
         * internal drag, gates on canWrite, asks the page to move) and then has
         * the tree move the other selected nodes too (multi-selection drag).
         */
        onItemDrop(evt, item) {
            // Capture source path before mixin clears state.
            let primaryPath = null;
            if (isInternalDrag(evt)) {
                try {
                    const src = JSON.parse(evt.dataTransfer.getData('item'));
                    primaryPath = src && src.entry ? src.entry.path : null;
                } catch { /* ignore */ }
            }

            this.onDrop(evt, item);

            // The other selected nodes of the tree move with it
            if (primaryPath != null) this.treeRegistry?.moveSelected(item, primaryPath);
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

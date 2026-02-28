<template>
    <div class="tree-node">
        <div class="entry" draggable @dragstart="startDrag($event, node)" @drop="onDrop($event, node)" @dragover.prevent
            @dragenter.prevent @click="onClick" @dblclick="handleOpenDblClick" @contextmenu="onRightClick"
            :class="{ selected: selected }">
            <i class="fa-solid fa-circle-notch fa-spin" v-if="loading" />
            <i class="icon" @click="handleOpenCaret" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'"
                v-if="isExpandable && !loading && (!empty || !loadedChildren)" />
            <i class="icon nonexistant" v-if="!isExpandable || (empty && loadedChildren)" />

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
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import ddb from 'ddb';
import emitter from '../libs/eventBus';
const { pathutils } = ddb;

export default {
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

        this._onMoveItemInit = (destItem) => {
            if (this.selected) {
                this.selected = false;
                console.log(`node '${this.node.entry.path}' calling moveItem to '${destItem.entry.path}'`);
                emitter.emit('moveItem', this.node, destItem);
            }
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

            evt.dataTransfer.dropEffect = 'move';
            evt.dataTransfer.effectAllowed = 'move';
            var data = JSON.stringify(clone(item));
            evt.dataTransfer.setData('item', data);

            this.selected = true;
            console.log(`drag start '${item.entry.path}'`);
        },

        onDrop(evt, item) {
            const sourceItem = JSON.parse(evt.dataTransfer.getData('item'));
            console.log(`dropping '${sourceItem.entry.path}' onto '${item.entry.path}'`);

            emitter.emit('moveItemInit', item);
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
        padding: 0.125rem 0.25rem 0.125rem 0.25rem;
        display: inline-block;
        white-space: nowrap;
        min-width: 100%;
        user-select: none;

        &:hover {
            background: #eee;
            cursor: pointer;
        }

        &:focus,
        &:active {
            background: #dadada;
        }

        &.selected {
            background: #ddd;
        }
    }

    @media only screen and (max-width: 767px) {
        .entry {
            padding: 0.25rem;
        }
    }

    i {
        display: inline-block;
        margin-top: 0.0625rem;
        margin-right: 0.125rem;
        width: 1em;
        text-align: center;
    }

    i.nonexistant {
        width: 1em;
    }

    .text {
        display: inline-block;
        margin-left: 0.25rem;
        white-space: nowrap;
        word-break: keep-all;
    }

    .circle.notch {
        margin-left: -0.3125rem;
        margin-top: 0.125rem;
    }

    .children {
        margin-left: 1rem;
    }
}
</style>

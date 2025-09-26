<template>
    <div class="tree-node">
        <div class="entry" draggable @dragstart="startDrag($event, node)" @drop="onDrop($event, node)" @dragover.prevent
            @dragenter.prevent @click="onClick" @dblclick="handleOpenDblClick" @contextmenu="onRightClick"
            :class="{ selected: selected }">
            <i class="icon circle notch spin" v-if="loading" />
            <i class="icon" @click="handleOpenCaret" :class="expanded ? 'caret down' : 'caret right'"
                v-if="isExpandable && !loading && (!empty || !loadedChildren)" />
            <i class="icon nonexistant" v-if="!isExpandable || (empty && loadedChildren)" />

            <i class="icon" :class="node.icon" />
            <div class="text">{{ node.label }}</div>
        </div>        <div class="children" v-show="expanded">
            <TreeNode v-for="(node, index) in children" :key="'N,' + node.path + ',' + index" :node="node" ref="nodes"
                :getChildren="getChildren" @selected="$emit('selected', $event, arguments[1])"
                @opened="$emit('opened', $event, arguments[1])" />
        </div>
    </div>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import ddb from 'ddb';
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
    components: { TreeNode: () => import('./TreeNode.vue') },
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

        this.$root.$on('deleteEntries', async (deleted) => {

            var els = this.children.filter(item => deleted.includes(item.entry.path));

            // It's not our business
            if (els.length == 0)
                return;

            this.children = this.children.filter(item => !deleted.includes(item.entry.path));

        });

        this.$root.$on('folderOpened', async (tree) => {

            var ourPath = this.node.entry.path;

            if (tree.length === 0)
                return;

            if (tree.includes(ourPath))
                await this.expand();

            if (tree[tree.length - 1] === ourPath ||
                (tree[tree.length - 1] === "/" && this.node.root))
                this.$emit('opened', this, "explorer");

        });

        this.$root.$on('addItems', async (items) => {

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

        });

        this.$root.$on('moveItemInit', (destItem) => {
            if (this.selected) {
                this.selected = false;
                this.$log.info(`node '${this.node.entry.path}' calling moveItem to '${destItem.entry.path}'`);
                this.$root.$emit('moveItem', this.node, destItem);
            }
        });

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
            this.$log.info(`drag start '${item.entry.path}'`);
        },

        onDrop(evt, item) {
            const sourceItem = JSON.parse(evt.dataTransfer.getData('item'));
            this.$log.info(`dropping '${sourceItem.entry.path}' onto '${item.entry.path}'`);

            this.$root.$emit('moveItemInit', item);
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
                this.$log.info("Only folders can be expanded");
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
        padding: 2px 4px 2px 4px;
        display: inline-block;
        white-space: nowrap;
        min-width: 100%;

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
            padding: 4px;
        }
    }

    i {
        display: inline-block;
        margin-top: 1px;
        margin-right: 0px;
    }

    .text {
        display: inline-block;
        margin-left: 2px;
        white-space: nowrap;
        word-break: keep-all;
    }

    .circle.notch {
        margin-left: -5px;
        margin-top: 2px;
    }

    .children {
        margin-left: 16px;
    }
}
</style>

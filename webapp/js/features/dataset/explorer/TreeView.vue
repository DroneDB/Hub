<template>
    <div class="tree-view" ref="treeView"
        :class="{ dropping }"
        @drop="explorerDropHandler($event)"
        @dragenter="explorerDragEnter($event)"
        @dragleave="explorerDragLeave($event)"
        @dragover.prevent>
        <TreeNode v-for="(node, index) in nodes" :node="node" :key="node.path + ',' + index" ref="treeNodes"
            :canWrite="canWrite"
            @selected="handleSelection" @opened="handleOpen" :getChildren="getChildren" />
    </div>
</template>

<script>
import TreeNode from './TreeNode.vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import { dragDropMixin } from '@/libs/dragDropUtils';
import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    components: {
        TreeNode
    },
    mixins: [dragDropMixin],
    emits: ['opened', 'selectionChanged'],
    props: {
        nodes: {
            type: Array,
            required: true
        },
        getChildren: {
            type: Function,
            required: true
        },
        // dragDropMixin contract
        canWrite: {
            type: Boolean,
            default: false
        },
        // currentPath = null means "dataset root": dropping on the empty
        // area of the tree moves the source into the dataset root.
        currentPath: {
            type: String,
            default: null
        }
    },
    data() {
        return {
            dropping: false
        };
    },

    mounted: function () {
        this.selectedNodes = [];
        this.rangeStartNode = null;
    },
    methods: {
        handleOpen: function (component, sender) {
            if (!component) return;
            this.$emit("opened", component, sender);
        },
        handleSelection: async function (node, mouseBtn) {

            if (!node) return; // Top

            if (node.node.unselectable) return; // Not selectable
            if (mouseBtn === Mouse.RIGHT && this.selectedNodes.length > 1) return; // Prevent accidental deselection

            // Multiple selection
            if (Keyboard.isCtrlPressed()) {
                const id = this.selectedNodes.indexOf(node);
                if (id !== -1) {
                    node.selected = false;
                    this.selectedNodes.splice(id, 1);
                } else {
                    node.selected = true;
                    this.selectedNodes.push(node);
                }
            } else if (Keyboard.isShiftPressed() && this.selectedNodes.length > 0 && this.rangeStartNode) {
                // Range selection
                this.selectedNodes.forEach(n => n.selected = false);
                this.selectedNodes = [];

                this.selectRange(this.rangeStartNode, node, this.$refs.treeNodes);
            } else {
                // Single selection
                this.selectedNodes.forEach(n => n.selected = false);
                node.selected = true;
                this.selectedNodes = [node];
                this.rangeStartNode = node;
            }

            this.$emit("selectionChanged", this.selectedNodes, this.selectedNodes.length > 0 ? pathutils.getParentFolder(this.selectedNodes[0].node.entry.path) : null);
        },

        selectRange: function (low, high, nodes) {
            if (!nodes) return true;
            if (low.$el.offsetTop > high.$el.offsetTop) {
                [low, high] = [high, low];
            }

            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];

                if (n.$el.offsetTop >= low.$el.offsetTop && n.$el.offsetTop <= high.$el.offsetTop) {
                    if (!n.selected) {
                        n.selected = true;
                        this.selectedNodes.push(n);
                    }
                }

                if (n.$el.offsetTop > high.$el.offsetTop) {
                    return false;
                }

                if (!this.selectRange(low, high, n.$refs.nodes)) return false;
            }

            return true;
        }
    }
}
</script>

<style scoped>
.tree-view {
    padding-bottom: 0.5rem;
    padding-top: 0.5rem;
    user-select: none;
    overflow-x: scroll;
    height: 100%;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;

    &.dropping {
        background-color: var(--ddb-bg-hover);
        box-shadow: inset 0 0 var(--ddb-spacing-sm) var(--ddb-spacing-xs) var(--ddb-text-muted);
    }
}
</style>
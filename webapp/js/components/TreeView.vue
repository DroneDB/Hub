<template>
    <div class="tree-view" ref="treeView">
        <TreeNode v-for="node in nodes" :node="node" :key="node.path" ref="treeNodes" @selected="handleSelection"
            @opened="handleOpen" :getChildren="getChildren" />
    </div>
</template>

<script>
import TreeNode from './TreeNode.vue';
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    components: {
        TreeNode
    },
    props: {
        nodes: {
            type: Array,
            required: true
        },
        getChildren: {
            type: Function,
            required: true
        }
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

                this.selectRange(this.rangeStartNode, node, this.$refs.treeView.__vue__.$children);
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

                if (!this.selectRange(low, high, n.$children)) return false;
            }

            return true;
        }
    }
}
</script>

<style scoped>
.tree-view {
    padding-bottom: 8px;
    padding-top: 8px;
    user-select: none;
}
</style>
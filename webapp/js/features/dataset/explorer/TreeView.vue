<template>
    <div class="tree-view" ref="treeView"
        tabindex="0"
        :class="{ dropping }"
        @keydown="onKeyDown"
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
            dropping: false,
            focusedNode: null
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

            this.focusedNode = node;

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
        },

        // Builds a flat, top-to-bottom ordered list of the currently visible
        // tree node components, tracking each one's parent so Left-arrow can
        // walk back up the hierarchy.
        buildVisibleNodes: function () {
            const out = [];
            const walk = (nodes, parent) => {
                if (!nodes) return;
                for (const n of nodes) {
                    out.push({ component: n, parent });
                    if (n.expanded && n.$refs && n.$refs.nodes) {
                        walk(n.$refs.nodes, n);
                    }
                }
            };
            walk(this.$refs.treeNodes, null);
            return out;
        },

        // Single-selects a node from keyboard navigation and scrolls it into
        // view, mirroring the single-selection branch of handleSelection.
        focusNode: function (node) {
            if (!node) return;

            this.selectedNodes.forEach(n => n.selected = false);
            node.selected = true;
            this.selectedNodes = [node];
            this.rangeStartNode = node;
            this.focusedNode = node;

            if (node.$el && typeof node.$el.scrollIntoView === 'function') {
                node.$el.scrollIntoView({ block: 'nearest' });
            }

            this.$emit("selectionChanged", this.selectedNodes, pathutils.getParentFolder(node.node.entry.path));
        },

        onKeyDown: function (e) {
            // Don't hijack typing (e.g. inline rename) or shortcut combos.
            const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].indexOf(e.key) === -1) return;

            const visible = this.buildVisibleNodes();
            if (visible.length === 0) return;

            const index = this.focusedNode
                ? visible.findIndex(v => v.component === this.focusedNode)
                : -1;
            const current = index >= 0 ? visible[index] : null;

            switch (e.key) {
                case 'ArrowDown': {
                    e.preventDefault();
                    const next = index < 0 ? visible[0] : visible[Math.min(index + 1, visible.length - 1)];
                    this.focusNode(next.component);
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();
                    const prev = index <= 0 ? visible[0] : visible[index - 1];
                    this.focusNode(prev.component);
                    break;
                }
                case 'ArrowRight': {
                    e.preventDefault();
                    const node = current ? current.component : visible[0].component;
                    if (!current) {
                        this.focusNode(node);
                        break;
                    }
                    if (node.isExpandable) {
                        if (!node.expanded) {
                            node.expand();
                        } else {
                            const refreshed = this.buildVisibleNodes();
                            const i = refreshed.findIndex(v => v.component === node);
                            if (i >= 0 && i + 1 < refreshed.length && refreshed[i + 1].parent === node) {
                                this.focusNode(refreshed[i + 1].component);
                            }
                        }
                    }
                    break;
                }
                case 'ArrowLeft': {
                    e.preventDefault();
                    if (!current) {
                        this.focusNode(visible[0].component);
                        break;
                    }
                    const node = current.component;
                    if (node.expanded && node.isExpandable) {
                        node.expanded = false;
                    } else if (current.parent) {
                        this.focusNode(current.parent);
                    }
                    break;
                }
            }
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
    outline: none;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;

    &:focus-visible {
        box-shadow: inset 0 0 0 2px rgba(var(--ddb-primary-rgb), 0.5);
    }

    &.dropping {
        background-color: var(--ddb-bg-hover);
        box-shadow: inset 0 0 var(--ddb-spacing-sm) var(--ddb-spacing-xs) var(--ddb-text-muted);
    }
}
</style>
<template>
    <Window title="Select Destination Folder" id="folderPicker" @onClose="cancel" modal maxWidth="520px" fixedSize>
        <div class="folder-picker">
            <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                {{ errorMessage }}
            </PrimeMessage>

            <div class="selected-path">
                <i class="fa-solid fa-folder-open"></i>
                <span>{{ selectedPath && selectedPath.length > 0 ? selectedPath : 'root folder' }}</span>
            </div>

            <div class="tree-container">
                <Tree :value="nodes" selectionMode="single" :metaKeySelection="false"
                    :selectionKeys="selectionKeys" @update:selectionKeys="selectionKeys = $event"
                    :expandedKeys="expandedKeys" @update:expandedKeys="expandedKeys = $event"
                    :loading="loading" loadingMode="icon" scrollHeight="320px"
                    @node-select="onNodeSelect" @node-expand="onNodeExpand">
                    <template #empty>
                        <span class="empty-msg">No folders</span>
                    </template>
                </Tree>
            </div>

            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button @click="cancel" severity="secondary" label="Cancel" />
                <Button @click="confirm" severity="primary" icon="fa-solid fa-check" label="Select Folder" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Tree from 'primevue/tree';
import ddb from 'ddb';

const { pathutils } = ddb;
const ROOT_KEY = '/';

export default {
    components: { Window, Button, PrimeMessage, Tree },

    props: {
        dataset: { type: Object, required: true },
        initialPath: { type: String, default: '' }
    },
    emits: ['onClose'],

    data() {
        return {
            nodes: [],
            selectionKeys: {},
            expandedKeys: {},
            selectedPath: this.initialPath || '',
            loading: false,
            errorMessage: null
        };
    },

    async mounted() {
        this.loading = true;
        try {
            const rootChildren = await this.fetchFolders('');
            const rootNode = {
                key: ROOT_KEY,
                label: '/ (dataset root)',
                data: { path: '' },
                icon: 'fa-regular fa-folder-open',
                leaf: rootChildren.length === 0,
                children: rootChildren,
                loading: false,
                selectable: true,
                _loaded: true
            };
            this.nodes = [rootNode];
            this.expandedKeys = { [ROOT_KEY]: true };
            // Highlight the root only when no initial path is supplied.
            this.selectionKeys = this.initialPath ? {} : { [ROOT_KEY]: true };
        } catch (e) {
            this.errorMessage = (e && e.message) ? e.message : String(e);
        } finally {
            this.loading = false;
        }
    },

    methods: {
        isDirectory(entry) {
            return ddb.entry.isDirectory(entry);
        },

        // True for selectable folders: plain directories only, excluding the
        // reserved DroneDB database folder (.ddb / DRONEDB type).
        isSelectableFolder(entry) {
            if (!entry || entry.type !== ddb.entry.type.DIRECTORY) return false;
            const p = (entry.path || '').replace(/^\/+/, '');
            return !p.startsWith('.ddb');
        },

        async fetchFolders(path) {
            const entries = await this.dataset.list(path && path.length ? path : undefined);
            return (entries || [])
                .filter(e => this.isSelectableFolder(e))
                .map(e => ({
                    key: e.path,
                    label: pathutils.basename(e.path),
                    data: { path: e.path },
                    icon: 'fa-regular fa-folder',
                    leaf: false,
                    children: [],
                    loading: false,
                    selectable: true,
                    _loaded: false
                }))
                .sort((a, b) => a.label.toLowerCase() > b.label.toLowerCase() ? 1 : -1);
        },

        async onNodeExpand(node) {
            if (node._loaded) return;
            node.loading = true;
            try {
                const children = await this.fetchFolders(node.data.path);
                node.children = children;
                node.leaf = children.length === 0;
                node._loaded = true;
            } catch (e) {
                this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                node.loading = false;
                // Force the Tree to re-render the mutated subtree.
                this.nodes = [...this.nodes];
            }
        },

        onNodeSelect(node) {
            this.selectedPath = node.data.path;
        },

        confirm() {
            this.$emit('onClose', 'select', this.selectedPath || '');
        },

        cancel() {
            this.$emit('onClose', 'cancel');
        }
    }
};
</script>

<style scoped>
.folder-picker {
    min-width: 360px;
}

.selected-path {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
    background: var(--p-surface-100, #f4f4f4);
    border-radius: var(--p-border-radius, 6px);
    font-size: 0.9rem;
    word-break: break-all;
}

.tree-container {
    border: 1px solid var(--p-surface-300, #ddd);
    border-radius: var(--p-border-radius, 6px);
    overflow: hidden;
}

.empty-msg {
    color: var(--p-text-muted-color, #888);
    font-size: 0.85rem;
}
</style>

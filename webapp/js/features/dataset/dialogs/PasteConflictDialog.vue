<template>
    <Window title="Paste Conflict" id="paste-conflict" @onClose="cancel" modal sizeClass="dialog-md" fixedSize>
        <div class="paste-conflict-content">
            <p>
                <strong>{{ items.length }}</strong> file<span v-if="items.length !== 1">s</span>
                in the destination folder have the same name as items being pasted.
                How would you like to proceed?
            </p>
            <ul class="file-list">
                <li v-for="it in items" :key="it.path" class="file-item">
                    <i class="fa-solid fa-triangle-exclamation amber"></i>
                    <span class="file-path">{{ basename(it.path) }}</span>
                </li>
            </ul>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100 flex-wrap">
            <Button @click="cancel" severity="secondary" label="Cancel" />
            <Button @click="choose('skip')" severity="info" label="Skip All" icon="fa-solid fa-forward" />
            <Button @click="choose('overwrite')" severity="danger" label="Overwrite All" icon="fa-solid fa-pen-to-square" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    components: { Window, Button },
    props: {
        items: {
            type: Array,
            default: () => []
        }
    },
    emits: ['resolve'],

    mounted() {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeUnmount() {
        Keyboard.offKeyDown(this.handleKeyDown);
    },

    methods: {
        basename(p) { return pathutils.basename(p); },
        cancel() { this.$emit('resolve', 'cancel'); },
        choose(mode) { this.$emit('resolve', mode); },
        handleKeyDown(e) {
            if (e.key === 'Escape') this.cancel();
        }
    }
};
</script>

<style scoped>
.paste-conflict-content {
    max-height: 22rem;
    overflow-y: auto;
}

.file-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
}

.file-item {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    margin: var(--ddb-spacing-xs) 0;
    border-radius: var(--ddb-radius-sm);
    background-color: rgba(var(--ddb-warning-rgb, 255, 193, 7), 0.1);
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.amber { color: #f59e0b; }

.file-path {
    word-break: break-all;
}
</style>

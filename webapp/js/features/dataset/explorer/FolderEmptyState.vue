<template>
    <div class="folder-empty">
        <i class="fa-regular fa-folder-open folder-empty-icon" aria-hidden="true" />
        <EmptyState title="This folder is empty">
            <!-- A reader has no way to add files: the plain text only -->
            <p v-if="canWrite">Drop files here or click Upload.</p>
            <template v-if="canWrite" #actions>
                <Button severity="primary" size="small" icon="fa-solid fa-upload" label="Upload" @click="$emit('upload')" />
                <Button severity="secondary" size="small" icon="fa-solid fa-link" label="Import from URL" @click="$emit('importFromUrl')" />
            </template>
        </EmptyState>
    </div>
</template>

<script setup>
/**
 * FolderEmptyState - what the file list (grid and table) shows for a folder with nothing in it
 * (FR-EXP-37): where files come from. Somebody who may write sees 'Drop files here or click Upload'
 * and the Upload and Import from URL buttons, which run the dataset's own actions (the `upload` and
 * `importFromUrl` events the toolbar's Upload goes through); a reader sees the plain text.
 */
import EmptyState from '@/components/EmptyState.vue';
import Button from 'primevue/button';

defineOptions({ name: 'FolderEmptyState' });

defineProps({
    canWrite: { type: Boolean, default: false }
});
defineEmits(['upload', 'importFromUrl']);
</script>

<style scoped>
.folder-empty {
    text-align: center;
}

.folder-empty-icon {
    font-size: 2rem;
    opacity: 0.5;
}
</style>

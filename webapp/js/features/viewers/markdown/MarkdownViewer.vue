<template>
    <ViewerShell v-model:error="error" class="markdown" :loading="loading">
        <div v-if="!loading" class="md-container">
            <div v-if="editing" class="edit-container">
                <textarea ref="editor" v-model="rawContent" aria-label="Markdown source" />
                <Button severity="secondary" outlined class="save" icon="fa-solid fa-floppy-disk" aria-label="Save" @click="save" />
            </div>
            <template v-else>
                <Button v-if="canWrite" severity="secondary" outlined class="edit" icon="fa-solid fa-pen-to-square" aria-label="Edit"
                        @click="edit" />
                <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
                <div class="content" v-html="content" />
            </template>
        </div>
    </ViewerShell>
</template>

<script setup>
/**
 * MarkdownViewer - renders a markdown file; users who can write edit it in place
 * (on ViewerShell and useViewerEntry; the edit button shows to writers only). A relative image
 * or link (`![](langley.png)`) is a file of the dataset next to the Markdown file.
 */
import { ref, computed, nextTick, onMounted } from 'vue';
import Button from 'primevue/button';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { renderMarkdown, datasetFileUrls } from '@/libs/markdown';

defineOptions({ name: 'MarkdownViewer' });

const { entry, dataset, canWrite, loading, error, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.MARKDOWN], typeLabel: 'markdown', title: 'Markdown'
});

const rawContent = ref('');
const editing = ref(false);
const editor = ref(null);
// Images and links of the file name files of the dataset from the file's folder
const content = computed(() => renderMarkdown(rawContent.value, { resolveUrl: datasetFileUrls(dataset.value, entry.value.path) }));

onMounted(async () => {
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        rawContent.value = await dataset.value.getFileContents(entry.value.path);
    } catch (e) {
        error.value = `Cannot fetch ${entry.value.path}: ${e}`;
    } finally {
        loading.value = false;
    }
});

async function edit() {
    editing.value = true;
    await nextTick();
    editor.value.focus();
    editor.value.scrollTo(0, 0);
}

async function save() {
    loading.value = true;
    try {
        await dataset.value.writeObj(entry.value.path, rawContent.value);
        editing.value = false;
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.md-container {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: auto;
}

.edit-container {
    position: relative;
    height: 100%;
    display: flex;
}

.edit {
    float: right;
    margin: var(--ddb-spacing-md);
}

.save {
    position: absolute;
    top: var(--ddb-spacing-md);
    right: var(--ddb-spacing-sm);
}

textarea {
    padding: var(--ddb-spacing-md);
    width: 100%;
    flex-grow: 1;
    border: none;
    resize: none;
    font-family: monospace;
    outline: none;
}

.content {
    padding: var(--ddb-spacing-md);
}

.content :deep(img) {
    max-width: 100%;
}
</style>

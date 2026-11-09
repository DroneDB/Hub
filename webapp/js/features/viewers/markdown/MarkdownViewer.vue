<template>
    <ViewerShell v-model:error="error" class="markdown" :loading="loading" :load-error="loadError">
        <!-- No entry when it did not load (a file of another type): ViewerShell shows the error -->
        <div v-if="!loading && entry" class="md-container">
            <div v-if="editing" class="edit-container">
                <div class="edit-toolbar editor-column" role="toolbar" aria-label="Markdown editor">
                    <span v-if="dirty" class="unsaved me-auto" role="status">Unsaved changes</span>
                    <Button severity="secondary" label="Cancel" title="Cancel (Esc)" :disabled="saving" @click="cancel" />
                    <Button icon="fa-solid fa-floppy-disk" :label="saving ? 'Saving...' : 'Save'" title="Save (Ctrl+S)"
                            :disabled="saving || !dirty" @click="save" />
                </div>
                <textarea ref="editor" v-model="rawContent" class="editor-column" aria-label="Markdown source" :readonly="saving" />
            </div>
            <template v-else>
                <!-- Edit is in the toolbar row of the text column, at its right edge, and stays in view (FR-EXP-39) -->
                <div v-if="canWrite" class="view-toolbar prose-column">
                    <Button severity="secondary" outlined class="edit" icon="fa-solid fa-pen-to-square" label="Edit"
                            @click="edit" />
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
                <div class="content prose-column" v-html="content" />
            </template>
        </div>
        <DialogHost :dialogs="dialogs" />
    </ViewerShell>
</template>

<script setup>
/**
 * MarkdownViewer - renders a markdown file; users who can write edit it in place
 * (on ViewerShell and useViewerEntry; the edit button shows to writers only). A relative image
 * or link (`![](langley.png)`) is a file of the dataset next to the Markdown file.
 *
 * The editor has Cancel and Save (Esc and Ctrl/Cmd+S) and says when the text differs from the
 * file; Cancel, Esc, a route change and a page unload ask before they drop unsaved text.
 */
import { ref, computed, nextTick, onMounted } from 'vue';
import Button from 'primevue/button';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { useLeaveGuard } from '@/composables/useLeaveGuard';
import { useEventListener } from '@/composables/useEventListener';
import { useNotify } from '@/composables/useNotify';
import { renderMarkdown, datasetFileUrls } from '@/libs/markdown';

defineOptions({ name: 'MarkdownViewer' });

const { entry, dataset, canWrite, loading, error, loadError, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.MARKDOWN], typeLabel: 'markdown', title: 'Markdown'
});
const dialogs = useDialogs();
const confirm = useConfirm(dialogs);
const notify = useNotify();

const rawContent = ref('');
// The text of the file when the edit started (and after each save)
const original = ref('');
const editing = ref(false);
const saving = ref(false);
const editor = ref(null);
// Images and links of the file name files of the dataset from the file's folder (nothing to
// render when the entry did not load)
const content = computed(() => entry.value
    ? renderMarkdown(rawContent.value, { resolveUrl: datasetFileUrls(dataset.value, entry.value.path) })
    : '');
const dirty = computed(() => editing.value && rawContent.value !== original.value);

useLeaveGuard({ isDirty: dirty, save, dialogs });

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
    original.value = rawContent.value;
    editing.value = true;
    await nextTick();
    editor.value.focus();
    editor.value.scrollTo(0, 0);
}

/** Leaves the editor, back to the file's text; unsaved text is dropped only once the user agrees. */
async function cancel() {
    if (saving.value) return;
    if (dirty.value && !await confirm({
        title: 'Unsaved changes',
        message: 'The changes to this file are not saved. Discard them?',
        confirmText: 'Discard',
        danger: true
    })) return;
    rawContent.value = original.value;
    editing.value = false;
}

async function save() {
    if (saving.value || !dirty.value) return;
    const text = rawContent.value;
    saving.value = true;
    try {
        // The file that is open: saving replaces it
        await dataset.value.writeObj(entry.value.path, text, { overwrite: true });
        original.value = text;
        editing.value = false;
        notify.success(`Saved "${ddb.pathutils.basename(entry.value.path)}"`, { summary: 'File saved' });
    } catch (e) {
        error.value = e.message;
    } finally {
        saving.value = false;
    }
}

// A window or dialog of the app over the editor (this page's question, the header's
// Preferences, any PrimeVue dialog): it has the keys
const WINDOW = '.p-dialog, [role="dialog"], [role="alertdialog"]';
const windowOpen = () => dialogs.stack.value.length > 0 || !!document.querySelector(WINDOW);

// Ctrl/Cmd+S saves, Esc cancels, as in the text editor, unless a window is open over it
useEventListener(document, 'keydown', e => {
    if (!editing.value || windowOpen() || e.defaultPrevented || e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        void cancel();
    }
});
</script>

<style scoped>
.md-container {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: auto;
}

.edit-container {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.edit-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ddb-spacing-xs);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-bottom: 1px solid var(--ddb-border);
}

.unsaved {
    color: var(--ddb-warning-text);
    font-size: var(--ddb-font-size-sm);
}

/* The text is one centred column of --ddb-prose-max and the editor one of --ddb-editor-max (.prose-column and
   .editor-column of css/app.scss, FR-XC-33); the toolbar row is in the same column */
.view-toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    background: var(--ddb-bg);
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
    color: var(--ddb-text);
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.content :deep(img) {
    max-width: 100%;
}

/* GitHub-like rendering of what renderMarkdown produces */
.content :deep(h1),
.content :deep(h2),
.content :deep(h3),
.content :deep(h4),
.content :deep(h5),
.content :deep(h6) {
    margin: var(--ddb-spacing-lg) 0 var(--ddb-spacing-md);
    font-weight: 600;
    line-height: 1.25;
}

.content :deep(h1),
.content :deep(h2) {
    padding-bottom: var(--ddb-spacing-xs);
    border-bottom: 1px solid var(--ddb-border-light);
}

.content :deep(h1) { font-size: var(--ddb-font-size-title); }
.content :deep(h2) { font-size: var(--ddb-font-size-xl); }
.content :deep(h3) { font-size: var(--ddb-font-size-lg); }
.content :deep(h4),
.content :deep(h5),
.content :deep(h6) { font-size: var(--ddb-font-size-base); }

.content :deep(p),
.content :deep(ul),
.content :deep(ol) {
    margin: 0 0 var(--ddb-spacing-md);
}

.content :deep(ul),
.content :deep(ol) {
    padding-left: var(--ddb-spacing-xl);
}

.content :deep(table) {
    display: block;
    max-width: 100%;
    overflow: auto;
    margin: 0 0 var(--ddb-spacing-md);
    border-collapse: collapse;
    border-spacing: 0;
}

.content :deep(th),
.content :deep(td) {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    border: 1px solid var(--ddb-border);
}

.content :deep(th) {
    font-weight: 600;
    background: var(--ddb-bg-light);
}

.content :deep(tbody tr:nth-child(even)) {
    background: var(--ddb-bg-subtle);
}

.content :deep(code) {
    padding: 0.15em 0.4em;
    font-family: monospace;
    font-size: 85%;
    background: var(--ddb-bg-subtle);
    border-radius: var(--ddb-radius-sm);
}

.content :deep(pre) {
    margin: 0 0 var(--ddb-spacing-md);
    padding: var(--ddb-spacing-md);
    overflow: auto;
    line-height: 1.45;
    background: var(--ddb-bg-subtle);
    border: 1px solid var(--ddb-border-light);
    border-radius: var(--ddb-radius-md);
}

.content :deep(pre code) {
    padding: 0;
    font-size: 100%;
    background: transparent;
    border-radius: 0;
}

.content :deep(blockquote) {
    margin: 0 0 var(--ddb-spacing-md);
    padding: 0 var(--ddb-spacing-md);
    color: var(--ddb-text-secondary);
    border-left: 0.25em solid var(--ddb-border-medium);
}

.content :deep(hr) {
    height: 0;
    margin: var(--ddb-spacing-lg) 0;
    border: 0;
    border-top: 1px solid var(--ddb-border-medium);
}
</style>

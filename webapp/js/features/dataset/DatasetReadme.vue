<template>
    <section class="dataset-readme" :aria-label="path">
        <div class="readme-bar">
            <Button text severity="secondary" size="small" class="readme-toggle" :icon="open ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"
                    :label="path" :aria-expanded="open ? 'true' : 'false'" aria-controls="dataset-readme-body" @click="open = !open" />
            <Button severity="secondary" text size="small" icon="fa-solid fa-up-right-from-square" label="Open" @click="$emit('open', path)" />
        </div>
        <div v-show="open" id="dataset-readme-body" class="readme-body" tabindex="-1">
            <p v-if="tooLarge" class="readme-note" role="status">README is too large to show here. Use Open to read it in the viewer.</p>
            <p v-else-if="failed" class="readme-note" role="alert">{{ failed }}</p>
            <p v-else-if="loading" class="readme-note" role="status">Loading…</p>
            <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
            <div v-else class="content text-selectable" v-html="html" />
            <p v-if="cut" class="readme-note">The rest of the file is in the viewer: use Open.</p>
        </div>
    </section>
</template>

<script setup>
/**
 * DatasetReadme - the README of the dataset under the files at its root, as a code host shows it (FR-EXP-14): the
 * Markdown of README.md rendered by libs/markdown.js (its relative images and links are files of the dataset), in a
 * panel that collapses. A long file shows its first part; Open shows all of it in the Markdown viewer. A file above
 * MAX_BYTES (its size is on the entry the page lists) is not downloaded: the panel says so, and Open reads it.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import { renderMarkdown, datasetFileUrls } from '@/libs/markdown';

defineOptions({ name: 'DatasetReadme' });
/** The characters of the file that the panel renders */
const MAX_CHARS = 100000;
/** The size of the file above which the panel does not download it */
const MAX_BYTES = 1024 * 1024;

const props = defineProps({
    dataset: { type: Object, required: true },
    /** The path of the README in the dataset ('README.md') */
    path: { type: String, default: 'README.md' },
    /** The README as the dataset lists it (its size decides whether the panel reads it); null when that is not known */
    entry: { type: Object, default: null },
    /** Changes when the file was written, so the panel reads it again */
    version: { type: Number, default: 0 }
});
defineEmits(['open']);

const open = ref(true);
const loading = ref(true);
const failed = ref('');
const text = ref('');
const cut = ref(false);
const tooLarge = ref(false);
const html = computed(() => renderMarkdown(text.value, { resolveUrl: datasetFileUrls(props.dataset, props.path) }));

// Reads started later win: an answer that arrives after a newer read began is dropped
let reads = 0;
let gone = false;
onBeforeUnmount(() => { gone = true; });

async function load() {
    const read = ++reads;
    loading.value = true;
    failed.value = '';
    tooLarge.value = false;
    if (typeof props.entry?.size === 'number' && props.entry.size > MAX_BYTES) {
        text.value = '';
        cut.value = false;
        tooLarge.value = true;
        loading.value = false;
        return;
    }
    try {
        const content = await props.dataset.getFileContents(props.path);
        if (gone || read !== reads) return;
        cut.value = content.length > MAX_CHARS;
        text.value = cut.value ? content.slice(0, MAX_CHARS) : content;
    } catch (e) {
        if (gone || read !== reads) return;
        text.value = '';
        cut.value = false;
        failed.value = `Cannot read ${props.path}: ${e?.message || e}`;
    } finally {
        if (!gone && read === reads) loading.value = false;
    }
}

watch(() => [props.path, props.version], load, { immediate: true });
</script>

<style scoped>
.dataset-readme {
    flex: none;
    border-top: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg-surface);
}

.readme-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ddb-spacing-sm);
    padding: 0 var(--ddb-spacing-sm);
}

.readme-toggle {
    font-weight: 600;
}

/* The panel keeps a share of the tab: a long README scrolls in it, the files above keep their room */
.readme-body {
    max-height: min(40vh, 24rem);
    overflow: auto;
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-lg) var(--ddb-spacing-md);
}

.readme-note {
    margin: 0;
    color: var(--ddb-text-secondary);
}

.content {
    color: var(--ddb-text);
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.content :deep(img) {
    max-width: 100%;
}

.content :deep(h1),
.content :deep(h2),
.content :deep(h3),
.content :deep(h4) {
    margin: var(--ddb-spacing-md) 0 var(--ddb-spacing-sm);
    font-weight: 600;
    line-height: 1.25;
}

.content :deep(h1) { font-size: var(--ddb-font-size-xl); }
.content :deep(h2) { font-size: var(--ddb-font-size-lg); }
.content :deep(h3),
.content :deep(h4) { font-size: var(--ddb-font-size-base); }

.content :deep(p),
.content :deep(ul),
.content :deep(ol) {
    margin: 0 0 var(--ddb-spacing-sm);
}

.content :deep(ul),
.content :deep(ol) {
    padding-left: var(--ddb-spacing-xl);
}

.content :deep(code) {
    padding: 0.15em 0.4em;
    font-family: monospace;
    font-size: 85%;
    background: var(--ddb-bg-subtle);
    border-radius: var(--ddb-radius-sm);
}

.content :deep(pre) {
    margin: 0 0 var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm);
    overflow: auto;
    background: var(--ddb-bg-subtle);
    border: 1px solid var(--ddb-border-light);
    border-radius: var(--ddb-radius-md);
}

.content :deep(pre code) {
    padding: 0;
    background: transparent;
}

.content :deep(table) {
    display: block;
    max-width: 100%;
    overflow: auto;
    border-collapse: collapse;
}

.content :deep(th),
.content :deep(td) {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    border: 1px solid var(--ddb-border);
}
</style>

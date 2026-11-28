<template>
    <section ref="root" class="dataset-readme" :aria-label="path">
        <!-- The handle above the open panel: dragged, or moved with the arrow keys, it sets the height of the README;
             a double click gives it its default height again -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- a focusable separator is a widget: it has its role, its value and its arrow keys -->
        <div v-if="open" class="readme-gutter" role="separator" tabindex="0" aria-orientation="horizontal" aria-controls="dataset-readme-body"
             :aria-label="`Resize ${path}`" :aria-valuenow="valueNow" :aria-valuemin="MIN_BODY_PX" :aria-valuemax="valueMax"
             title="Drag to resize, double-click for the default height"
             @pointerdown="startDrag" @pointermove="drag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag"
             @keydown="onKey" @dblclick="resetHeight" />
        <div class="readme-bar">
            <Button text severity="secondary" size="small" class="readme-toggle" :icon="open ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"
                    :label="path" :aria-expanded="open ? 'true' : 'false'" aria-controls="dataset-readme-body" @click="open = !open" />
            <Button severity="secondary" text size="small" icon="fa-solid fa-up-right-from-square" label="Open" @click="$emit('open', path)" />
        </div>
        <div v-show="open" id="dataset-readme-body" ref="body" class="readme-body" :class="{ sized: shownHeight !== null }" tabindex="-1"
             :style="shownHeight !== null ? { height: `${shownHeight}px` } : null">
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
 * DatasetReadme - the README of the dataset under the files at its root, as a code host shows it: the
 * Markdown of README.md rendered by libs/markdown.js (its relative images and links are files of the dataset), in a
 * panel that collapses. A long file shows its first part; Open shows all of it in the Markdown viewer. A file above
 * MAX_BYTES (its size is on the entry the page lists) is not downloaded: the panel says so, and Open reads it.
 *
 * The handle above the panel sets its height (pointer, touch or keyboard), kept on this device (PREF.PANEL_SIZES) for
 * every dataset; until the user sets one, the panel is as tall as its content up to a share of the window. The panel
 * takes at most MAX_SHARE of the tab it is in, so the files above it keep the rest whatever the window's size.
 *
 * Whether the panel is open is kept on this device too (PREF.README_OPEN), for every dataset: the panel is mounted
 * again each time the root of a dataset is listed (back from a folder, another dataset, a reload), and a panel the user
 * folded stays folded until they open it.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import { renderMarkdown, datasetFileUrls } from '@/libs/markdown';
import { fitPaneHeight, readPanelSize, writePanelSize } from '@/libs/panelSize';
import { DEVICE_PREF_DEFAULTS, PREF } from '@/libs/preferences';
import { usePreference } from '@/composables/usePreference';
import { useResizeObserver } from '@/composables/useEventListener';

defineOptions({ name: 'DatasetReadme' });
/** The characters of the file that the panel renders */
const MAX_CHARS = 100000;
/** The size of the file above which the panel does not download it */
const MAX_BYTES = 1024 * 1024;
/** The smallest height of the README's text, in px */
const MIN_BODY_PX = 48;
/** The share of the tab the README panel (its bar and handle included) takes at most */
const MAX_SHARE = 0.8;
/** What an arrow key moves the handle by, in px (with Shift: the fine step), as the dividers of the map compare */
const KEY_STEP_PX = 32;
const FINE_KEY_STEP_PX = 8;
/** The height the user chose, in PREF.PANEL_SIZES */
const HEIGHT_KEY = 'datasetReadme.px';

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

/** Whether the README shows under its bar: what the user left it at, on this device */
const open = usePreference(PREF.README_OPEN, DEVICE_PREF_DEFAULTS[PREF.README_OPEN]);
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

const root = ref(null);
const body = ref(null);
/** The height of the text the user chose, in px; null: the default (as tall as the content, up to a share of the window) */
const chosenHeight = ref(readPanelSize(HEIGHT_KEY));
/** The largest height of the text in the tab as it is now, in px; Infinity while the tab is not laid out (hidden) */
const maxHeight = ref(Infinity);
/** The height of the text as laid out, in px */
const laidOut = ref(0);

/** The height the text is shown at: the chosen one, inside what the tab allows now (the chosen one is kept as it is) */
const shownHeight = computed(() => (chosenHeight.value === null ? null : Math.round(fitPaneHeight(chosenHeight.value, MIN_BODY_PX, maxHeight.value))));
const valueNow = computed(() => shownHeight.value ?? Math.round(laidOut.value));
const valueMax = computed(() => (Number.isFinite(maxHeight.value) ? Math.round(maxHeight.value) : undefined));

/** Measures the tab the panel is in: the text may take MAX_SHARE of it, less the bar and the handle */
function measure() {
    const section = root.value;
    const tab = section?.parentElement;
    if (!section || !tab) return;
    const text = body.value?.offsetHeight ?? 0;
    laidOut.value = text;
    maxHeight.value = tab.clientHeight > 0 ? Math.max(MIN_BODY_PX, tab.clientHeight * MAX_SHARE - (section.offsetHeight - text)) : Infinity;
}
onMounted(() => {
    measure();
    useResizeObserver(root.value?.parentElement, measure);
    useResizeObserver(body.value, measure);
});

/** Sets the height of the text, inside what the tab allows; `keep` stores it on this device */
function setHeight(px, keep) {
    chosenHeight.value = Math.round(fitPaneHeight(px, MIN_BODY_PX, maxHeight.value));
    if (keep) writePanelSize(HEIGHT_KEY, chosenHeight.value);
}
function resetHeight() {
    chosenHeight.value = null;
    writePanelSize(HEIGHT_KEY, null);
}

// The drag of the handle: from the height of the text when it began, by how far the pointer moved up
let dragging = null;
function startDrag(event) {
    if (event.button !== 0 || !body.value) return;
    measure();
    dragging = { id: event.pointerId, y: event.clientY, px: body.value.getBoundingClientRect().height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}
function drag(event) {
    if (dragging?.id !== event.pointerId) return;
    setHeight(dragging.px + dragging.y - event.clientY, false);
}
function endDrag(event) {
    if (dragging?.id !== event.pointerId) return;
    dragging = null;
    if (chosenHeight.value !== null) writePanelSize(HEIGHT_KEY, chosenHeight.value);
}

/** The keys of a separator: up and down move the handle, Home and End take the README to its smallest and largest height */
function onKey(event) {
    measure();
    const now = valueNow.value;
    const step = event.shiftKey ? FINE_KEY_STEP_PX : KEY_STEP_PX;
    const target = { ArrowUp: now + step, ArrowDown: now - step, Home: MIN_BODY_PX, End: maxHeight.value }[event.key];
    if (target === undefined || !Number.isFinite(target)) return;
    event.preventDefault();
    setHeight(target, true);
}
</script>

<style scoped>
/* The panel shrinks before the files above it do: a height chosen in a taller window does not push them out */
.dataset-readme {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    min-height: 0;
    border-top: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg-surface);
}

/* The handle: the full width of the panel, over its top border, with a grip in the middle as the Splitter's */
.readme-gutter {
    position: relative;
    flex: none;
    height: 0.5rem;
    margin-top: calc(-1 * var(--ddb-border-width));
    cursor: row-resize;
    touch-action: none;
}

.readme-gutter::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2.5rem;
    height: 0.25rem;
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-border);
    transform: translate(-50%, -50%);
}

.readme-gutter:hover,
.readme-gutter:focus-visible {
    background: var(--ddb-border-separator);
}

/* The ring of app.scss, inside the handle: the tab clips what is above it */
.readme-gutter:focus-visible {
    outline-offset: calc(-1 * var(--ddb-focus-ring-width));
}

.readme-bar {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--ddb-spacing-sm);
    padding: 0 var(--ddb-spacing-sm);
}

.readme-toggle {
    font-weight: 600;
}

/* The panel keeps a share of the tab: a long README scrolls in it, the files above keep their room. A height the user
   chose replaces that share (sized) */
.readme-body {
    max-height: min(40vh, 24rem);
    min-height: 0;
    overflow: auto;
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-lg) var(--ddb-spacing-md);
}

.readme-body.sized {
    max-height: none;
    box-sizing: border-box;
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

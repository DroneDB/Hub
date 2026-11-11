<template>
    <AnalysisPanel ref="root" variant="raster" class="map-link-panel" data-testid="map-link-panel"
                   icon="fa-solid fa-link" title="Copy link" @close="$emit('close')">
        <div class="panel-body">
            <div class="section">
                <label :for="inputId" class="section-label">Link to this map</label>
                <div class="link-row">
                    <input :id="inputId" class="panel-input" type="text" readonly :value="url"
                           data-testid="map-link-url" @focus="$event.target.select()">
                    <button type="button" class="panel-btn panel-btn--primary copy-btn" data-testid="map-link-copy"
                            title="Copy to clipboard" aria-label="Copy to clipboard" @click="copy(url)">
                        <i :class="copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'" />
                    </button>
                </div>
            </div>

            <div class="section">
                <label class="viewer-only">
                    <input v-model="viewerOnly" type="checkbox" data-testid="map-link-viewer-only">
                    <span>Viewer only</span>
                </label>
                <p class="hint" data-testid="map-link-viewer-only-help">{{ VIEWER_ONLY_HELP }}</p>
            </div>

            <div v-if="note" class="section share-note" data-testid="map-link-note">
                <p class="hint note-text">{{ SHARE_NOTE }}</p>
                <button v-if="canSave" type="button" class="panel-btn panel-btn--primary save-btn" data-testid="map-link-save"
                        @click="emit('save')">
                    <i class="fa-solid fa-floppy-disk" /> Save
                </button>
            </div>

            <p v-if="isPrivate" class="hint private-note" data-testid="map-link-private-note">
                <i class="fa-solid fa-lock" /> Only people with access to this dataset can open this link.
            </p>
        </div>
    </AnalysisPanel>
</template>

<script setup>
/**
 * The link to the map: a saved view (`{ uid }`) or a file (`{ path }`), nothing else of the
 * address (not the position, the hash or the other keys of the page). When the map shows more
 * than the link opens (`note`) it says so and, for a user who can save (`canSave`), offers the
 * save there. "Viewer only" adds the option that opens it without the Hub header and back button.
 *
 * It closes with its close button, with Esc, and with a press anywhere outside it.
 */
import { ref, computed, onMounted, onBeforeUnmount, useId, useTemplateRef } from 'vue';
import ddb from 'ddb';
import AnalysisPanel from './AnalysisPanel.vue';
import Keyboard from '@/libs/keyboard';
import { fileViewUrl, savedViewUrl, VIEWER_ONLY_HELP } from '@/libs/views/viewLinks';
import { useCopyText } from '@/composables/useCopyText';
import { useEventListener } from '@/composables/useEventListener';

const props = defineProps({
    /** The dataset of the map (ddb Dataset); gives the organization and the dataset of the link */
    dataset: { type: Object, required: true },
    /** What the link opens: `{ uid }` for a saved view, `{ path }` (dataset-relative) for a file */
    linkTarget: { type: Object, required: true },
    /** The map shows changes the link does not open: tell the user to save the view */
    note: { type: Boolean, default: false },
    /** The user can save the view (a writer): the note comes with a Save button */
    canSave: { type: Boolean, default: false },
    /**
     * Selector of the control that opens and closes the panel (the toolbar button): a press on it
     * is not a press outside, its click closes the panel, and closing on the press would open it
     * again on the click
     */
    toggle: { type: String, default: '' }
});
const emit = defineEmits(['close', 'save']);

const SHARE_NOTE = 'Save the view to share your changes.';

const inputId = useId();
const { copy, copied } = useCopyText();

// Off every time the panel opens: a link that hides the Hub is the exception
const viewerOnly = ref(false);
const isPrivate = ref(false);

const url = computed(() => {
    const options = { baseUrl: window.location.origin, viewerOnly: viewerOnly.value };
    const { org, ds } = props.dataset;
    return props.linkTarget.uid
        ? savedViewUrl({ org, ds }, props.linkTarget.uid, options)
        : fileViewUrl({ org, ds }, props.linkTarget.path, options);
});

const root = useTemplateRef('root');
// Capture: the map and its controls do not see the press first, so they cannot keep it from the panel
useEventListener(document, 'pointerdown', e => {
    const target = e.target;
    if (!(target instanceof Node) || root.value?.$el.contains(target)) return;
    if (props.toggle && target instanceof Element && target.closest(props.toggle)) return;
    emit('close');
}, true);
// Esc, from the keyboard dispatcher the map takes its own Esc from (it stops the map's tools)
const closeOnEscape = e => { if (e.key === 'Escape') emit('close'); };
Keyboard.onKeyUp(closeOnEscape);
onBeforeUnmount(() => Keyboard.offKeyUp(closeOnEscape));

onMounted(async () => {
    try {
        isPrivate.value = (await props.dataset.getVisibility()) === ddb.Visibility.PRIVATE;
    } catch (e) {
        // The link still works; only the note about who can open it is missing
        console.error('Cannot read the visibility of the dataset', e);
    }
});
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */
.link-row { display: flex; gap: 0.35rem; align-items: center; }
.link-row .panel-input { flex: 1; min-width: 0; font-family: monospace; }
.copy-btn { flex: none; }
.viewer-only { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; color: var(--panel-text); }
.hint { margin: 0.25rem 0 0; color: var(--panel-muted); font-size: 0.75rem; line-height: 1.3; overflow-wrap: anywhere; }
.private-note { color: var(--panel-text-soft); }
.note-text { margin: 0 0 0.35rem; color: var(--panel-text-soft); }
.save-btn { display: inline-flex; align-items: center; gap: 0.35rem; }
</style>

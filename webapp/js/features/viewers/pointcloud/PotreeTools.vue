<template>
    <div class="potree-tools" data-testid="potree-tools">
        <div class="tool-group" role="group" aria-label="Clip volume">
            <button type="button" data-testid="clip-volume" title="Clip volume: place a box and keep the points inside it" aria-label="Clip volume"
                    :class="{ active: placing }" @click="clip">
                <i class="fa-solid fa-vector-square" />
                <span v-if="!compact" class="tool-label">Clip volume</span>
            </button>
            <button type="button" data-testid="clip-remove" title="Remove the clip volumes" aria-label="Remove the clip volumes" :disabled="clipCount === 0"
                    @click="removeClips">
                <i class="fa-solid fa-eraser" />
                <span v-if="!compact" class="tool-label">Remove clips</span>
            </button>
        </div>
        <div class="tool-group" role="group" aria-label="Views">
            <!-- On a phone (below sm) the four views are one select, so the toolbar keeps to a line or two over the cloud -->
            <select v-if="compact" class="tool-select" data-testid="view-select" aria-label="Look at the point cloud from" value="" @change="pickView">
                <option value="" disabled>View</option>
                <option v-for="view in VIEWS" :key="view.key" :value="view.key">{{ view.label }}</option>
            </select>
            <template v-else>
                <button v-for="view in VIEWS" :key="view.key" type="button" :data-testid="`view-${view.key}`" :title="view.title" :aria-label="`${view.label} view`"
                        @click="setView(viewer, view.key)">
                    <span class="tool-label">{{ view.label }}</span>
                </button>
            </template>
        </div>
        <div class="tool-group color-by">
            <label v-if="!compact" for="potree-color-by" class="tool-label">Colour by</label>
            <select id="potree-color-by" v-model="colorBy" class="tool-select" data-testid="color-by" aria-label="Colour the points by"
                    @focus="refreshOptions" @pointerdown="refreshOptions">
                <option v-for="option in options" :key="option.name" :value="option.name">{{ option.label }}</option>
            </select>
        </div>
        <div v-if="placing" class="clip-hint" role="status" data-testid="clip-hint">
            <span>{{ CLIP_HINT }}</span>
            <button type="button" class="hint-action" data-testid="clip-cancel" @click="cancelClip">Cancel</button>
        </div>
    </div>
</template>

<script setup>
/**
 * The tools that only a point cloud has, in the `extra` slot of the viewer's MeasureToolbar (FR-VWR-26): the clip
 * volume, the top/front/side views and the colour of the points. Each does what the icon of the Potree menu does; the
 * menu keeps the advanced settings and follows what is done here (libs/potree/potreeTools). While a clip box follows
 * the pointer a hint says how to place it, and Escape or Cancel drops it. The colours offered follow the ranges that
 * the loading of the cloud fills. Below sm (useStackedLayout) the tools are icons and the views a select.
 */
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { VIEWS, CLIP_EVENTS, CLIP_HINT, setView, placeClipVolume, clipVolumeCount, colorOptions, rangeSignature, setColorBy } from '@/libs/potree/potreeTools';
import { useStackedLayout } from '@/composables/useStackedLayout';

const props = defineProps({
    /** The Potree viewer, with its point cloud loaded */
    viewer: { type: Object, required: true }
});
// A measure being drawn ends before the clip volume starts (the viewer owns its measures)
const emit = defineEmits(['before-clip']);

const compact = useStackedLayout();
const pointcloud = props.viewer.scene.pointclouds?.[0];
const scene = props.viewer.scene;

const colorBy = ref(pointcloud?.material?.activeAttributeName ?? 'rgba');
// The ranges of the attributes are not reactive: they grow as nodes load, and the options are made again when they do
const signature = shallowRef(rangeSignature(pointcloud));
const refreshOptions = () => {
    const next = rangeSignature(pointcloud);
    if (next !== signature.value) signature.value = next;
};
const options = computed(() => {
    void signature.value;
    const offered = colorOptions(pointcloud, colorBy.value);
    // A colouring set from the menu that the toolbar has no name for stays shown
    return offered.some(o => o.name === colorBy.value) ? offered : [...offered, { name: colorBy.value, label: colorBy.value }];
});
watch(colorBy, name => { if (name !== pointcloud?.material?.activeAttributeName) setColorBy(pointcloud, name); });
// The menu changes it too
const onColorChanged = () => { colorBy.value = pointcloud.material.activeAttributeName; };
pointcloud?.material?.addEventListener('active_attribute_changed', onColorChanged);
// Potree 1.8 has no event for a loaded node: each frame compares the ranges (a few numbers)
props.viewer.addEventListener?.('update', refreshOptions);

const clipCount = ref(clipVolumeCount(scene));
const onClipsChanged = () => { clipCount.value = clipVolumeCount(scene); };
for (const type of CLIP_EVENTS) scene.addEventListener(type, onClipsChanged);

// The clip box being placed (it follows the pointer until a click drops it)
const placing = ref(false);
/** @type {ReturnType<typeof placeClipVolume>} */
let placement = null;

onBeforeUnmount(() => {
    placement?.stop();
    props.viewer.removeEventListener?.('update', refreshOptions);
    pointcloud?.material?.removeEventListener('active_attribute_changed', onColorChanged);
    for (const type of CLIP_EVENTS) scene.removeEventListener(type, onClipsChanged);
});

function clip() {
    emit('before-clip');
    const started = placeClipVolume(props.viewer, {
        onEnd: () => {
            if (placement !== started) return;
            placement = null;
            placing.value = false;
        }
    });
    placement = started;
    placing.value = !!started;
}
const cancelClip = () => placement?.cancel();
const removeClips = () => scene.removeAllClipVolumes();

/** @param {Event} e */
function pickView(e) {
    const select = /** @type {HTMLSelectElement} */ (e.target);
    setView(props.viewer, select.value);
    // The select says "View" again: the same view can be picked twice
    select.value = '';
}
</script>

<style scoped lang="scss">
.potree-tools {
    display: contents;
}

// A group of tools: a divider before it, as the toolbar of the Hub groups its buttons
.tool-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding-left: 0.25rem;
    border-left: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
}

.color-by {
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-sm, 0.8rem);

    label {
        margin: 0;
        white-space: nowrap;
    }
}

// The colour, and on a phone the views
.tool-select {
    min-height: 2.25rem;
    padding: 0 0.5rem;
    background: var(--ddb-viewer-select-bg);
    color: var(--ddb-text-on-dark);
    border: var(--ddb-border-width) solid var(--ddb-viewer-select-border);
    border-radius: var(--ddb-border-radius, 4px);
    font-size: var(--ddb-font-size-sm, 0.8rem);
    cursor: pointer;

    &:hover {
        background: var(--ddb-viewer-btn-active-bg);
    }

    &:focus-visible {
        outline: 2px solid var(--ddb-focus-ring-on-dark);
        outline-offset: 1px;
    }
}

// While a clip box is placed: a line of its own under the tools, as the hint of a measure
.clip-hint {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.1rem 0.25rem;
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-sm, 0.8rem);

    .hint-action {
        width: auto;
        height: auto;
        min-height: 0;
        padding: 0.1rem 0.5rem;
        border: 1px solid rgba(var(--ddb-glass-rgb), 0.35);
        border-radius: var(--ddb-border-radius, 4px);
        background: transparent;
        color: inherit;
        font-size: inherit;
        cursor: pointer;
    }

    .hint-action:hover {
        background: rgba(var(--ddb-glass-rgb), 0.15);
    }
}
</style>

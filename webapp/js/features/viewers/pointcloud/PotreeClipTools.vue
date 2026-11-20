<template>
    <div class="potree-clip-tools" data-testid="potree-clip-tools">
        <div class="tool-group" role="group" aria-label="Clip volume">
            <button type="button" data-testid="clip-volume" title="Clip volume: place a box and keep the points inside it" aria-label="Clip volume"
                    :class="{ active: placing }" @click="clip">
                <i class="fa-solid fa-vector-square" />
                <span v-if="!compact" class="tool-label">Clip volume</span>
            </button>
            <button type="button" data-testid="clip-remove" title="Remove the clip volumes" aria-label="Remove the clip volumes" :disabled="clipCount === 0"
                    @click="removeClips">
                <i class="fa-solid fa-eraser" />
            </button>
        </div>
        <div v-if="placing" class="tool-hint" role="status" data-testid="clip-hint">
            <span>{{ CLIP_HINT }}</span>
            <button type="button" class="hint-action" data-testid="clip-cancel" @click="cancelClip">Cancel</button>
        </div>
    </div>
</template>

<script setup>
/**
 * The clip volume of a point cloud, in the `extra` slot of the viewer's MeasureToolbar, beside the measuring tools: it
 * is a thing the user does to the cloud, as a measure is. Each button does what the icon of the Potree menu does; the
 * menu keeps the advanced settings and follows what is done here (libs/potree/potreeTools). While a clip box follows
 * the pointer a hint says how to place it, and Escape or Cancel drops it. Below sm (useStackedLayout) the tool is an
 * icon; removing the clips is one at any width (the eraser beside the tool it undoes).
 */
import { ref, onBeforeUnmount } from 'vue';
import { CLIP_EVENTS, CLIP_HINT, placeClipVolume, clipVolumeCount } from '@/libs/potree/potreeTools';
import { useStackedLayout } from '@/composables/useStackedLayout';

const props = defineProps({
    /** The Potree viewer, with its point cloud loaded */
    viewer: { type: Object, required: true }
});
// A measure being drawn ends before the clip volume starts (the viewer owns its measures)
const emit = defineEmits(['before-clip']);

const compact = useStackedLayout();
const scene = props.viewer.scene;

const clipCount = ref(clipVolumeCount(scene));
const onClipsChanged = () => { clipCount.value = clipVolumeCount(scene); };
for (const type of CLIP_EVENTS) scene.addEventListener(type, onClipsChanged);

// The clip box being placed (it follows the pointer until a click drops it)
const placing = ref(false);
/** @type {ReturnType<typeof placeClipVolume>} */
let placement = null;

onBeforeUnmount(() => {
    placement?.stop();
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
</script>

<style scoped lang="scss">
// Its group and its hint stand in the toolbar as the toolbar's own children do
.potree-clip-tools {
    display: contents;
}
</style>

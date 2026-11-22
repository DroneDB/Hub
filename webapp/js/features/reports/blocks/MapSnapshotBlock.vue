<template>
    <div ref="root" class="report-snapshot">
        <FigureFrame data-block="mapSnapshot" :label="block.alt" :caption="caption" icon="fa-regular fa-map" :image="url"
                     :error="error" retryable :busy="state === 'rendering'" @retry="retry" />
    </div>
</template>

<script setup>
/**
 * The map snapshot block: the image of the cover view's layers and the items of the block, drawn when the block comes
 * into view (renderMapSnapshot, at most two at a time). The note of the render (the basemap that could not be exported)
 * and the note of the model (the cover view that was deleted) are said under it, and the alternative text is the model's.
 */
import { computed, ref, watch } from 'vue';
import FigureFrame from './FigureFrame.vue';
import { useReportContext } from '../reportContext';
import { renderMapSnapshot } from '@/libs/reports/snapshots';
import { useRenderedImage } from '@/libs/reports/snapshots/useRenderedImage';

const props = defineProps({
    /** { kind: 'overview' | 'item', itemId, ref, items, extent, frame, layers, basemap, view, coverDeleted, legend, alt, note } */
    block: { type: Object, required: true }
});

const context = useReportContext();
const root = ref(null);
const { url, note, error, state, retry } = useRenderedImage(() => root.value, signal => renderMapSnapshot(props.block, { dataset: context.dataset, signal }));
watch(() => props.block, retry);

const caption = computed(() => [props.block.alt, props.block.note, note.value].filter(Boolean).join(' - '));
</script>

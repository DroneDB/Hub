<template>
    <div ref="root" class="report-snapshot">
        <FigureFrame data-block="chart" :label="block.alt" :caption="caption" icon="fa-solid fa-chart-line" :image="url"
                     :error="error" retryable :busy="state === 'rendering'" @retry="retry" />
    </div>
</template>

<script setup>
/**
 * The chart block: the elevation profile of an item, sampled from the elevation layer of the cover view and drawn when the
 * block comes into view (renderProfileChart). A cover view with no elevation layer has no chart: the note says so in
 * its place.
 */
import { computed, ref, watch } from 'vue';
import FigureFrame from './FigureFrame.vue';
import { useReportContext } from '../reportContext';
import { renderProfileChart } from '@/libs/reports/snapshots';
import { useRenderedImage } from '@/libs/reports/snapshots/useRenderedImage';

const props = defineProps({
    /** { chart: 'profile', itemId, ref, line, elevationLayer, note, alt } */
    block: { type: Object, required: true }
});

const context = useReportContext();
const root = ref(null);
const { url, note, error, state, retry } = useRenderedImage(() => root.value, signal => renderProfileChart(props.block, { dataset: context.dataset, signal }));
watch(() => props.block, retry);

// The model's note ("No elevation layer in the cover view") is the first thing there is to say when there is no chart
const caption = computed(() => [props.block.alt, props.block.note || note.value].filter(Boolean).join(' - '));
</script>

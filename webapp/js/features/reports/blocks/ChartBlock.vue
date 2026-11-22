<template>
    <FigureFrame data-block="chart" :label="block.alt" :caption="block.note ? `${block.alt} - ${block.note}` : block.alt" icon="fa-solid fa-chart-line" />
</template>

<script setup>
/**
 * The chart block: the request of an elevation profile (the line of the item and the elevation layer of the cover view,
 * or the note that it has none). The chart renderer answers it; until it does the block shows its text only.
 */
import FigureFrame from './FigureFrame.vue';

defineProps({
    /** { chart: 'profile', itemId, ref, line, elevationLayer, note, alt } */
    block: { type: Object, required: true }
});
</script>

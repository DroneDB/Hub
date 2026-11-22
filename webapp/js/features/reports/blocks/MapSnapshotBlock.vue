<template>
    <FigureFrame data-block="mapSnapshot" :label="block.alt" :caption="block.note ? `${block.alt} - ${block.note}` : block.alt" icon="fa-regular fa-map" />
</template>

<script setup>
/**
 * The map snapshot block: a request the model makes (the items to draw, their frame, the layers and basemap of the
 * cover view). The snapshot renderer answers it; until it does the block shows its text only. The block's data is the
 * whole contract: the page does not change when the renderer comes.
 */
import FigureFrame from './FigureFrame.vue';

defineProps({
    /** { kind: 'overview' | 'item', itemId, ref, items, extent, frame, layers, basemap, view, coverDeleted, legend, alt, note } */
    block: { type: Object, required: true }
});
</script>

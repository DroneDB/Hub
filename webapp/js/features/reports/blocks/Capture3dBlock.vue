<template>
    <FigureFrame data-block="capture3d" :label="block.text" :caption="''" icon="fa-solid fa-cube" />
</template>

<script setup>
/**
 * The 3D capture block: the capture a 3D item was saved with (its image file and camera), or the text "No 3D snapshot".
 * The capture renderer answers it; until it does the block shows its text only.
 */
import FigureFrame from './FigureFrame.vue';

defineProps({
    /** { itemId, ref, path, camera, text } */
    block: { type: Object, required: true }
});
</script>

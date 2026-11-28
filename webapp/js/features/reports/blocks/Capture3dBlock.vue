<template>
    <FigureFrame data-block="capture3d" :label="block.text" :caption="''" icon="fa-solid fa-cube" :image="failed ? '' : imageUrl"
                 :error="failed ? 'The 3D snapshot is not in the dataset' : ''" @image-error="failed = true" />
</template>

<script setup>
/**
 * The 3D capture block: the capture a 3D item was saved with (the image file the point cloud viewer wrote, read from the
 * dataset) with the model's text as its alternative text, or the text "No 3D snapshot" when it has none. A capture whose
 * file is no longer in the dataset says so.
 */
import { computed, ref, watch } from 'vue';
import FigureFrame from './FigureFrame.vue';
import { useReportContext } from '../reportContext';
import { capture3dImageUrl } from '@/libs/reports/snapshots';

const props = defineProps({
    /** { itemId, ref, path, camera, text } */
    block: { type: Object, required: true }
});

const context = useReportContext();
const failed = ref(false);
const imageUrl = computed(() => capture3dImageUrl(props.block, context.dataset) ?? '');
watch(imageUrl, () => { failed.value = false; });
</script>

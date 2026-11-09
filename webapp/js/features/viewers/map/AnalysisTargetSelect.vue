<template>
    <div v-if="candidates.length > 1" class="section analysis-target">
        <label :for="selectId" class="section-label">Elevation model</label>
        <select :id="selectId" ref="select" class="panel-select" data-testid="analysis-target-select" @change="onChange">
            <option v-for="(c, i) in candidates" :key="c.path" :value="c.path" :title="c.label" :selected="c.path === modelValue">{{ labels[i] }}</option>
        </select>
    </div>
</template>

<script setup>
/**
 * The "Elevation model" selector of the Stockpile Volume and Raster Analysis panels: the
 * rasters of the map that the tools accept. It asks for the raster picked (update:modelValue)
 * and the parent decides: it may refuse (unsaved measurements the user keeps), so the
 * select always goes back to the value the parent holds. Hidden with fewer than two
 * candidates, there is nothing to choose. The options show the part of the names that differs.
 */
import { ref, computed, nextTick, useId } from 'vue';
import { distinctLabels } from '@/libs/format';

const props = defineProps({
    /** The rasters to choose from: { path, label } */
    candidates: { type: Array, default: () => [] },
    /** Path of the raster the tools work on now */
    modelValue: { type: String, default: null }
});
const emit = defineEmits(['update:modelValue']);

const selectId = useId();
// The part of each name that tells the rasters apart (the date of two mosaics), cut in the middle if still long (FR-RAS-12)
const labels = computed(() => distinctLabels(props.candidates.map(c => c.label), 32));
const select = ref(null);

async function onChange(event) {
    emit('update:modelValue', event.target.value);
    // A parent that keeps its value does not render again, and the select would show the refused pick
    await nextTick();
    if (select.value && select.value.value !== props.modelValue) select.value.value = props.modelValue ?? '';
}
</script>

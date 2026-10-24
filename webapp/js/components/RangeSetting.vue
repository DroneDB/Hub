<template>
    <div class="range-setting">
        <label :for="id">{{ label }}: {{ format(model) }}</label>
        <input :id="id" v-model.number="model" class="w-100" type="range" :min="min" :max="max" :step="step">
    </div>
</template>

<script setup>
/**
 * A labelled slider for a viewer setting (HQ-08: the lighting sliders of the model and
 * 3D viewers, whose labels were not tied to their inputs).
 *
 *   <RangeSetting v-model="settings.ambientIntensity" label="Ambient" :max="3" :step="0.1" />
 */
import { useId } from 'vue';

const model = defineModel({ type: Number, required: true });
defineProps({
    label: { type: String, required: true },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 1 },
    step: { type: Number, default: 0.1 },
    /** How the value is shown next to the label */
    format: { type: Function, default: v => Number(v).toFixed(1) }
});
const id = useId();
</script>

<style scoped>
.range-setting {
    margin-bottom: 0.75rem;
}

.range-setting label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    color: var(--ddb-viewer-label-color);
}

.range-setting input {
    cursor: pointer;
}
</style>

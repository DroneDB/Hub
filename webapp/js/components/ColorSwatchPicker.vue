<template>
    <div class="color-palette" role="radiogroup" :aria-label="label">
        <button v-for="color in swatches" :key="color" type="button" role="radio" class="color-swatch"
                :class="{ selected: model === color }" :aria-checked="model === color" :aria-label="color" :title="color"
                :style="{ backgroundColor: color }" @click="model = color" />
        <input :id="inputId" v-model="model" type="color" class="color-picker-custom" title="Custom color"
               :aria-label="`${label}: custom`">
    </div>
</template>

<script setup>
/**
 * A colour from the measurement swatches or a custom one (HQ-07: was copied into four
 * map dialogs as clickable divs). Swatches are radio buttons, so the keyboard reaches them.
 *
 *   <label for="stroke">Stroke Color</label>
 *   <ColorSwatchPicker v-model="stroke" input-id="stroke" label="Stroke color" />
 */
import { MEASUREMENT_SWATCHES } from '@/libs/map/mapUtils';

const model = defineModel({ type: String, default: '' });
defineProps({
    /** Accessible name of the group */
    label: { type: String, default: 'Color' },
    /** id of the custom colour input, for a <label for> */
    inputId: { type: String, default: undefined },
    swatches: { type: Array, default: () => MEASUREMENT_SWATCHES }
});
</script>

<style scoped>
.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-xs);
    align-items: center;
}

.color-swatch {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    border: var(--ddb-border-width) solid transparent;
    transition: border-color 0.2s, transform 0.1s;
}

.color-swatch:hover {
    transform: scale(1.1);
}

.color-swatch.selected {
    border-color: #000;
    box-shadow: 0 0 0 0.25rem #fff, 0 0 0 0.5rem #000;
}

.color-picker-custom {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
}
</style>

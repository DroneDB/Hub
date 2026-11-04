<template>
    <div v-if="visible" class="opacity-control map-bottom-panel">
        <i class="fa-solid fa-adjust" />
        <input type="range" min="0" max="1" step="0.05" :value="modelValue" title="Layer opacity" aria-label="Layer opacity" @input="$emit('update:modelValue', parseFloat($event.target.value))">
        <span class="opacity-value">{{ Math.round(modelValue * 100) }}%</span>
        <button v-if="showPlantHealthBtn" class="ph-btn" :class="{ active: plantHealthActive }"
                title="Plant Health" aria-label="Plant Health" @click.stop="$emit('plant-health')">
            <i class="fa-solid fa-leaf" />
        </button>
        <AddLayerButton v-if="canAdd" :disabled="addDisabled" :reason="addTitle" @click.stop="$emit('add')" />
    </div>
</template>

<script>
import AddLayerButton from './AddLayerButton.vue';

export default {
    components: { AddLayerButton },
    props: {
        modelValue: {
            type: Number,
            default: 1.0
        },
        visible: {
            type: Boolean,
            default: true
        },
        showPlantHealthBtn: {
            type: Boolean,
            default: false
        },
        plantHealthActive: {
            type: Boolean,
            default: false
        },
        // The action that adds a layer: shown with canAdd, off with addDisabled, which says why in addTitle
        canAdd: {
            type: Boolean,
            default: false
        },
        addDisabled: {
            type: Boolean,
            default: false
        },
        addTitle: {
            type: String,
            default: ''
        }
    },
    emits: ['update:modelValue', 'plant-health', 'add']
};
</script>

<style scoped>
.opacity-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    border-radius: 1.25rem;
}

.opacity-control i {
    font-size: var(--ddb-font-size-base);
    opacity: 0.9;
    margin: 0;
}

.opacity-control input[type="range"] {
    flex: 1 1 7.5rem;
    min-width: 4rem;
    cursor: pointer;
}

/* A phone: the action goes under the slider instead of widening the panel */
@media (max-width: 575.98px) {
    .opacity-control {
        flex-wrap: wrap;
    }
}
</style>

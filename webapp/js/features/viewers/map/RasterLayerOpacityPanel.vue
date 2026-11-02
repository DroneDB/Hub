<template>
    <div v-if="layers && layers.length > 1" class="raster-opacity-panel map-bottom-panel">
        <div v-for="(layer, index) in layers" :key="layer.path" class="raster-opacity-row"
             :class="{ 'raster-opacity-row--hidden': !layer.placeholder && layer.visible === false }">
            <span class="raster-label" :title="layer.name">{{ truncate(layer.name) }}</span>
            <span v-if="layer.placeholder" class="placeholder-text" :title="layer.placeholder.text">{{ layer.placeholder.text }}</span>
            <button v-if="repickable && layer.placeholder && layer.placeholder.kind === 'missing'" class="row-btn"
                    title="Pick another raster" aria-label="Pick another raster" @click.stop="$emit('repick', layer.path)">
                <i class="fa-solid fa-arrows-rotate" />
            </button>
            <!-- Pressed = the layer is shown; the name stays the same, the state is aria-pressed -->
            <button v-if="!layer.placeholder" class="row-btn eye-btn" type="button"
                    :aria-pressed="layer.visible !== false ? 'true' : 'false'"
                    :aria-label="'Visibility of ' + layer.name"
                    :title="layer.visible !== false ? 'Hide layer' : 'Show layer'"
                    @click.stop="$emit('toggle-visible', layer.path)">
                <i class="fa-solid" :class="layer.visible !== false ? 'fa-eye' : 'fa-eye-slash'" />
            </button>
            <input
                v-if="!layer.placeholder"
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="layer.opacity"
                :title="'Opacity: ' + Math.round(layer.opacity * 100) + '%'"
                :aria-label="'Opacity of ' + layer.name"
                @input="onInput(layer, $event)"
            >
            <span v-if="!layer.placeholder" class="opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
            <button v-if="layer.plantHealthCapable" class="ph-btn"
                    :class="{ active: activePlantHealthPath === layer.path }"
                    title="Plant Health" aria-label="Plant Health"
                    @click.stop="$emit('plant-health', layer.path)">
                <i class="fa-solid fa-leaf" />
            </button>
            <button v-if="isRemovable(layer)" class="row-btn" type="button" :title="removeLabel" :aria-label="removeLabel + ': ' + layer.name"
                    @click.stop="$emit('remove', layer.path)">
                <i class="fa-solid fa-xmark" />
            </button>
            <div class="order-buttons">
                <button
                    class="order-btn"
                    :class="{ 'order-btn--hidden': index === 0 }"
                    :disabled="index === 0"
                    title="Move layer up" aria-label="Move layer up"
                    @click="index > 0 && onReorder(index, index - 1)"
                ><i class="fa-solid fa-chevron-up" /></button>
                <button
                    class="order-btn"
                    :class="{ 'order-btn--hidden': index === layers.length - 1 }"
                    :disabled="index === layers.length - 1"
                    title="Move layer down" aria-label="Move layer down"
                    @click="index < layers.length - 1 && onReorder(index, index + 1)"
                ><i class="fa-solid fa-chevron-down" /></button>
            </div>
        </div>
        <AddLayerButton v-if="canAdd" class="add-layer" :disabled="addDisabled" :reason="addTitle" @click.stop="$emit('add')" />
    </div>
</template>

<script>
import AddLayerButton from './AddLayerButton.vue';

export default {
    components: { AddLayerButton },
    props: {
        layers: {
            type: Array,
            default: () => []
        },
        activePlantHealthPath: {
            type: String,
            default: null
        },
        // Each row can be removed (a comparison; the panel shows with two layers or more); a row
        // with its own `removable` flag decides for itself
        removable: {
            type: Boolean,
            default: false
        },
        // Only the rows of these paths can be removed (the layers added to a single-file map),
        // without a flag on the rows, which `update:layers` would hand back to the parent; null
        // leaves it to `removable`
        removablePaths: {
            type: Array,
            default: null
        },
        // Name of the remove control (its title, and the start of its accessible name)
        removeLabel: {
            type: String,
            default: 'Remove layer'
        },
        // Picking another file for a missing layer; left out, it follows `removable`. The explicit
        // undefined default keeps "not given" apart from false, which Vue would otherwise cast to
        canRepick: {
            type: Boolean,
            default: undefined
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
    emits: ['update:layers', 'reorder', 'plant-health', 'remove', 'repick', 'toggle-visible', 'add'],
    computed: {
        repickable() {
            return this.canRepick === undefined ? this.removable : this.canRepick;
        }
    },
    methods: {
        isRemovable(layer) {
            if (layer.removable !== undefined) return !!layer.removable;
            return this.removablePaths ? this.removablePaths.includes(layer.path) : this.removable;
        },
        truncate(name) {
            if (!name) return '';
            return name.length > 22 ? name.slice(0, 20) + '…' : name;
        },
        onInput(layer, event) {
            const newOpacity = parseFloat(event.target.value);
            const updated = this.layers.map(l =>
                l.path === layer.path ? { ...l, opacity: newOpacity } : l
            );
            this.$emit('update:layers', updated);
        },
        onReorder(fromIndex, toIndex) {
            this.$emit('reorder', { fromIndex, toIndex });
        }
    }
};
</script>

<style scoped>
.raster-opacity-panel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    max-height: 50%;
    overflow-y: auto;
}

.raster-opacity-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.raster-label {
    flex: 0 1 10rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
    font-size: var(--ddb-font-size-sm);
}

.raster-opacity-row input[type="range"] {
    flex: 1;
    min-width: 4rem;
    cursor: pointer;
}

.placeholder-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-warning);
}

.row-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    padding: 0.1rem 0.25rem;
    border-radius: 0.2rem;
    line-height: 1;

    &:hover {
        color: white;
        background: rgba(255, 255, 255, 0.15);
    }
}

/* A hidden layer: its name dims, the slider keeps its value */
.raster-opacity-row--hidden .raster-label {
    opacity: 0.45;
}

.add-layer {
    align-self: flex-start;
}

.order-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    flex-shrink: 0;
}

.order-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    padding: 0.05rem 0.2rem;
    border-radius: 0.2rem;
    line-height: 1;
    font-size: 0.6rem;
    transition: color 0.15s, background 0.15s;
}

.order-btn:hover:not(:disabled) {
    color: white;
    background: rgba(255, 255, 255, 0.15);
}

.order-btn--hidden {
    display: none;
    pointer-events: none;
}

/* A phone: the name has a line of its own, so the slider keeps its length */
@media (max-width: 575.98px) {
    .raster-opacity-row {
        flex-wrap: wrap;
    }

    .raster-label {
        flex: 1 0 100%;
    }
}

/* Fingers: the two arrows side by side, each a touch target; the missing one keeps its place so
   the sliders line up */
@media (pointer: coarse) {
    .order-buttons {
        flex-direction: row;
        gap: 0;
    }

    .order-btn,
    .row-btn {
        min-width: 2rem;
        min-height: 2rem;
        font-size: 0.75rem;
    }

    .order-btn--hidden {
        display: flex;
        visibility: hidden;
    }
}
</style>

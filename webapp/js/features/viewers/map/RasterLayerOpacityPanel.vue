<template>
    <div v-if="layers && layers.length > 1" class="raster-opacity-panel map-bottom-panel">
        <div v-for="(layer, index) in layers" :key="layer.path" class="raster-opacity-row">
            <span class="raster-label" :title="layer.name">{{ truncate(layer.name) }}</span>
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="layer.opacity"
                :title="'Opacity: ' + Math.round(layer.opacity * 100) + '%'"
                :aria-label="'Opacity of ' + layer.name"
                @input="onInput(layer, $event)"
            >
            <span class="opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
            <button v-if="layer.plantHealthCapable" class="ph-btn"
                    :class="{ active: activePlantHealthPath === layer.path }"
                    title="Plant Health" aria-label="Plant Health"
                    @click.stop="$emit('plant-health', layer.path)">
                <i class="fa-solid fa-leaf" />
            </button>
            <div class="order-buttons">
                <button
                    class="order-btn"
                    :class="{ 'order-btn--hidden': index === 0 }"
                    :disabled="index === 0"
                    title="Move layer up"
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
    </div>
</template>

<script>
export default {
    props: {
        layers: {
            type: Array,
            default: () => []
        },
        activePlantHealthPath: {
            type: String,
            default: null
        }
    },
    emits: ['update:layers', 'reorder', 'plant-health'],
    methods: {
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

    .order-btn {
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

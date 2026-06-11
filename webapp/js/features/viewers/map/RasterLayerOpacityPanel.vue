<template>
    <div class="raster-opacity-panel" v-if="layers && layers.length > 1">
        <div v-for="(layer, index) in layers" :key="layer.path" class="raster-opacity-row">
            <span class="raster-label" :title="layer.name">{{ truncate(layer.name) }}</span>
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="layer.opacity"
                @input="onInput(layer, $event)"
                :title="'Opacity: ' + Math.round(layer.opacity * 100) + '%'"
            />
            <span class="opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
            <button v-if="layer.plantHealthCapable" class="ph-btn"
                    :class="{ active: activePlantHealthPath === layer.path }"
                    title="Plant Health"
                    @click.stop="$emit('plant-health', layer.path)">
                <i class="fa-solid fa-leaf"></i>
            </button>
            <div class="order-buttons">
                <button
                    class="order-btn"
                    :class="{ 'order-btn--hidden': index === 0 }"
                    :disabled="index === 0"
                    @click="index > 0 && onReorder(index, index - 1)"
                    title="Move layer up"
                ><i class="fa-solid fa-chevron-up"></i></button>
                <button
                    class="order-btn"
                    :class="{ 'order-btn--hidden': index === layers.length - 1 }"
                    :disabled="index === layers.length - 1"
                    @click="index < layers.length - 1 && onReorder(index, index + 1)"
                    title="Move layer down"
                ><i class="fa-solid fa-chevron-down"></i></button>
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
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    color: white;
    font-size: 0.75rem;
    user-select: none;
    min-width: 16rem;
}

.raster-opacity-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.raster-label {
    width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
    font-size: var(--ddb-font-size-sm, 0.7rem);
}

.raster-opacity-row input[type="range"] {
    flex: 1;
    cursor: pointer;
    accent-color: var(--ddb-secondary);
}

.opacity-value {
    min-width: 2.2rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
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

.ph-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    padding: 0 0.15rem;
    font-size: var(--ddb-font-size-base);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: color 0.15s;
}

.ph-btn:hover {
    color: #fff;
}

.ph-btn.active {
    color: #7bc67e;
}
</style>

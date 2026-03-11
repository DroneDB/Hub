<template>
    <div class="opacity-control" v-if="visible">
        <i class="fa-solid fa-adjust"></i>
        <input type="range" min="0" max="1" step="0.05" :value="modelValue" @input="$emit('update:modelValue', parseFloat($event.target.value))" title="Layer opacity">
        <span class="opacity-value">{{ Math.round(modelValue * 100) }}%</span>
    </div>
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Number,
            default: 1.0
        },
        visible: {
            type: Boolean,
            default: true
        }
    }
};
</script>

<style scoped>
.opacity-control {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    display: flex;
    gap: 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.25rem 0.75rem;
    border-radius: 1.25rem;
    color: white;
    font-size: 0.75rem;
    user-select: none;
}

.opacity-control i {
    font-size: var(--ddb-font-size-base);
    opacity: 0.9;
    margin: 0;
}

.opacity-control input[type="range"] {
    width: 7.5rem;
    cursor: pointer;
    accent-color: var(--ddb-secondary);
}

.opacity-control .opacity-value {
    min-width: 2rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
</style>

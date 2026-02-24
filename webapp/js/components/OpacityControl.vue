<template>
    <div class="opacity-control" v-if="visible">
        <i class="icon adjust"></i>
        <input type="range" min="0" max="1" step="0.05" :value="value" @input="$emit('input', parseFloat($event.target.value))" title="Layer opacity">
        <span class="opacity-value">{{ Math.round(value * 100) }}%</span>
    </div>
</template>

<script>
export default {
    props: {
        value: {
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
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    display: flex;
    gap: 6px;
    background: rgba(0, 0, 0, 0.6);
    padding: 5px 12px;
    border-radius: 20px;
    color: white;
    font-size: 12px;
    user-select: none;
}

.opacity-control .icon {
    font-size: 14px;
    opacity: 0.9;
    margin: 0;
}

.opacity-control input[type="range"] {
    width: 120px;
    cursor: pointer;
    accent-color: #4fc3f7;
}

.opacity-control .opacity-value {
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
</style>

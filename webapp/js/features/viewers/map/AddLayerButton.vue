<template>
    <button class="add-btn" type="button" :disabled="disabled" :title="disabled && reason ? reason : 'Add layer'">
        <i class="fa-solid fa-plus" /> Add layer
    </button>
</template>

<script setup>
/**
 * AddLayerButton - the "Add layer" action of the map's layer panels (OpacityControl with one
 * layer, RasterLayerOpacityPanel with more). A click is the parent's native `click`. The title says
 * why the action is off (the limit): a disabled button has no other place for it. The button is the
 * only root node, a comment beside it would stop the click from reaching the parent's listener.
 */
defineProps({
    disabled: { type: Boolean, default: false },
    /** Why the action is off: shown as the title while `disabled` */
    reason: { type: String, default: '' }
});
</script>

<style scoped>
.add-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    padding: 0.15rem 0.6rem;
    border-radius: 0.2rem;
    font-size: var(--ddb-font-size-sm);
    white-space: nowrap;

    &:hover:not(:disabled) {
        color: white;
        background: rgba(255, 255, 255, 0.15);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
}

@media (pointer: coarse) {
    .add-btn {
        min-width: 2rem;
        min-height: 2rem;
        font-size: 0.75rem;
    }
}
</style>

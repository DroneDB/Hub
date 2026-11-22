<template>
    <span v-if="item.ref || item.category || item.status" class="annotation-chips">
        <span v-if="item.ref" class="annotation-chip annotation-chip--ref" :title="`Reference ${item.ref}`" data-testid="annotation-ref">{{ item.ref }}</span>
        <span v-if="item.category" class="annotation-chip" data-testid="annotation-category">{{ item.categoryLabel || item.category }}</span>
        <span v-if="item.status" class="annotation-chip" data-testid="annotation-status">{{ item.statusLabel || item.status }}</span>
    </span>
</template>

<script setup>
/**
 * The reference, the category and the status of an annotation as small tags, for a row of a list: the item is a row
 * of the measurement list ({ ref, category, categoryLabel, status, statusLabel }); a tag is drawn only for a field the
 * annotation has.
 */
defineProps({
    item: { type: Object, required: true }
});
</script>

<style scoped>
.annotation-chips {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.annotation-chip {
    padding: 0 0.4rem;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
    color: var(--ddb-text);
    font-size: 0.72rem;
    white-space: nowrap;
}

.annotation-chip--ref {
    font-weight: 600;
}
</style>

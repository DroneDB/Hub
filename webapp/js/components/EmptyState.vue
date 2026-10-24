<template>
    <div class="empty-state">
        <i v-if="icon" :class="icon" class="empty-state-icon" aria-hidden="true" />
        <h3>{{ title }}</h3>
        <p v-if="filtered">Try adjusting your search criteria.</p>
        <slot v-else />
    </div>
</template>

<script setup>
/**
 * EmptyState - what a list says when it has nothing to show (HQ-09: repeated in the
 * datasets, organizations and users lists): a title, and either the search hint when a
 * filter is on, or the slot's own hint.
 *
 *   <EmptyState title="No datasets found" :filtered="!!searchQuery"><p>Create one ...</p></EmptyState>
 */
defineProps({
    title: { type: String, required: true },
    icon: { type: String, default: '' },
    /** A search or filter hides items: suggest changing it */
    filtered: { type: Boolean, default: false }
});
</script>

<style scoped>
.empty-state {
    text-align: center;
    padding: 1.5rem;
}

.empty-state-icon {
    font-size: 2rem;
    opacity: 0.5;
    margin-bottom: 0.5rem;
}
</style>

<template>
    <div class="empty-state">
        <h3>{{ title }}</h3>
        <p v-if="filtered">Try adjusting your search criteria.</p>
        <slot v-else />
    </div>
</template>

<script setup>
/**
 * EmptyState - what a list says when it has nothing to show: a title, and either the search hint when a
 * filter is on, or the slot's own hint.
 *
 *   <EmptyState title="No datasets found" :filtered="!!searchQuery"><p>Create one ...</p></EmptyState>
 */
defineProps({
    title: { type: String, required: true },
    /** A search or filter hides items: suggest changing it */
    filtered: { type: Boolean, default: false }
});
</script>

<style scoped>
.empty-state {
    text-align: center;
    padding: 1.5rem;
}

</style>

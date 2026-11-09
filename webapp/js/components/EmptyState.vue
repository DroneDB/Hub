<template>
    <div class="empty-state">
        <h3>{{ heading }}</h3>
        <p v-if="query || filtered">Try adjusting your search criteria.</p>
        <slot v-else />
        <div v-if="clearText" class="empty-state-clear">
            <Button severity="secondary" size="small" icon="fa-solid fa-xmark" :label="clearText" @click="$emit('clear')" />
        </div>
        <div v-else-if="$slots.actions" class="empty-state-actions">
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup>
/**
 * EmptyState - what a list says when it has nothing to show (FR-XC-20). One shape for every list:
 *
 *   - A search (`query`): 'No datasets match "pile"', the hint to change it and a 'Clear search'
 *     button that emits `clear`; the page empties its query.
 *   - A filter without a text (`filtered`): the title, the hint and, with `clear-label`
 *     ('Clear filters'), the button.
 *   - Nothing at all: the title, the slot's own hint, and the `#actions` slot, the buttons that
 *     fill the list (Create dataset, Upload).
 *
 *   <EmptyState title="No datasets yet" items="datasets" :query="searchQuery" @clear="searchQuery = ''">
 *       <p>Create one ...</p>
 *       <template #actions><Button label="Create dataset" /></template>
 *   </EmptyState>
 */
import { computed } from 'vue';
import Button from 'primevue/button';

defineOptions({ name: 'EmptyState' });

const props = defineProps({
    /** What the list says when nothing is searched or filtered */
    title: { type: String, default: '' },
    /** The plural of what the list holds, for the sentence of a search: 'datasets' */
    items: { type: String, default: 'items' },
    /** What is searched: a text hides the items; the sentence names it */
    query: { type: String, default: '' },
    /** A filter hides items: suggest changing it */
    filtered: { type: Boolean, default: false },
    /** The button that undoes a filter ('Clear filters'); a search has 'Clear search' by default */
    clearLabel: { type: String, default: '' }
});
defineEmits(['clear']);

const heading = computed(() => (props.query ? `No ${props.items} match "${props.query}"` : props.title));
const clearText = computed(() => props.clearLabel || (props.query ? 'Clear search' : ''));
</script>

<style scoped>
.empty-state {
    text-align: center;
    padding: 1.5rem;
}

.empty-state-clear,
.empty-state-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ddb-spacing-sm);
    margin-top: var(--ddb-spacing-md);
}
</style>

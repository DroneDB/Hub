<template>
    <div class="list-toolbar">
        <div class="list-toolbar-start">
            <SearchField v-if="searchLabel" ref="searchField" v-model="search" :label="searchLabel" size="small" class="list-toolbar-search" />
            <slot name="start" />
        </div>
        <div class="list-toolbar-end">
            <slot name="end" />
        </div>
    </div>
</template>

<script setup>
/**
 * ListToolbar - the row above a list (or its map): the search and the filters on the left, the
 * controls of how the list is shown (view, sort) on the right. The search is the SearchField
 * (clear button, Escape). The page header above it keeps
 * the actions (create, import, members), so these tools sit next to what they change.
 *
 *   <ListToolbar v-model:search="searchQuery" search-label="Search datasets">
 *       <template #end><ViewSelect v-model="view" /></template>
 *   </ListToolbar>
 */
import { useTemplateRef } from 'vue';
import SearchField from '@/components/SearchField.vue';

defineOptions({ name: 'ListToolbar' });

const search = defineModel('search', { type: String, default: '' });
defineProps({
    /** The placeholder and the accessible name of the search field; none, no search field */
    searchLabel: { type: String, default: '' }
});

const searchField = useTemplateRef('searchField');
/** Puts the focus in the search field (an empty state's Clear search hands it back here) */
defineExpose({ focus: () => searchField.value?.focus() });
</script>

<style scoped>
.list-toolbar {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
    padding: var(--ddb-spacing-sm) 0;
    border-top: var(--ddb-border-width) solid var(--ddb-border-separator);
}

/* Takes the room the end leaves; below 12rem the end goes to a row of its own */
.list-toolbar-start {
    flex: 1 1 12rem;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
}

.list-toolbar-search {
    flex: 0 1 24rem;
    min-width: 0;
}

.list-toolbar-end {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    margin-left: auto;
}
</style>

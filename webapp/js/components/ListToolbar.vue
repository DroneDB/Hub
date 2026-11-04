<template>
    <div class="list-toolbar">
        <div class="list-toolbar-start">
            <IconField v-if="searchLabel" class="list-toolbar-search">
                <InputIcon class="fa-solid fa-magnifying-glass" />
                <InputText v-model="search" size="small" :placeholder="searchLabel" :aria-label="searchLabel" fluid />
            </IconField>
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
 * controls of how the list is shown (view, sort) on the right. The page header above it keeps
 * the actions (create, import, members), so these tools sit next to what they change.
 *
 *   <ListToolbar v-model:search="searchQuery" search-label="Search datasets">
 *       <template #end><ViewSelect v-model="view" /></template>
 *   </ListToolbar>
 */
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';

defineOptions({ name: 'ListToolbar' });

const search = defineModel('search', { type: String, default: '' });
defineProps({
    /** The placeholder and the accessible name of the search field; none, no search field */
    searchLabel: { type: String, default: '' }
});
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

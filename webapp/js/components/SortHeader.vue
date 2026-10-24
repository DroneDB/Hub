<template>
    <button type="button" class="btn-reset sort-header" :aria-label="ariaLabel" @click="emit('sort', column)">
        {{ label }}
        <i v-if="active" class="fa-solid" :class="direction === 'asc' ? 'fa-angle-up' : 'fa-angle-down'" aria-hidden="true" />
    </button>
</template>

<script setup>
/**
 * SortHeader - a clickable column header that shows the sort direction (HQ-10: the
 * same span was repeated for four columns in TableView and FolderPicker, without
 * keyboard access).
 *
 *   <SortHeader label="Name" column="name" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
 */
import { computed } from 'vue';

const props = defineProps({
    label: { type: String, required: true },
    column: { type: String, required: true },
    /** Column the list is sorted by */
    sortColumn: { type: String, default: '' },
    direction: { type: String, default: 'asc' }
});

const emit = defineEmits(['sort']);

const active = computed(() => props.sortColumn === props.column);

const ariaLabel = computed(() => {
    if (!active.value) return `Sort by ${props.label}`;
    return `${props.label}, sorted ${props.direction === 'asc' ? 'ascending' : 'descending'}`;
});
</script>

<style scoped>
.sort-header {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: inherit;
}

.sort-header:hover {
    color: var(--ddb-primary);
}
</style>

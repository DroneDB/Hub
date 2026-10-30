<template>
    <div class="sort-select" role="group" :aria-label="label">
        <Select v-model="column" :options="options" option-label="label" option-value="value" size="small"
                class="sort-select-field" :aria-label="label" :title="label" />
        <Button severity="secondary" outlined size="small" class="sort-select-direction"
                :icon="descending ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short'"
                :title="directionLabel" :aria-label="directionLabel" @click="toggle" />
    </div>
</template>

<script setup>
/**
 * SortSelect - the sort controls of a list: a select for the field and a button that flips
 * ascending and descending.
 *
 *   <SortSelect v-model:column="sortColumn" v-model:direction="sortDirection" :options="ORG_SORT_OPTIONS" />
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';

defineOptions({ name: 'SortSelect' });

const column = defineModel('column', { type: String, required: true });
const direction = defineModel('direction', { type: String, default: 'asc' });
defineProps({
    /** The fields to sort by: [{ value, label }] */
    options: { type: Array, required: true },
    /** The name of the control for assistive technology and the tooltip of the field */
    label: { type: String, default: 'Sort by' }
});

const descending = computed(() => direction.value === 'desc');
// The button says what it will do, so its name is a command and not a state
const directionLabel = computed(() => (descending.value ? 'Sorted descending: switch to ascending' : 'Sorted ascending: switch to descending'));

function toggle() {
    direction.value = descending.value ? 'asc' : 'desc';
}
</script>

<style scoped>
.sort-select {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
    min-width: 0;
}

.sort-select-field {
    min-width: 0;
    flex: 1 1 auto;
}

.sort-select-direction {
    flex-shrink: 0;
}
</style>

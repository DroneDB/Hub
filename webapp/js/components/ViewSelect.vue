<template>
    <SelectButton v-model="view" :options="LIST_VIEW_OPTIONS" option-label="label" option-value="value"
                  :allow-empty="false" size="small" class="view-select" :aria-label="label">
        <template #option="{ option }">
            <i :class="option.icon" aria-hidden="true" />
            <span class="view-select-label">{{ option.label }}</span>
        </template>
    </SelectButton>
</template>

<script setup>
/**
 * ViewSelect - the switch of a page between its list and its map of the same items.
 *
 *   <ViewSelect v-model="view" label="Show the organizations as" />
 */
import SelectButton from 'primevue/selectbutton';
import { LIST_VIEW_OPTIONS } from '@/libs/listViews';

defineOptions({ name: 'ViewSelect' });

const view = defineModel({ type: String, required: true });
defineProps({
    /** The name of the control for assistive technology */
    label: { type: String, default: 'View' }
});
</script>

<style scoped>
.view-select {
    flex-shrink: 0;
    white-space: nowrap;
}

.view-select-label {
    margin-left: var(--ddb-spacing-xs);
}

/* Only the icons on a narrow screen */
@media screen and (max-width: 575.98px) {
    .view-select-label {
        display: none;
    }
}
</style>

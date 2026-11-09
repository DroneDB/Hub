<template>
    <div class="view-bar" role="toolbar" aria-label="View">
        <i class="fa-solid fa-map view-icon" aria-hidden="true" />
        <span class="view-name" :title="name">{{ name }}</span>
        <span v-if="dirty && canWrite" class="view-dirty">Unsaved changes</span>
        <!-- A phone: the saves are in one menu, so the name keeps its room (FR-MAP-12) -->
        <template v-if="canWrite && stacked">
            <Button class="view-more" size="small" severity="secondary" text icon="fa-solid fa-ellipsis-vertical" aria-label="View actions"
                    title="Save this view" aria-haspopup="true" :aria-controls="menuId" :aria-expanded="String(menuOpen)"
                    :loading="busy" @click="menu?.toggle($event)" />
            <Menu :id="menuId" ref="menu" :model="items" popup @show="menuOpen = true" @hide="menuOpen = false" />
        </template>
        <div v-else-if="canWrite" class="view-actions">
            <Button size="small" icon="fa-solid fa-floppy-disk" label="Save" :disabled="busy" :loading="busy"
                    :title="saved ? 'Save the changes to this view' : 'Save this view in the dataset'" @click="emit('save')" />
            <Button v-if="saved" size="small" severity="secondary" label="Save as new" :disabled="busy" :loading="busy"
                    title="Save as a new view" @click="emit('saveAsNew')" />
        </div>
    </div>
</template>

<script setup>
/**
 * ViewBar - the content of the view bar of the map viewer (ViewerShell's bar, after the way back
 * to the dataset): the name of the view (the saved name, or
 * the name of the base file of a new view; always text), the mark of unsaved changes and, for a
 * user who can save, Save (a new or a saved view) and Save as new (a saved view). A reader sees
 * the name only. ViewerShell has no bar in Viewer only.
 *
 * It is one line at any width: a long name ends with an ellipsis (the full name is its title). Below
 * `sm` Save and Save as new are the two items of a menu (the "View actions" button) instead of two buttons.
 */
import { computed, ref, useId } from 'vue';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { useStackedLayout } from '@/composables/useStackedLayout';

const props = defineProps({
    name: { type: String, required: true },
    /** The view is a saved one and differs from what was saved: the mark shows to a user who can save */
    dirty: { type: Boolean, default: false },
    /** The view is a saved one: Save as new is offered, and Save replaces it */
    saved: { type: Boolean, default: false },
    canWrite: { type: Boolean, default: false },
    /** A save is running */
    busy: { type: Boolean, default: false }
});
const emit = defineEmits(['save', 'saveAsNew']);

// Below `sm` (the window, the breakpoint of libs/responsiveColumns.js) Save and Save as new are the items of one menu
const stacked = useStackedLayout();
const menu = ref(null);
const menuId = useId();
const menuOpen = ref(false);
const items = computed(() => [
    { label: 'Save', icon: 'fa-solid fa-floppy-disk', disabled: props.busy, command: () => emit('save') },
    ...(props.saved ? [{ label: 'Save as new', icon: 'fa-solid fa-copy', disabled: props.busy, command: () => emit('saveAsNew') }] : [])
]);
</script>

<style scoped>
.view-bar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
}

.view-icon {
    flex-shrink: 0;
}

.view-name {
    flex: 1 1 0;
    min-width: 2rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.view-dirty {
    flex-shrink: 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-warning-text);
    white-space: nowrap;
}

.view-more {
    flex-shrink: 0;
}

.view-actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
}

/* Room for the name on a phone, where the saves are in the menu */
@media (max-width: 575.98px) {
    .view-bar {
        gap: 0.35rem;
    }

    .view-dirty {
        font-size: 0.7rem;
    }
}
</style>

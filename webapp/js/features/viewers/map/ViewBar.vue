<template>
    <div class="view-bar" role="toolbar" aria-label="View">
        <i class="fa-solid fa-map view-icon" aria-hidden="true" />
        <span class="view-name" :title="name">{{ name }}</span>
        <span v-if="dirty && canWrite" class="view-dirty">Unsaved changes</span>
        <div v-if="canWrite" class="view-actions">
            <Button size="small" icon="fa-solid fa-floppy-disk" label="Save" :disabled="busy" :loading="busy"
                    :title="saved ? 'Save the changes to this view' : 'Save this view in the dataset'" @click="emit('save')" />
            <Button v-if="saved" size="small" severity="secondary" label="Save as new" :disabled="busy" :loading="busy"
                    title="Save as a new view" @click="emit('saveAsNew')" />
        </div>
    </div>
</template>

<script setup>
/**
 * ViewBar - the bar above the map of the map viewer: the name of the view (the saved name, or
 * the name of the base file of a new view; always text), the mark of unsaved changes and, for a
 * user who can save, Save (a new or a saved view) and Save as new (a saved view). A reader sees
 * the name only. The viewer leaves the bar out of a map in Viewer only.
 *
 * It is one line at any width: a long name ends with an ellipsis (the full name is its title).
 */
import Button from 'primevue/button';

defineProps({
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
</script>

<style scoped>
.view-bar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.4rem 0.75rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg);
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

.view-actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
}

/* Room for the name on a phone: the buttons keep their words, not their icons */
@media (max-width: 575.98px) {
    .view-bar {
        gap: 0.35rem;
        padding: 0.35rem 0.5rem;
    }

    .view-dirty {
        font-size: 0.7rem;
    }

    .view-actions :deep(.p-button-icon) {
        display: none;
    }
}
</style>

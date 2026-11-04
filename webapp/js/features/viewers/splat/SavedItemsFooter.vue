<template>
    <div class="items-footer">
        <Button v-if="canWrite" :label="addLabel" icon="fa-solid fa-plus" text @click="emit('add')" />
        <span class="spacer" />
        <Button v-if="canWrite" :label="dirty ? 'Save *' : 'Save'" :disabled="!dirty" @click="emit('save')" />
        <Button label="Close" severity="secondary" text @click="emit('close')" />
    </div>
    <small v-if="!canWrite" class="readonly-note">
        <i class="fa-solid fa-lock" /> Read-only access: {{ readOnlyNote }}
    </small>
</template>

<script setup>
/**
 * The foot of the panels that list what is saved with a splat (camera views, pins): add, save and
 * close for a user who can write, and a note for one who cannot.
 */
import Button from 'primevue/button';

defineProps({
    addLabel: { type: String, required: true },
    canWrite: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false },
    /** Completes "Read-only access: ..." */
    readOnlyNote: { type: String, required: true }
});
const emit = defineEmits(['add', 'save', 'close']);
</script>

<style scoped>
.items-footer {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: var(--ddb-spacing-sm);
}

.spacer {
    flex: 1 1 auto;
}

.readonly-note {
    color: var(--ddb-text-muted);
}

.readonly-note i {
    margin-right: 0.3rem;
}
</style>

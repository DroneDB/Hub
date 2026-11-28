<template>
    <div class="report-bar">
        <i :class="REPORT_ICON" class="report-bar-icon" aria-hidden="true" />
        <h1 class="report-bar-name" :title="name">{{ name }}</h1>
        <div class="report-bar-actions" role="toolbar" aria-label="Report actions">
            <!-- The exports of the report (Download PDF, Publish PDF) go here: they are the reader's, and the editor's -->
            <slot name="export" />
            <template v-if="canWrite">
                <Button size="small" severity="secondary" icon="fa-solid fa-pen" label="Edit" data-testid="report-edit" @click="emit('edit')" />
                <Button size="small" severity="danger" outlined icon="fa-solid fa-trash" label="Delete" data-testid="report-delete" @click="emit('delete')" />
            </template>
        </div>
    </div>
</template>

<script setup>
/**
 * The content of the bar of the report page (ViewerShell's bar, after the way back to the dataset): the name of the
 * report, which is the h1 of the page, and its actions. Edit and Delete show to those who can write only; the
 * `export` slot holds the actions that make a PDF of the report.
 */
import Button from 'primevue/button';
import { REPORT_ICON } from '@/libs/glyphs';

defineProps({
    name: { type: String, required: true },
    canWrite: { type: Boolean, default: false }
});
const emit = defineEmits(['edit', 'delete']);
</script>

<style scoped>
.report-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.report-bar-name {
    flex: 1 1 8rem;
    min-width: 0;
    margin: 0;
    font-size: var(--ddb-font-size-base, 1rem);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.report-bar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-sm);
}
</style>

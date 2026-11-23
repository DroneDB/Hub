<template>
    <fieldset class="report-editor-labels mb-4" :aria-describedby="shown('labels') ? 'report-labels-error' : undefined">
        <legend class="fw-semibold">Labels of the measurement files</legend>
        <p class="text-muted">Shown in front of the references of the items of each file (A1, B2 ...).</p>
        <p v-if="!draft.sources.length" class="text-muted mb-0">Choose a measurement file first.</p>
        <ul v-else class="report-source-list">
            <li v-for="(source, index) in draft.sources" :key="source.file" class="report-source">
                <label :for="`report-source-label-${index}`" class="visually-hidden">Label of {{ source.file }}</label>
                <InputText :id="`report-source-label-${index}`" v-model="source.label" class="report-source-label" maxlength="3" autocomplete="off"
                           @update:model-value="source.label = String($event).toUpperCase()" />
                <span class="report-source-file" :title="source.file">{{ source.file }}</span>
            </li>
        </ul>
        <FieldError id="report-labels-error" :message="shown('labels')" />
    </fieldset>
</template>

<script setup>
/**
 * The labels of the measurement files of the report editor (A, B, C ... as they are chosen), which a user can change.
 * The files themselves are chosen with the name and the view (ReportEditorEssentials).
 */
import InputText from 'primevue/inputtext';
import FieldError from '@/components/FieldError.vue';
import { injectReportEditor } from './useReportEditor';

const editor = injectReportEditor();
const { draft } = editor;

/** The problem of a field, once a save was tried. @param {string} field */
const shown = field => (editor.showProblems.value ? editor.problems.value[field] ?? '' : '');
</script>

<style scoped>
.report-source-list {
    margin: 0 0 var(--ddb-spacing-sm);
    padding: 0;
    list-style: none;
}

.report-source {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    margin-bottom: var(--ddb-spacing-xs);
}

.report-source-label {
    width: 4.5rem;
    text-align: center;
}

.report-source-file {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

fieldset {
    border: 0;
    padding: 0;
    margin-left: 0;
    margin-right: 0;
}
</style>

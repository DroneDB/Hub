<template>
    <div class="report-editor-details">
        <ReportSettingsField id="report-name" label="Name" :error="shown('name')" :count="`${draft.name.length}/${MAX_REPORT_NAME_LENGTH}`">
            <template #default="{ describedBy, invalid }">
                <InputText id="report-name" v-model="draft.name" class="w-100" :maxlength="MAX_REPORT_NAME_LENGTH" autocomplete="off" data-autofocus
                           :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" required />
            </template>
        </ReportSettingsField>

        <div class="mb-3">
            <label id="report-template-label" for="report-template" class="d-block mb-1 fw-semibold">Template</label>
            <Select :model-value="editor.resolvedTemplate.value.id" input-id="report-template" aria-labelledby="report-template-label"
                    :options="editor.templates.value" option-label="name" option-value="id" class="w-100"
                    @update:model-value="editor.chooseTemplate($event)" />
            <PrimeMessage v-if="editor.templateNotice.value" severity="info" :closable="false" class="mt-2" data-testid="template-notice">
                {{ editor.templateNotice.value }}
            </PrimeMessage>
        </div>

        <ReportSettingsField v-for="field in TEXT_FIELDS" :id="`report-${field.key}`" :key="field.key" :label="field.label" :error="shown(field.key)"
                             :count="`${draft[field.key].length}/${MAX_TEXT_LENGTH}`">
            <template #default="{ describedBy, invalid }">
                <InputText :id="`report-${field.key}`" v-model="draft[field.key]" class="w-100" :maxlength="MAX_TEXT_LENGTH" autocomplete="off"
                           :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" />
            </template>
        </ReportSettingsField>

        <ReportSettingsField id="report-notes" label="Notes" hint="Markdown. Shown in the Notes section." :error="shown('notes')"
                             :count="`${draft.notes.length}/${MAX_NOTES_LENGTH}`">
            <template #default="{ describedBy, invalid }">
                <Textarea id="report-notes" v-model="draft.notes" class="w-100" rows="5" auto-resize :maxlength="MAX_NOTES_LENGTH"
                          :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" />
            </template>
        </ReportSettingsField>

        <div class="mb-3">
            <label id="report-units-label" for="report-units" class="d-block mb-1 fw-semibold">Units</label>
            <Select :model-value="draft.units ?? ''" input-id="report-units" aria-labelledby="report-units-label" :options="UNIT_OPTIONS"
                    option-label="label" option-value="value" class="w-100" @update:model-value="draft.units = $event || null" />
        </div>
    </div>
</template>

<script setup>
/**
 * The first part of the report editor: the name, the template, the texts of the cover, the notes and the units. A
 * field says what is wrong with it once a save was tried.
 */
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import ReportSettingsField from '@/features/organizations/ReportSettingsField.vue';
import { MAX_NOTES_LENGTH, MAX_TEXT_LENGTH } from '@/libs/reports/reportDefinition';
import { MAX_REPORT_NAME_LENGTH } from '@/libs/reports/reportStore';
import { injectReportEditor } from './useReportEditor';

const TEXT_FIELDS = [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'preparedBy', label: 'Prepared by' },
    { key: 'preparedFor', label: 'Prepared for' }
];
const UNIT_OPTIONS = [
    { value: '', label: 'The units each reader has chosen' },
    { value: 'metric', label: 'Metric' },
    { value: 'imperial', label: 'Imperial' }
];

const editor = injectReportEditor();
const { draft } = editor;

/** The problem of a field, once a save was tried. @param {string} field */
const shown = field => (editor.showProblems.value ? editor.problems.value[field] ?? '' : '');
</script>

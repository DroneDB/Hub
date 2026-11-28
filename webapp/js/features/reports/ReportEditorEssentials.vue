<template>
    <div class="report-editor-essentials">
        <ReportSettingsField id="report-name" label="Name" :error="shown('name')" :count="`${draft.name.length}/${MAX_REPORT_NAME_LENGTH}`">
            <template #default="{ describedBy, invalid }">
                <InputText id="report-name" v-model="draft.name" class="w-100" :maxlength="MAX_REPORT_NAME_LENGTH" autocomplete="off" data-autofocus
                           :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" required @focus="selectOnce" />
            </template>
        </ReportSettingsField>

        <ReportSettingsField id="report-sources" label="Measurement files" :error="shown('sources')"
                             :hint="editor.measurementFiles.value.length ? 'The files whose measurements and annotations the report lists.' : NO_FILES_TEXT">
            <template #default="{ describedBy, invalid }">
                <MultiSelect :model-value="sourceFiles" input-id="report-sources" aria-labelledby="report-sources-label" :options="editor.measurementFiles.value"
                             display="chip" filter :show-toggle-all="false" placeholder="Choose the measurement files" class="w-100"
                             :invalid="invalid" :aria-describedby="describedBy" :empty-message="NO_FILES_TEXT"
                             @update:model-value="editor.setSources($event ?? [])" />
            </template>
        </ReportSettingsField>

        <ReportSettingsField id="report-view" label="View" :error="shown('view')" :hint="viewHint">
            <template #default="{ describedBy, invalid }">
                <Select v-if="viewOptions.length" :model-value="viewValue" input-id="report-view" aria-labelledby="report-view-label" :options="viewOptions"
                        option-label="label" option-value="value" option-group-label="label" option-group-children="items"
                        placeholder="Choose the view the maps are drawn on" class="w-100" :invalid="invalid" :aria-describedby="describedBy"
                        @update:model-value="onView" />
                <p v-else class="mb-0" data-testid="no-view">
                    This dataset has no saved view and no map file to make one of. Open a file on the map and use Save view first.
                </p>
            </template>
        </ReportSettingsField>

        <div v-if="newView" class="report-new-view" data-testid="new-view">
            <div v-if="choice.kind === 'fromFile'" class="mb-3">
                <label id="report-view-file-label" for="report-view-file" class="d-block mb-1">File the view shows</label>
                <Select :model-value="choice.path" input-id="report-view-file" aria-labelledby="report-view-file-label" :options="fileOptions"
                        option-label="label" option-value="path" filter class="w-100" @update:model-value="editor.chooseFile($event)" />
            </div>
            <label id="report-view-name-label" for="report-view-name" class="d-block mb-1">Name of the new view</label>
            <InputText id="report-view-name" :model-value="choice.name" class="w-100" :maxlength="MAX_NAME_LENGTH" autocomplete="off"
                       @update:model-value="editor.nameView(String($event ?? ''))" />
        </div>
    </div>
</template>

<script setup>
/**
 * What a report needs: its name, the measurement files it reads and the view its maps are drawn on. The view is a
 * saved view or a new one, made of the map the editor was opened from or of a file of the dataset; a new view is saved
 * with the report and is listed with the dataset's saved views. A field says what is wrong with it once a save was tried.
 */
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import ReportSettingsField from '@/features/organizations/ReportSettingsField.vue';
import { MAX_REPORT_NAME_LENGTH } from '@/libs/reports/reportStore';
import { MAX_NAME_LENGTH } from '@/libs/views/viewState';
import { injectReportEditor } from './useReportEditor';

const NO_FILES_TEXT = 'This dataset has no measurement file yet: measure on the map and save the measurements first.';

const editor = injectReportEditor();
const { draft } = editor;

/** The problem of a field, once a save was tried. @param {string} field */
const shown = field => (editor.showProblems.value ? editor.problems.value[field] ?? '' : '');

// The name is filled in: its first focus selects it, so typing replaces it
let selected = false;
/** @param {FocusEvent} event */
function selectOnce(event) {
    if (selected) return;
    selected = true;
    /** @type {HTMLInputElement} */ (event.target).select();
}

const sourceFiles = computed(() => draft.sources.map(s => s.file));

const choice = computed(() => /** @type {any} */ (editor.viewChoice.value));
const newView = computed(() => choice.value?.kind === 'fromMap' || choice.value?.kind === 'fromFile');

const viewOptions = computed(() => [
    { label: 'Saved views', items: editor.views.value.map(v => ({ value: `saved:${v.uid}`, label: v.name })) },
    {
        label: 'New view, saved with the report',
        items: [
            ...(editor.hasMapView ? [{ value: 'fromMap', label: 'The map as it is now' }] : []),
            ...(editor.baseFiles.value.length ? [{ value: 'fromFile', label: 'A file of the dataset' }] : [])
        ]
    },
    { label: 'This report', items: editor.hasKeptView ? [{ value: 'kept', label: 'The view this report keeps' }] : [] }
].filter(group => group.items.length));

const viewValue = computed(() => {
    const current = choice.value;
    if (!current) return null;
    return current.kind === 'saved' ? `saved:${current.uid}` : current.kind;
});

/** @param {string|null} value */
function onView(value) {
    if (!value) return;
    const [kind, uid] = value.split(':');
    editor.chooseView(/** @type {any} */ (kind), uid);
}

const fileOptions = computed(() => editor.baseFiles.value.map(f => ({ path: f.path, label: f.path })));

const viewHint = computed(() => {
    if (!newView.value) return 'The layers and the basemap every map of the report is drawn on.';
    return editor.views.value.length
        ? 'Saved under Views when the report is created, so the report and its links can open it.'
        : 'This dataset has no saved views yet. The report saves this one under Views, so the report and its links can open it.';
});
</script>

<style scoped>
.report-new-view {
    margin: calc(-1 * var(--ddb-spacing-sm)) 0 var(--ddb-spacing-md);
    padding-left: var(--ddb-spacing-md);
    border-left: var(--ddb-border-width) solid var(--ddb-border);
}
</style>

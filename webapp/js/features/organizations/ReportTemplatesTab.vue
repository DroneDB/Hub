<template>
    <div class="templates-tab">
        <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div class="template-picker">
                <label id="report-template-picker-label" for="report-template-picker" class="d-block mb-1 fw-semibold">Template</label>
                <Select v-model="selected" input-id="report-template-picker" aria-labelledby="report-template-picker-label" :options="options"
                        option-label="label" option-value="value" class="w-100" />
            </div>
            <template v-if="!readOnly">
                <ActionButton severity="secondary" outlined icon="fa-solid fa-plus" show-label label="Add template" :disabled="!canAdd"
                              :disabled-reason="`At most ${limits.max} templates`" @click="add" />
                <ActionButton severity="danger" text icon="fa-solid fa-trash" show-label label="Delete template" :disabled="!canRemove"
                              :disabled-reason="'Keep at least one template'" @click="remove" />
            </template>
        </div>
        <FieldError id="report-templates-error" :message="listError" />
        <small v-if="!readOnly" class="d-block text-muted mb-3">A deleted template goes when you save; reports that use it fall back to the first template.</small>

        <div v-if="template" :key="selected" class="d-flex flex-wrap gap-4 align-items-start">
            <div class="template-fields">
                <ReportSettingsField id="report-template-name" v-slot="{ describedBy, invalid }" label="Name" :error="errorAt('name')" :count="`${(template.name ?? '').length}/${nameMax}`">
                    <InputText id="report-template-name" :model-value="template.name" class="w-100" autocomplete="off" :maxlength="nameMax"
                               :disabled="readOnly" :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy"
                               @update:model-value="rename" />
                </ReportSettingsField>
                <p class="template-id text-muted">
                    ID <code>{{ template.id || '(made from the name)' }}</code>
                    <template v-if="isSaved"> - fixed once saved; renaming changes only the name shown</template>
                </p>
                <FieldError id="report-template-id-error" :message="errorAt('id')" />

                <div class="d-flex flex-wrap gap-4">
                    <div v-for="colour in colourFields" :key="colour.field" class="mb-3" role="group" :aria-labelledby="`report-template-${colour.field}-label`">
                        <span :id="`report-template-${colour.field}-label`" class="d-block mb-1 fw-semibold">{{ colour.label }}</span>
                        <ColorSwatchPicker v-if="!readOnly" v-model="template[colour.field]" :input-id="`report-template-${colour.field}`" :label="colour.label" :swatches="swatches" />
                        <span v-else class="colour-value"><span class="colour-dot" :style="{ background: template[colour.field] }" aria-hidden="true" /> {{ template[colour.field] }}</span>
                        <FieldError :id="`report-template-${colour.field}-error`" :message="errorAt(colour.field)" />
                    </div>
                </div>

                <div class="d-flex flex-wrap gap-3">
                    <ReportSettingsField id="report-template-paper" v-slot="{ describedBy }" label="Paper" :error="errorAt('paper')">
                        <Select v-model="template.paper" input-id="report-template-paper" aria-labelledby="report-template-paper-label" :options="papers" :disabled="readOnly" :aria-describedby="describedBy" />
                    </ReportSettingsField>
                    <ReportSettingsField id="report-template-orientation" v-slot="{ describedBy }" label="Orientation" :error="errorAt('orientation')">
                        <Select v-model="template.orientation" input-id="report-template-orientation" aria-labelledby="report-template-orientation-label" :options="orientations" option-label="label"
                                option-value="value" :disabled="readOnly" :aria-describedby="describedBy" />
                    </ReportSettingsField>
                </div>

                <ReportSettingsField id="report-template-header" v-slot="{ describedBy, invalid }" label="Header text" :error="errorAt('headerText')" :count="`${(template.headerText ?? '').length}/${limits.headerText}`">
                    <InputText id="report-template-header" v-model="template.headerText" class="w-100" autocomplete="off" :maxlength="limits.headerText"
                               :disabled="readOnly" :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" />
                </ReportSettingsField>
                <ReportSettingsField id="report-template-footer" v-slot="{ describedBy, invalid }" label="Footer text" :error="errorAt('footerText')" :count="`${(template.footerText ?? '').length}/${limits.footerText}`">
                    <InputText id="report-template-footer" v-model="template.footerText" class="w-100" autocomplete="off" :maxlength="limits.footerText"
                               :disabled="readOnly" :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" />
                </ReportSettingsField>
                <ReportSettingsField id="report-template-disclaimer" v-slot="{ describedBy, invalid }" label="Disclaimer"
                                     hint="Markdown. It closes every report made from this template." :error="errorAt('disclaimer')" :count="`${(template.disclaimer ?? '').length}/${limits.disclaimer}`">
                    <Textarea id="report-template-disclaimer" v-model="template.disclaimer" class="w-100" rows="4" auto-resize :maxlength="limits.disclaimer"
                              :disabled="readOnly" :invalid="invalid" :aria-invalid="invalid ? 'true' : undefined" :aria-describedby="describedBy" />
                </ReportSettingsField>

                <fieldset class="mb-3 sections" :disabled="readOnly">
                    <legend class="fw-semibold mb-1">Sections of a new report</legend>
                    <div class="d-flex flex-wrap gap-3">
                        <div v-for="kind in sectionKinds" :key="kind" class="d-flex align-items-center gap-1">
                            <Checkbox v-model="template.defaultSections" :value="kind" :disabled="readOnly" :input-id="`report-template-section-${kind}`" />
                            <label :for="`report-template-section-${kind}`">{{ sectionLabels[kind] }}</label>
                        </div>
                    </div>
                    <small class="d-block mt-1 text-muted">Reports that exist keep the sections they have.</small>
                    <FieldError id="report-template-sections-error" :message="errorAt('defaultSections')" />
                </fieldset>

                <div class="mb-3 logo-field" role="group" aria-labelledby="report-template-logo-label">
                    <span id="report-template-logo-label" class="d-block mb-1 fw-semibold">Logo</span>
                    <div class="d-flex flex-wrap align-items-center gap-2">
                        <img v-if="logoSrc" :src="logoSrc" alt="Logo of the template" class="logo-image">
                        <span v-else class="text-muted">No logo: reports show the logo of the site, if it has one.</span>
                        <template v-if="!readOnly">
                            <ActionButton severity="secondary" outlined size="small" icon="fa-solid fa-upload" show-label
                                          :label="template.logo ? 'Replace logo' : 'Upload logo'" :disabled="!isSaved || logoBusy"
                                          :disabled-reason="isSaved ? 'A logo is being sent' : 'Save the template to add a logo'" @click="chooseLogo" />
                            <ActionButton v-if="template.logo" severity="danger" text size="small" icon="fa-solid fa-trash" show-label label="Remove logo"
                                          :disabled="logoBusy" disabled-reason="A logo is being sent" @click="emit('remove-logo', template.id)" />
                        </template>
                    </div>
                    <input ref="logoInput" type="file" hidden :accept="logoTypes.join(',')" aria-label="Logo file" @change="onLogoChosen">
                    <small class="d-block mt-1 text-muted">PNG, JPEG, WebP or SVG, up to {{ limits.logoBytes / 1024 }} KB.</small>
                    <FieldError id="report-template-logo-error" :message="logoError" />
                </div>
            </div>
            <ReportTemplatePreview class="template-preview-column" :template="template" :logo-src="logoSrc" />
        </div>
    </div>
</template>

<script setup>
/**
 * The templates of the organization: the one being edited (picked in the list; added and deleted here, the last
 * one stays) with its name, colours, paper, texts, disclaimer, the sections of a new report and its logo, and a
 * preview page that follows the values. The id of a new template is made from its name and follows it until it is
 * saved. The logo is the Registry's, sent at once (`upload-logo`, `remove-logo`: the dialog asks the Registry and keeps
 * the version it answers with), and only for a template that is saved: the Registry has no template to give the logo to
 * before that.
 */
import { computed, ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import ActionButton from '@/components/ActionButton.vue';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import FieldError from '@/components/FieldError.vue';
import ReportSettingsField from './ReportSettingsField.vue';
import ReportTemplatePreview from './ReportTemplatePreview.vue';
import {
    LIMITS, LOGO_TYPES, ORIENTATIONS, PAPERS, REPORT_SWATCHES, SECTION_KINDS, SECTION_LABELS,
    canAddEntry, canRemoveEntry, idFromName, logoProblem, newTemplate, problemAt, takenIds
} from '@/libs/reports/reportSettings';

const templates = defineModel({ type: Array, required: true });
/** The index of the template being edited */
const selected = defineModel('selected', { type: Number, default: 0 });
const props = defineProps({
    readOnly: { type: Boolean, default: false },
    /** The problems by path (keyProblems), the Registry's and the form's */
    errors: { type: Object, default: () => ({}) },
    /** The ids of the templates that are stored */
    savedIds: { type: Object, default: () => new Set() },
    /** The address of the logo of a template, or '' (it has none, or is not stored) */
    logoUrl: { type: Function, default: () => '' },
    /** A logo is being sent or removed */
    logoBusy: { type: Boolean, default: false }
});
const emit = defineEmits(['upload-logo', 'remove-logo']);

const limits = LIMITS;
const nameMax = LIMITS.name.max;
const swatches = REPORT_SWATCHES;
const colourFields = [{ field: 'primary', label: 'Primary colour' }, { field: 'accent', label: 'Accent colour' }];
const papers = PAPERS;
const orientations = ORIENTATIONS.map(value => ({ value, label: value === 'portrait' ? 'Portrait' : 'Landscape' }));
const sectionKinds = SECTION_KINDS;
const sectionLabels = SECTION_LABELS;
const logoTypes = LOGO_TYPES;

const logoInput = ref(null);
const logoError = ref('');

const template = computed(() => templates.value[selected.value] ?? null);
const options = computed(() => templates.value.map((t, index) => ({ value: index, label: t.name?.trim() || `Template ${index + 1}` })));
const isSaved = computed(() => !!template.value && props.savedIds.has(template.value.id));
const canAdd = computed(() => canAddEntry('templates', templates.value));
const canRemove = computed(() => canRemoveEntry('templates', templates.value));
const listError = computed(() => problemAt(props.errors, 'templates'));
const logoSrc = computed(() => (template.value?.logo ? props.logoUrl(template.value) : ''));

// A template that goes (or a list that is read again) can leave the index beyond the end
watch(() => templates.value.length, length => {
    if (selected.value >= length) selected.value = Math.max(0, length - 1);
});
// The error of a logo is about the template it was chosen for
watch(selected, () => { logoError.value = ''; });

const errorAt = field => problemAt(props.errors, `templates.${selected.value}.${field}`);

function add() {
    if (!canAdd.value) return;
    templates.value.push(newTemplate(templates.value, undefined, props.savedIds));
    selected.value = templates.value.length - 1;
}

function remove() {
    if (!canRemove.value) return;
    templates.value.splice(selected.value, 1);
}

function rename(name) {
    const current = template.value;
    current.name = name;
    if (!isSaved.value) current.id = idFromName(name, takenIds(templates.value, props.savedIds, current));
}

function chooseLogo() {
    logoError.value = '';
    logoInput.value?.click();
}

function onLogoChosen(event) {
    const input = event.target;
    const [file] = input.files ?? [];
    // Choosing the same file again must still fire a change
    input.value = '';
    if (!file) return;
    const problem = logoProblem(file);
    logoError.value = problem ?? '';
    if (!problem) emit('upload-logo', template.value.id, file);
}
</script>

<style scoped>
.template-picker {
    flex: 1 1 14rem;
    max-width: 24rem;
}

.template-fields {
    flex: 1 1 22rem;
    min-width: 0;
}

.template-preview-column {
    flex: 0 1 24rem;
    min-width: 0;
}

.template-id {
    margin: -0.5rem 0 var(--ddb-spacing-xs);
}

.sections {
    border: 0;
    padding: 0;
    min-width: 0;
}

.sections legend {
    float: none;
    width: auto;
    font-size: 1rem;
}

.logo-image {
    max-height: 3rem;
    max-width: 10rem;
    object-fit: contain;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-paper);
    padding: 0.25rem;
}

.colour-value {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.colour-dot {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: var(--ddb-radius-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
}
</style>

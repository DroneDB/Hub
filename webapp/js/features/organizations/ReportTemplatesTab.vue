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
                    <ReportSettingsField id="report-template-breakdown" v-slot="{ describedBy }" label="Summary charts" :error="errorAt('breakdownChart')"
                                         hint="The Breakdown of the summary">
                        <Select v-model="template.breakdownChart" input-id="report-template-breakdown" aria-labelledby="report-template-breakdown-label" :options="breakdownCharts" option-label="label"
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

                <fieldset class="mb-3 logo-field">
                    <legend class="fw-semibold mb-1">Logo</legend>
                    <div :key="logoModeKey" class="d-flex flex-wrap gap-3 mb-2">
                        <div v-for="mode in logoModes" :key="mode.value" class="d-flex align-items-center gap-1">
                            <RadioButton :model-value="logoMode" :value="mode.value" name="report-template-logo-mode" :input-id="`report-template-logo-${mode.value}`"
                                         :disabled="readOnly || logoWorking" @update:model-value="chooseLogoMode" />
                            <label :for="`report-template-logo-${mode.value}`">{{ mode.label }}</label>
                        </div>
                    </div>
                    <div v-if="logoMode === 'organization'" class="d-flex flex-wrap align-items-center gap-2" data-test="organization-logo">
                        <img v-if="organizationLogoUrl" :src="organizationLogoUrl" alt="Logo of the organization" class="logo-image">
                        <span v-else class="text-muted">The organization has no logo: reports show the logo of the site, if it has one. Add one with Edit organization.</span>
                    </div>
                    <template v-else>
                        <div class="d-flex flex-wrap align-items-center gap-2" data-test="custom-logo">
                            <img v-if="logoSrc" :src="logoSrc" alt="Logo of the template" class="logo-image">
                            <span v-else-if="readOnly || isSaved" class="text-muted">Upload the logo of this template. Until then reports show the organization logo.</span>
                            <ActionButton v-if="!readOnly" severity="secondary" outlined size="small" icon="fa-solid fa-upload" show-label
                                          :label="template.logo ? 'Replace logo' : 'Upload logo'" :disabled="!isSaved || logoWorking"
                                          :disabled-reason="isSaved ? 'A logo is being prepared and sent' : 'Save the template to add a logo'" @click="chooseLogo" />
                        </div>
                        <small v-if="preparing" class="d-block mt-1 text-muted" role="status">Preparing the logo…</small>
                        <small v-if="!readOnly" class="d-block mt-1 text-muted">{{ logoHint }}</small>
                    </template>
                    <input ref="logoInput" type="file" hidden accept="image/*" aria-label="Logo file" @change="onLogoChosen">
                    <FieldError id="report-template-logo-error" :message="logoError" />
                </fieldset>
            </div>
            <ReportTemplatePreview class="template-preview-column" :template="template" :logo-src="previewLogoSrc" />
        </div>
    </div>
</template>

<script setup>
/**
 * The templates of the organization: the one being edited (picked in the list; added and deleted here, the last
 * one stays) with its name, colours, paper, texts, disclaimer, the sections of a new report and its logo, and a
 * preview page that follows the values. The id of a new template is made from its name and follows it until it is
 * saved. The logo is the organization's (the one Edit organization sets) or a custom one of the template: a template
 * with a custom logo is Custom, and choosing Organization asks to remove it (`remove-logo`). The custom logo is the
 * Registry's, prepared in the browser (libs/logoImage: shrunk and saved as WebP, an SVG kept) and sent at once
 * (`upload-logo`, with what was prepared: the dialog asks the Registry and keeps the version it answers with), and only
 * for a template that is saved: the Registry has no template to give the logo to before that. The preview shows the logo
 * a report would show (resolveLogo).
 */
import { computed, ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import ActionButton from '@/components/ActionButton.vue';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import FieldError from '@/components/FieldError.vue';
import ReportSettingsField from './ReportSettingsField.vue';
import ReportTemplatePreview from './ReportTemplatePreview.vue';
import { instanceLogoUrl } from '@/libs/hubBranding';
import { LOGO_INPUT_HINT, prepareLogoFor } from '@/libs/logoImage';
import { LOGO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';
import { resolveLogo } from '@/libs/reports/reportModel';
import {
    BREAKDOWN_CHARTS, LIMITS, ORIENTATIONS, PAPERS, REPORT_SWATCHES, SECTION_KINDS, SECTION_LABELS,
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
    /** The address of the logo of the organization, or '' (it has none) */
    organizationLogoUrl: { type: String, default: '' },
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
const breakdownCharts = BREAKDOWN_CHARTS.map(value => ({ value, label: value === 'bars' ? 'Bars' : 'Donuts' }));
const sectionKinds = SECTION_KINDS;
const sectionLabels = SECTION_LABELS;
const logoHint = LOGO_INPUT_HINT;
const logoModes = [{ value: 'organization', label: 'Organization logo' }, { value: 'custom', label: 'Custom logo' }];

const logoInput = ref(null);
const logoError = ref('');
const preparing = ref(false);
// The id of the template whose Custom was chosen before it has a logo of its own (an id, so the choice outlives the
// save that reads the templates again, and follows a new template's id as it is renamed); a new key puts the radios back to what the
// template has when a choice is only asked for (Organization over a custom logo waits for the removal)
const customChosen = ref(null);
const logoModeKey = ref(0);

const template = computed(() => /** @type {import('@/libs/reports/reportSettings').ReportTemplate | null} */ (templates.value[selected.value] ?? null));
const options = computed(() => templates.value.map((t, index) => ({ value: index, label: t.name?.trim() || `Template ${index + 1}` })));
const isSaved = computed(() => !!template.value && props.savedIds.has(template.value.id));
const canAdd = computed(() => canAddEntry('templates', templates.value));
const canRemove = computed(() => canRemoveEntry('templates', templates.value));
const listError = computed(() => problemAt(props.errors, 'templates'));
const logoSrc = computed(() => (template.value?.logo ? props.logoUrl(template.value) : ''));
const logoWorking = computed(() => props.logoBusy || preparing.value);
const logoMode = computed(() => (template.value?.logo || (customChosen.value !== null && customChosen.value === template.value?.id) ? 'custom' : 'organization'));
const previewLogoSrc = computed(() => resolveLogo(template.value ?? {},
    { organizationLogoUrl: props.organizationLogoUrl, brandingLogoUrl: instanceLogoUrl() },
    { templateLogoUrl: props.logoUrl })?.url ?? '');

// A template that goes (or a list that is read again) can leave the index beyond the end
watch(() => templates.value.length, length => {
    if (selected.value >= length) selected.value = Math.max(0, length - 1);
});
// The error of a logo, and a Custom without a logo yet, are about the template they were chosen for
watch(selected, () => {
    logoError.value = '';
    customChosen.value = null;
});

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
    if (isSaved.value) return;
    const chosen = customChosen.value === current.id;
    current.id = idFromName(name, takenIds(templates.value, props.savedIds, current));
    if (chosen) customChosen.value = current.id;
}

function chooseLogo() {
    logoError.value = '';
    logoInput.value?.click();
}

function chooseLogoMode(mode) {
    logoError.value = '';
    if (mode === 'custom') {
        customChosen.value = template.value.id;
        return;
    }
    customChosen.value = null;
    if (template.value?.logo) {
        logoModeKey.value++;
        emit('remove-logo', template.value.id);
    }
}

async function onLogoChosen(event) {
    const input = event.target;
    const [file] = input.files ?? [];
    // Choosing the same file again must still fire a change
    input.value = '';
    if (!file) return;
    const templateId = template.value.id;
    logoError.value = '';
    preparing.value = true;
    try {
        // What is sent is the logo made from the file: at most the limit, and as wide as the PDF ever draws it
        const logo = await prepareLogoFor(file, { maxBytes: limits.logoBytes, maxEdge: LOGO_MAX_SIDE, problemOf: logoProblem });
        emit('upload-logo', templateId, logo.file, logo);
    } catch (e) {
        logoError.value = e instanceof Error ? e.message : 'The logo could not be prepared';
    } finally {
        preparing.value = false;
    }
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

.sections,
.logo-field {
    border: 0;
    padding: 0;
    min-width: 0;
}

.sections legend,
.logo-field legend {
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

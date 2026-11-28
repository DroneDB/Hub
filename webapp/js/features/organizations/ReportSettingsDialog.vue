<template>
    <Window id="reportSettingsDialog" title="Report settings" modal size-class="dialog-log" fixed-size :busy="busy"
            :confirm-label="canEdit ? 'Save' : ''" :close-button="!canEdit" cancel-label="Close" :enter-confirms="false"
            @confirm="save" @close="requestClose">
        <div ref="root" class="report-settings">
            <div v-if="loading" class="ui active centered inline loader" role="status" aria-label="Loading the report settings" />

            <PrimeMessage v-else-if="loadError" severity="error" role="alert" :closable="false">
                <strong>Error</strong>: {{ loadError }}
                <div class="mt-2"><Button severity="secondary" size="small" label="Retry" icon="fa-solid fa-rotate-right" @click="load" /></div>
            </PrimeMessage>

            <template v-else>
                <PrimeMessage v-if="!canEdit" severity="info" :closable="false" class="mb-3" data-test="read-only-note">
                    Only an administrator of the organization can change the report settings. You can look at them here.
                </PrimeMessage>

                <PrimeMessage v-if="formError || serverMessages.length || problemCount" severity="error" role="alert" class="mb-3 form-error" data-test="form-error">
                    <template v-if="formError">{{ formError }}</template>
                    <ul v-if="serverMessages.length" class="mb-0">
                        <li v-for="message in serverMessages" :key="message">{{ message }}</li>
                    </ul>
                    <template v-else-if="problemCount">Fix {{ problemCount === 1 ? 'the problem' : `the ${problemCount} problems` }} marked below, then save.</template>
                </PrimeMessage>

                <Tabs v-model:value="activeTab">
                    <TabList>
                        <Tab value="templates"><i class="fa-solid fa-file-lines" aria-hidden="true" /><span class="tab-label">Templates</span></Tab>
                        <Tab value="schema"><i class="fa-solid fa-tags" aria-hidden="true" /><span class="tab-label">Annotation schema</span></Tab>
                    </TabList>
                    <TabPanels>
                        <TabPanel value="templates">
                            <ReportTemplatesTab v-model="draft.templates" v-model:selected="selectedTemplate" :read-only="!canEdit" :errors="errors"
                                                :saved-ids="saved.templates" :logo-url="logoUrl" :organization-logo-url="organizationLogoUrl" :logo-busy="logoBusy"
                                                @upload-logo="uploadLogo" @remove-logo="askRemoveLogo" />
                        </TabPanel>
                        <TabPanel value="schema">
                            <p class="text-muted">The values an annotation takes its category, severity and status from. A report shows them in this order.</p>
                            <ReportSchemaList v-for="list in schemaLists" :key="list.key" v-model="draft.schema[list.key]" :list="list" :read-only="!canEdit"
                                              :errors="errors" :saved-ids="saved[list.key]" class="mb-4" />
                        </TabPanel>
                    </TabPanels>
                </Tabs>
            </template>
        </div>

        <ConfirmDialog v-if="conflictOpen"
                       title="The settings changed"
                       message="Someone else saved the report settings of this organization while you were editing. Reload to see their version; your unsaved changes are lost."
                       confirm-text="Reload" cancel-text="Keep editing" @close="onConflictClose" />
        <ConfirmDialog v-if="discardOpen"
                       title="Discard the changes?"
                       message="The report settings have changes that are not saved."
                       confirm-text="Discard changes" cancel-text="Keep editing" confirm-button-class="danger" @close="onDiscardClose" />
        <ConfirmDialog v-if="logoRemoval"
                       title="Use the organization logo"
                       :message="`Remove the custom logo of <strong>${escapeHtml(logoRemoval.name)}</strong>? Reports made from it show the logo of the organization (or of the site, when the organization has none).`"
                       confirm-text="Remove custom logo" cancel-text="Cancel" confirm-button-class="danger" @close="onLogoRemovalClose" />
    </Window>
</template>

<script setup>
/**
 * The report settings of an organization: its templates (name, colours, paper, texts, disclaimer, sections, logo, with
 * a preview) and its annotation schema (categories, severities, statuses). Every member sees them; only an
 * administrator edits (`canEdit`: all fields are disabled and there is no Save for the others, and the Registry refuses
 * their writes anyway).
 *
 * The Registry keeps one version of the settings. Saving sends it back, and a version that is not the current one
 * (someone saved first) is a 409: the dialog asks to reload. The logo is changed by requests of its own, which answer
 * with the new version; the dialog keeps it for the next save, so a logo sent and then a save never conflict. The
 * dialog stays open after a save: a new template is stored by it and can then receive its logo.
 *
 * Props:
 *   orgSlug - the organization
 *   canEdit - the user is an administrator of it
 *   templateId - the template the dialog opens on (the first one when it is not there)
 *
 * Emits `changed` when something the reports are made with was stored (a save, a logo sent or removed), and `close`.
 */
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Window from '@/components/HubWindow.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ReportTemplatesTab from './ReportTemplatesTab.vue';
import ReportSchemaList from './ReportSchemaList.vue';
import reg from '@/libs/api/sharedRegistry';
import { describeLogo } from '@/libs/logoImage';
import { notify } from '@/libs/notify';
import { escapeHtml } from '@/libs/sanitize';
import { isNotFound } from '@/libs/ddb/apiError';
import { formMessageOf } from '@/libs/forms/serverErrors';
import {
    SCHEMA_LISTS, breakdownChartOf, cloneSettings, deleteTemplateLogo, keyProblems, orgReportSettings, problemPathsOf, saveOrgReportSettings,
    settingsProblems, templateLogoUrl, uploadTemplateLogo
} from '@/libs/reports/reportSettings';

const props = defineProps({
    orgSlug: { type: String, required: true },
    canEdit: { type: Boolean, default: false },
    templateId: { type: String, default: '' }
});
const emit = defineEmits(['close', 'changed']);

const schemaLists = SCHEMA_LISTS;
const organization = reg.Organization(props.orgSlug);

const root = ref(null);
const activeTab = ref('templates');
const selectedTemplate = ref(0);
// The template to show once the settings are read, the first time only
let openOn = props.templateId;
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const logoBusy = ref(false);
const busy = computed(() => saving.value || logoBusy.value);

const draft = reactive({ templates: [], schema: { categories: [], severities: [], statuses: [] } });
// What the Registry has: its version, the ids that are stored (no longer made from the names), and the text of the
// draft as it was read, to know whether there is anything to discard
const version = ref(0);
const saved = reactive({ templates: new Set(), categories: new Set(), severities: new Set(), statuses: new Set() });
const baseline = ref('');

const formError = ref('');
const serverProblems = shallowRef({});
// The form's own problems show once a save was tried
const showProblems = ref(false);

const conflictOpen = ref(false);
const discardOpen = ref(false);
const logoRemoval = ref(null);
// Where the logo of the organization is (the Registry says it with the settings), '' without one
const organizationLogoUrl = ref('');

// The logo does not count: it is saved by its own requests
const snapshot = () => JSON.stringify({
    templates: draft.templates.map(template => ({ ...template, logo: undefined })),
    schema: draft.schema
});
const dirty = computed(() => snapshot() !== baseline.value);

const clientProblems = computed(() => keyProblems(settingsProblems(draft)));
const errors = computed(() => ({ ...(showProblems.value ? clientProblems.value : {}), ...serverProblems.value }));
const problemCount = computed(() => (showProblems.value ? Object.keys(clientProblems.value).length : 0));
// The Registry's messages, one per line: its generic title says nothing about which setting
const serverMessages = computed(() => Object.entries(serverProblems.value).map(([path, message]) => `${path.replace(/\./g, ' / ')}: ${message}`));

// An edit answers what the Registry said about the old text
watch(snapshot, () => {
    if (Object.keys(serverProblems.value).length) serverProblems.value = {};
});

function apply(settings) {
    // A template stored before the summary had a choice of charts draws bars: the dialog shows it so
    draft.templates = cloneSettings(settings.templates ?? []).map(t => ({ ...t, breakdownChart: breakdownChartOf(t) }));
    draft.schema = {
        categories: cloneSettings(settings.schema?.categories ?? []),
        severities: cloneSettings(settings.schema?.severities ?? []),
        statuses: cloneSettings(settings.schema?.statuses ?? [])
    };
    version.value = settings.version;
    organizationLogoUrl.value = settings.organizationLogoUrl ?? '';
    saved.templates = new Set(draft.templates.map(t => t.id));
    for (const { key } of schemaLists) saved[key] = new Set(draft.schema[key].map(e => e.id));
    baseline.value = snapshot();
    serverProblems.value = {};
    if (openOn) {
        const index = draft.templates.findIndex(t => t.id === openOn);
        if (index >= 0) selectedTemplate.value = index;
        openOn = '';
    }
    if (selectedTemplate.value >= draft.templates.length) selectedTemplate.value = 0;
}

async function load() {
    loading.value = true;
    loadError.value = '';
    formError.value = '';
    showProblems.value = false;
    try {
        apply(await orgReportSettings(organization));
    } catch (e) {
        loadError.value = formMessageOf(e, 'The report settings did not load');
    } finally {
        loading.value = false;
    }
}

const logoUrl = template => (saved.templates.has(template.id) ? templateLogoUrl(organization, template.id, version.value) : '');

/** The tab and template of the first problem, then the focus on its field. */
async function showFirst(paths) {
    const first = paths[0];
    const template = /^templates\.(\d+)\./.exec(first);
    activeTab.value = first.startsWith('templates') ? 'templates' : 'schema';
    if (template) selectedTemplate.value = Number(template[1]);
    await nextTick();
    root.value?.querySelector('[aria-invalid="true"]:not([hidden])')?.focus();
}

async function save() {
    if (!props.canEdit || busy.value || loading.value || loadError.value) return;
    for (const template of draft.templates) template.name = template.name.trim();
    for (const { key } of schemaLists) for (const entry of draft.schema[key]) entry.name = entry.name.trim();

    formError.value = '';
    showProblems.value = true;
    const found = Object.keys(clientProblems.value);
    if (found.length) {
        await showFirst(found);
        return;
    }

    saving.value = true;
    try {
        const result = await saveOrgReportSettings(organization, { templates: draft.templates, schema: draft.schema, version: version.value });
        apply(result);
        showProblems.value = false;
        emit('changed');
        notify.success('Report settings saved', { summary: 'Saved' });
    } catch (e) {
        await onSaveFailed(e);
    } finally {
        saving.value = false;
    }
}

async function onSaveFailed(error) {
    if (error?.status === 409) {
        conflictOpen.value = true;
        return;
    }
    const problems = error?.status === 400 ? problemPathsOf(error) : {};
    if (Object.keys(problems).length) {
        serverProblems.value = problems;
        await showFirst(Object.keys(problems));
    } else {
        formError.value = formMessageOf(error, 'The report settings were not saved');
    }
}

function onConflictClose(action) {
    conflictOpen.value = false;
    if (action === 'confirm') load();
}

/**
 * Sends the custom logo of a template.
 * @param {string} templateId @param {File} file
 * @param {import('@/libs/logoImage').PreparedLogo} [prepared]  what the tab made of the chosen file, for the message
 */
async function uploadLogo(templateId, file, prepared) {
    logoBusy.value = true;
    formError.value = '';
    try {
        const result = await uploadTemplateLogo(organization, templateId, file);
        version.value = result.version;
        const template = draft.templates.find(t => t.id === templateId);
        if (template) template.logo = result.logo;
        emit('changed');
        notify.success(prepared ? `Saved as ${describeLogo(prepared)}` : 'Logo saved', { summary: 'Logo saved' });
    } catch (e) {
        // A 404 says the Registry has no such template (it was removed by someone else, or not saved)
        formError.value = isNotFound(e) ? 'The template is not saved yet: save it, then add its logo.' : formMessageOf(e, 'The logo was not saved');
    } finally {
        logoBusy.value = false;
    }
}

function askRemoveLogo(templateId) {
    logoRemoval.value = draft.templates.find(t => t.id === templateId) ?? null;
}

async function onLogoRemovalClose(action) {
    const template = logoRemoval.value;
    logoRemoval.value = null;
    if (action !== 'confirm' || !template) return;
    logoBusy.value = true;
    formError.value = '';
    try {
        const result = await deleteTemplateLogo(organization, template.id);
        version.value = result.version;
        template.logo = null;
        emit('changed');
        notify.success('Logo removed', { summary: 'Saved' });
    } catch (e) {
        formError.value = formMessageOf(e, 'The logo was not removed');
    } finally {
        logoBusy.value = false;
    }
}

function requestClose() {
    if (busy.value) return;
    if (props.canEdit && dirty.value) discardOpen.value = true;
    else emit('close');
}

function onDiscardClose(action) {
    discardOpen.value = false;
    if (action === 'confirm') emit('close');
}

load();
</script>

<style scoped>
.report-settings {
    min-height: 12rem;
}

.tab-label {
    margin-left: 0.4rem;
}
</style>

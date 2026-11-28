<template>
    <Window id="reportEditorDialog" :title="entry ? 'Edit report' : 'New report'" modal size-class="dialog-xl" fixed-size :busy="editor.saving.value"
            :confirm-label="confirmLabel" cancel-label="Cancel" :enter-confirms="false" :confirm-disabled="editor.loading.value || !!editor.loadError.value"
            @confirm="confirm" @close="requestClose">
        <div class="report-editor">
            <div v-if="editor.loading.value" class="ui active centered inline loader" role="status" aria-label="Loading the report editor" />

            <PrimeMessage v-else-if="editor.loadError.value" severity="error" role="alert" :closable="false">
                <strong>Error</strong>: {{ editor.loadError.value }}
                <div class="mt-2"><Button severity="secondary" size="small" label="Retry" icon="fa-solid fa-rotate-right" @click="editor.load()" /></div>
            </PrimeMessage>

            <template v-else>
                <!-- The report is stored; some of its files could not be numbered, so their items show a dash until they can be -->
                <PrimeMessage v-if="editor.failures.value.length" severity="warn" role="alert" :closable="false" class="mb-3" data-testid="numbering-failed">
                    The report was saved, but these measurement files could not be numbered. Their items show a dash in place of a reference, with no
                    link, until they can be:
                    <ul class="mb-0">
                        <li v-for="failure in editor.failures.value" :key="failure.file"><strong>{{ failure.file }}</strong>: {{ failure.reason }}</li>
                    </ul>
                </PrimeMessage>

                <PrimeMessage v-if="editor.formError.value" severity="error" role="alert" :closable="false" class="mb-3" data-testid="form-error">
                    {{ editor.formError.value }}
                </PrimeMessage>
                <PrimeMessage v-else-if="editor.showProblems.value && editor.firstProblem.value" severity="error" role="alert" :closable="false" class="mb-3"
                              data-testid="form-problems">
                    The report cannot be saved yet: fix the problems marked below.
                </PrimeMessage>

                <ReportEditorEssentials />
                <Accordion v-model:value="openPanel" class="report-more-options">
                    <FormSection value="more" title="More options" :summary="editor.optionsSummary.value"
                                 header-testid="more-options" summary-testid="options-summary">
                        <ReportEditorDetails @edit-template="editTemplate" />
                        <ReportEditorLabels />
                        <ReportEditorFilter />
                    </FormSection>
                </Accordion>
            </template>
        </div>
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script setup>
/**
 * The report editor: what a report needs on top (the name, the measurement files, the view), filled in for a new report,
 * and under a closed More options group what has a value without the user (the template, the texts of the cover, the
 * notes, the units, the labels of the files, the filter and the sections), which opens by itself when a problem is
 * there. What is edited is the definition; the report holds no numbers. Saving stores the definition and then numbers the measurement files it reads, so that the references the
 * report shows are saved: see useReportEditor. When a file cannot be numbered the report is saved all the same and the
 * dialog stays open to say which file and why; its button then opens the report, until the report is changed again:
 * then it is Save (an update of the stored report, which numbers the files again), and leaving asks first.
 *
 * Props: dataset (the Registry's), entry (the report to edit; none for a new one), initial (what a new report was opened
 * with: the measurement files and the view of the map), user, choose (the question of the change check). It closes with `{ uid }` of the report
 * that was stored, or with nothing.
 *
 * Edit template opens the report settings of the organization on the template of the draft. When they are changed the
 * editor reads the templates again and emits `settings-changed`, so that a report shown behind it is drawn again even
 * when the editor is then cancelled.
 */
import { computed, ref } from 'vue';
import Accordion from 'primevue/accordion';
import FormSection from '@/components/FormSection.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Window from '@/components/HubWindow.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import ReportEditorEssentials from './ReportEditorEssentials.vue';
import ReportEditorDetails from './ReportEditorDetails.vue';
import ReportEditorLabels from './ReportEditorLabels.vue';
import ReportEditorFilter from './ReportEditorFilter.vue';
import { lazyComponent } from '@/libs/lazyComponent';
import { MORE_OPTIONS_FIELDS, provideReportEditor, useReportEditor } from './useReportEditor';

const ReportSettingsDialog = lazyComponent(() => import(/* webpackChunkName: "report-settings" */ '@/features/organizations/ReportSettingsDialog.vue'));

const props = defineProps({
    dataset: { type: Object, required: true },
    entry: { type: Object, default: null },
    initial: { type: Object, default: undefined },
    user: { type: String, default: '' },
    choose: { type: Function, required: true }
});
const emit = defineEmits(['close', 'settings-changed']);

// Questions of the editor are asked over it, on a host of its own
const dialogs = useDialogs();
const confirmDiscard = useConfirm(dialogs);

const editor = useReportEditor({ dataset: props.dataset, user: props.user, entry: props.entry, initial: props.initial, choose: props.choose });
provideReportEditor(editor);

editor.load();

// A report that is stored while the editor stays open (a file could not be numbered)
const storedWithProblems = computed(() => !!editor.storedUid.value && editor.failures.value.length > 0);
// Its button opens it while the draft is what was stored; a change is saved first
const opensReport = computed(() => storedWithProblems.value && !editor.dirty.value);
const confirmLabel = computed(() => {
    if (opensReport.value) return 'Open report';
    return props.entry || editor.storedUid.value ? 'Save' : 'Create report';
});

// More options is closed ('more' when open): a save that finds a problem in it opens it, so the problem shows
const openPanel = ref(/** @type {string|null} */ (null));

async function confirm() {
    if (opensReport.value) {
        emit('close', { uid: editor.storedUid.value });
        return;
    }
    const saved = await editor.save();
    if (!saved && Object.keys(editor.problems.value).some(field => MORE_OPTIONS_FIELDS.includes(field))) openPanel.value = 'more';
    // A save that numbered everything is done; one that could not number a file leaves the editor open to say so
    if (saved && !saved.failures.length) emit('close', { uid: saved.uid });
}

/** The report settings of the organization, on the template of the draft; a change is read again when they close. */
async function editTemplate() {
    let changed = false;
    await dialogs.open(ReportSettingsDialog, {
        orgSlug: String(props.dataset.org),
        canEdit: true,
        templateId: editor.resolvedTemplate.value.id,
        onChanged: () => { changed = true; }
    });
    if (!changed) return;
    await editor.reloadSettings();
    emit('settings-changed');
}

async function requestClose() {
    if (editor.saving.value) return;
    if (editor.dirty.value && !await confirmDiscard({
        title: 'Discard the changes?',
        message: 'The report has changes that are not saved.',
        confirmText: 'Discard changes',
        danger: true
    })) return;
    // A report stored here (a file could not be numbered) is left as it is stored
    emit('close', storedWithProblems.value ? { uid: editor.storedUid.value } : null);
}
</script>


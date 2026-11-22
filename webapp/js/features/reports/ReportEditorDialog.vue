<template>
    <Window id="reportEditorDialog" :title="entry ? 'Edit report' : 'New report'" modal size-class="dialog-log" fixed-size :busy="editor.saving.value"
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

                <ReportEditorDetails />
                <ReportEditorSources />
                <ReportEditorFilter />
            </template>
        </div>
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script setup>
/**
 * The report editor: the name, the template, the texts of the cover, the notes, the sources with their labels, the
 * filter, the cover view, the sections and the units of a report (what is edited is the definition; the report holds no
 * numbers). Saving stores the definition and then numbers the measurement files it reads, so that the references the
 * report shows are saved: see useReportEditor. When a file cannot be numbered the report is saved all the same and the
 * dialog stays open to say which file and why; its button then opens the report.
 *
 * Props: dataset (the Registry's), entry (the report to edit; none for a new one), initial (what a new report starts
 * with: sources and cover), user, choose (the question of the change check). It closes with `{ uid }` of the report
 * that was stored, or with nothing.
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Window from '@/components/HubWindow.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import ReportEditorDetails from './ReportEditorDetails.vue';
import ReportEditorSources from './ReportEditorSources.vue';
import ReportEditorFilter from './ReportEditorFilter.vue';
import { provideReportEditor, useReportEditor } from './useReportEditor';

const props = defineProps({
    dataset: { type: Object, required: true },
    entry: { type: Object, default: null },
    initial: { type: Object, default: undefined },
    user: { type: String, default: '' },
    choose: { type: Function, required: true }
});
const emit = defineEmits(['close']);

// Questions of the editor are asked over it, on a host of its own
const dialogs = useDialogs();
const confirmDiscard = useConfirm(dialogs);

const editor = useReportEditor({ dataset: props.dataset, user: props.user, entry: props.entry, initial: props.initial, choose: props.choose });
provideReportEditor(editor);

/** The text of the draft as it was after it was read: nothing to discard while it is the same. */
const baseline = ref('');
editor.load().then(() => { baseline.value = JSON.stringify(editor.draft); });
const dirty = computed(() => !!baseline.value && baseline.value !== JSON.stringify(editor.draft));

// A report that is stored while the editor stays open (a file could not be numbered): its button opens the report
const storedWithProblems = computed(() => !!editor.storedUid.value && editor.failures.value.length > 0);
const confirmLabel = computed(() => (storedWithProblems.value ? 'Open report' : 'Save'));

async function confirm() {
    if (storedWithProblems.value) {
        emit('close', { uid: editor.storedUid.value });
        return;
    }
    const saved = await editor.save();
    // A save that numbered everything is done; one that could not number a file leaves the editor open to say so
    if (saved && !saved.failures.length) emit('close', { uid: saved.uid });
}

async function requestClose() {
    if (editor.saving.value) return;
    // The report is stored (a file could not be numbered): closing is leaving it as it is stored
    if (storedWithProblems.value) {
        emit('close', { uid: editor.storedUid.value });
        return;
    }
    if (dirty.value && !await confirmDiscard({
        title: 'Discard the changes?',
        message: 'The report has changes that are not saved.',
        confirmText: 'Discard changes',
        danger: true
    })) return;
    emit('close', null);
}
</script>

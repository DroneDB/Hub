<template>
    <ViewerShell v-model:error="error" class="report-viewer" :loading="loading" :load-error="loadError" :name="model?.name || null">
        <template v-if="model" #bar>
            <!-- The PDF actions go in the export slot of the bar -->
            <ReportBar :name="model.name" :can-write="canWrite" @edit="edit" @delete="remove" />
        </template>

        <ResourceState v-if="missing" kind="not-found" resource="report" message="This report was deleted or the link is wrong."
                       :back-to="datasetLocation" back-label="Back to the dataset" />
        <ResourceState v-else-if="unreadable" kind="not-found" resource="report" :message="unreadable"
                       :back-to="datasetLocation" back-label="Back to the dataset" />

        <div v-else-if="model" class="report-page">
            <article class="report-document" :aria-label="`Report ${model.name}`">
                <PrimeMessage v-if="anchorMissing" severity="warn" :closable="false" role="alert" class="report-notice" data-testid="item-missing">
                    This item is no longer in this report
                </PrimeMessage>
                <PrimeMessage v-for="notice in model.notices" :key="notice.code + notice.text" severity="warn" :closable="false" role="status"
                              class="report-notice" :data-notice="notice.code">
                    {{ notice.text }}
                </PrimeMessage>
                <ReportSection v-for="section in model.sections" :key="section.kind" :section="section" />
                <p v-if="!model.sections.length" class="report-empty">Every section of this report is switched off.</p>
            </article>
        </div>
        <DialogHost :dialogs="dialogs" />
    </ViewerShell>
</template>

<script setup>
/**
 * ReportPage - the live page of a report (/r/:org/:ds/reports/:uid): the sections of the report model drawn with the
 * values the measurement files have now. Anyone who can read the dataset sees it (the link follows the sharing of the
 * dataset: a private one asks to sign in); those who can write also see Edit and Delete.
 *
 * The page opens at an item when the address has `#item-<id>`; an id that no item of the report has says so at the top.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PrimeMessage from 'primevue/message';
import ViewerShell from '@/components/ViewerShell.vue';
import ResourceState from '@/components/ResourceState.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useReportActions } from '@/features/reports/useReportActions';
import { setTitle } from '@/libs/utils';
import { loadErrorKind } from '@/libs/ddb/apiError';
import { itemOfAnchor } from '@/libs/views/viewLinks';
import { photoEntries } from '@/libs/reports/photoFiles';
import ReportBar from './ReportBar.vue';
import ReportSection from './ReportSection.vue';
import { provideReportContext } from './reportContext';
import { useReport } from './useReport';

defineOptions({ name: 'ReportPage' });

const route = useRoute();
const router = useRouter();
const dialogs = useDialogs();
const { org, ds, uid } = route.params;

const report = useReport({ org: String(org), ds: String(ds), uid: String(uid) });
const { loading, loadError, missing, unreadable, canWrite, model, dataset } = report;
const error = ref('');
// A failure that is no page state (a network error, a 500): the shell shows its message and the way back
watch(loadError, e => { if (e && !loadErrorKind(e)) error.value = report.errorMessage.value; });
const datasetLocation = { name: 'ViewDataset', params: { org: String(org), ds: String(ds) } };

// The photos of the report: their entries give the thumbnails their hash and size, and tell a deleted one
const photos = ref(null);
provideReportContext({ dataset, photoEntries: photos });
watch(model, async current => {
    const paths = new Set((current?.sections ?? []).flatMap(s => s.blocks).filter(b => b.type === 'photoGrid').flatMap(b => b.photos.map(p => p.path)));
    photos.value = paths.size ? await photoEntries(dataset, paths) : null;
}, { immediate: true });

// The actions on the report: Edit saves through the editor and the page shows the new values; Delete goes back to the dataset
const actions = useReportActions({ dataset, org: String(org), ds: String(ds), dialogs, router, onChanged: () => report.reload() });
const edit = () => actions.edit(report.entry.value);
const remove = async () => {
    if (await actions.remove(report.entry.value)) await router.push(datasetLocation);
};

// ---- The item the address names -----------------------------------------------------------

const wantedItem = computed(() => itemOfAnchor(route.hash));
// The anchors the page draws: an item that was deleted, filtered out or left out by the sections has none
const anchors = computed(() => new Set((model.value?.sections ?? []).flatMap(s => s.blocks).map(b => b.anchor).filter(Boolean)));
const anchorMissing = computed(() => !!model.value && !!wantedItem.value && !anchors.value.has(`item-${wantedItem.value}`));

// The item's heading is brought into view and focused (a screen reader reads where it is), once it is drawn
watch([model, () => route.hash], async () => {
    if (!model.value || !wantedItem.value || anchorMissing.value) return;
    await nextTick();
    const heading = document.getElementById(`item-${wantedItem.value}`);
    if (heading) {
        heading.scrollIntoView();
        heading.focus({ preventScroll: true });
    }
}, { flush: 'post', immediate: true });

watch(model, current => { if (current) setTitle(`${current.name} - Report`); }, { immediate: true });
</script>

<style scoped>
.report-page {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
}

.report-document {
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--ddb-spacing-md);
}

.report-notice {
    margin-bottom: var(--ddb-spacing-sm);
}

.report-empty {
    color: var(--ddb-text-secondary);
}
</style>

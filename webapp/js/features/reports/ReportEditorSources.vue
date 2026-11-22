<template>
    <div class="report-editor-sources">
        <fieldset class="mb-4" :aria-describedby="shown('sources') ? 'report-sources-error' : undefined">
            <legend class="fw-semibold">Sources</legend>
            <p class="text-muted">The measurement files the report reads. Each has a short label that is shown in front of the references of its items.</p>

            <ul v-if="draft.sources.length" class="report-source-list">
                <li v-for="(source, index) in draft.sources" :key="source.file" class="report-source">
                    <label :for="`report-source-label-${index}`" class="visually-hidden">Label of {{ source.file }}</label>
                    <InputText :id="`report-source-label-${index}`" v-model="source.label" class="report-source-label" maxlength="3" autocomplete="off"
                               @update:model-value="source.label = String($event).toUpperCase()" />
                    <span class="report-source-file" :title="source.file">{{ source.file }}</span>
                    <Button size="small" severity="secondary" text icon="fa-solid fa-xmark" :aria-label="`Remove ${source.file}`" :title="`Remove ${source.file}`"
                            @click="editor.removeSource(index)" />
                </li>
            </ul>
            <FieldError id="report-sources-error" :message="shown('sources')" />

            <div class="report-source-add">
                <label id="report-source-add-label" for="report-source-add" class="visually-hidden">Measurement file to add</label>
                <Select v-model="toAdd" input-id="report-source-add" aria-labelledby="report-source-add-label" :options="candidates" filter
                        placeholder="Choose a measurement file" class="report-source-pick" :empty-message="'No other measurement file in this dataset'" />
                <Button size="small" severity="secondary" icon="fa-solid fa-plus" label="Add source" :disabled="!toAdd" @click="addSource" />
            </div>
        </fieldset>

        <fieldset class="mb-4" :aria-describedby="shown('cover') ? 'report-cover-error' : undefined">
            <legend class="fw-semibold">Cover view</legend>
            <p class="text-muted">The layers and the basemap every map of the report is drawn on.</p>

            <div v-if="editor.coverKind.value === 'state'" class="mb-2" data-testid="cover-state">
                <i class="fa-regular fa-map" aria-hidden="true" /> The map as it is now: {{ stateLayerCount }} {{ stateLayerCount === 1 ? 'layer' : 'layers' }}
            </div>

            <div class="mb-3">
                <label id="report-cover-view-label" for="report-cover-view" class="d-block mb-1">A saved view</label>
                <Select :model-value="viewId" input-id="report-cover-view" aria-labelledby="report-cover-view-label" :options="editor.views.value"
                        option-label="name" option-value="uid" placeholder="Choose a saved view" show-clear class="w-100"
                        @update:model-value="chooseView" />
            </div>

            <fieldset v-if="editor.georasters.value.length" class="mb-1">
                <legend class="d-block mb-1">Or layers of the dataset, the first one on top</legend>
                <div v-for="(raster, index) in editor.georasters.value" :key="raster.path" class="d-flex align-items-center gap-2 mb-1">
                    <Checkbox :input-id="`report-layer-${index}`" :model-value="layers" :value="raster.path" @update:model-value="editor.chooseLayers($event)" />
                    <label :for="`report-layer-${index}`">{{ raster.path }}</label>
                </div>
            </fieldset>
            <FieldError id="report-cover-error" :message="shown('cover')" />
        </fieldset>
    </div>
</template>

<script setup>
/**
 * The sources and the cover view of the report editor. The sources are the measurement files of the dataset, each under
 * a label (A, B, C ...); the cover is a saved view, or layers of the dataset, or the map the editor was opened from.
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import FieldError from '@/components/FieldError.vue';
import { injectReportEditor } from './useReportEditor';

const editor = injectReportEditor();
const { draft } = editor;

const toAdd = ref(null);
// The measurement files the report does not read yet
const candidates = computed(() => editor.measurementFiles.value.filter(file => !draft.sources.some(s => s.file === file)));
function addSource() {
    if (!toAdd.value) return;
    editor.add(toAdd.value);
    toAdd.value = null;
}

const viewId = computed(() => (draft.cover && 'viewId' in draft.cover ? draft.cover.viewId : null));
const layers = computed(() => (editor.coverKind.value === 'layers' ? editor.coverLayers.value : []));
const stateLayerCount = computed(() => (draft.cover && 'viewState' in draft.cover ? draft.cover.viewState.layers.length : 0));
/** @param {string|null} uid */
const chooseView = uid => (uid ? editor.chooseView(uid) : editor.chooseLayers([]));

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

.report-source-add {
    display: flex;
    gap: var(--ddb-spacing-sm);
}

.report-source-pick {
    flex: 1;
    min-width: 0;
}

fieldset {
    border: 0;
    padding: 0;
    margin-left: 0;
    margin-right: 0;
}
</style>

<template>
    <div class="annotation-photos">
        <section :aria-labelledby="`${uid}-own`" class="mb-3">
            <h2 :id="`${uid}-own`" class="photos-heading">Photos of this annotation <span class="photos-count">({{ photos.length }} of {{ MAX_PHOTOS }})</span></h2>

            <p v-if="!photos.length" class="photos-note">No photos yet</p>
            <ul v-else class="photo-list">
                <li v-for="(photo, index) in photos" :key="photo.path || index" class="photo-row">
                    <PhotoThumb :dataset="dataset" :path="photo.path" :hash="hashOf(photo.path)" :pixel="photo.pixel" :size="sizeOf(photo.path)"
                                :alt="photoAlt(itemName, photo)" />
                    <div class="photo-details">
                        <span class="photo-name" :title="photo.path">{{ nameOf(photo.path) }}</span>
                        <span class="photo-source">{{ SOURCE_LABELS[photo.source] || photo.source }}</span>
                        <template v-if="!readOnly">
                            <label :for="`${uid}-caption-${index}`" class="visually-hidden">Caption of {{ nameOf(photo.path) }}</label>
                            <InputText :id="`${uid}-caption-${index}`" :model-value="photo.caption ?? ''" placeholder="Caption (optional)" :maxlength="MAX_CAPTION"
                                       autocomplete="off" class="photo-caption" @update:model-value="setCaption(index, $event)" />
                            <ActionButton :label="`Remove ${nameOf(photo.path)}`" severity="secondary" size="small" text class="photo-remove"
                                          @click="remove(index)">
                                <i class="fa-solid fa-xmark" aria-hidden="true" /> Remove
                            </ActionButton>
                        </template>
                        <span v-else-if="photo.caption" class="photo-caption-text">{{ photo.caption }}</span>
                    </div>
                </li>
            </ul>

            <div v-if="!readOnly" class="photo-actions">
                <input ref="fileInput" type="file" class="visually-hidden" :aria-label="'Upload photos'" tabindex="-1" multiple
                       :accept="UPLOAD_ACCEPT" @change="onFiles">
                <ActionButton label="Upload photos" severity="secondary" size="small" :disabled="uploading || !!blocked" :disabled-reason="blocked"
                              @click="fileInput.click()">
                    <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" /> Upload
                </ActionButton>
                <ActionButton label="Pick from the dataset" severity="secondary" size="small" :disabled="!!blocked" :disabled-reason="blocked"
                              :aria-expanded="String(picking)" :aria-controls="`${uid}-picker`" @click="picking = !picking">
                    <i class="fa-solid fa-images" aria-hidden="true" /> Pick from the dataset
                </ActionButton>
            </div>
            <p v-if="blocked && !readOnly" class="photos-note" data-testid="photos-limit">{{ blocked }}</p>
            <p v-if="uploading" class="photos-note" role="status">Uploading...</p>
            <p v-if="uploadError" class="photos-error" role="alert">{{ uploadError }}</p>

            <div v-if="picking && !readOnly" :id="`${uid}-picker`" class="photo-picker">
                <DatasetImagePicker :dataset="dataset" :id-prefix="`${uid}-pick`" :taken="paths" :blocked-reason="blocked" @pick="pick($event, PHOTO_SOURCE.DATASET)" />
            </div>
        </section>

        <section :aria-labelledby="`${uid}-coverage`">
            <h2 :id="`${uid}-coverage`" class="photos-heading">Photos that cover this annotation</h2>

            <p v-if="state === 'unlocated'" class="photos-note" data-testid="coverage-unlocated">
                This item has no position on the earth, so the photos that cover it cannot be found. Pick or upload a photo instead.
            </p>
            <p v-else-if="state === 'loading'" class="photos-note" role="status">Looking for photos that cover this annotation...</p>
            <div v-else-if="state === 'error'" class="photos-error" role="alert">
                {{ coverageError }}
                <Button label="Retry" severity="secondary" size="small" class="ms-2" @click="loadCoverage" />
            </div>
            <p v-else-if="!coverage.length" class="photos-note" role="status">No covering photos found</p>
            <ul v-else class="photo-list" data-testid="coverage-list">
                <li v-for="(result, index) in coverage" :key="result.path" class="photo-row">
                    <PhotoThumb :dataset="dataset" :path="result.path" :hash="hashOf(result.path)" :pixel="result.pixel" :size="sizeOf(result.path)"
                                :alt="photoAlt(itemName, result)" />
                    <div class="photo-details">
                        <span class="photo-name" :title="result.path">{{ nameOf(result.path) }}</span>
                        <span class="photo-source">{{ index === 0 ? 'Best match' : `Match ${index + 1}` }}</span>
                        <ActionButton v-if="!readOnly" :label="`Add ${nameOf(result.path)} to this annotation`" severity="secondary" size="small"
                                      :disabled="!!pinBlocked(result.path)" :disabled-reason="pinBlocked(result.path)" @click="pin(result)">
                            <i class="fa-solid fa-plus" aria-hidden="true" /> Add
                        </ActionButton>
                    </div>
                </li>
            </ul>
        </section>
    </div>
</template>

<script setup>
/**
 * The Photos tab of an annotation (2D or 3D): the photos it has, with a caption each and a Remove action, a way to add
 * one (a photo that covers it, any image of the dataset, an upload next to the measurement file), and the photos of the
 * dataset that cover it, best first, each with the "Approximate location" marker where the annotation is in it.
 *
 * `v-model` is the annotation's `photos` (the file's entries: libs/reports/annotationPhotos). The component changes
 * the list only; it never deletes a file of the dataset (a removed photo is only unlisted, and an uploaded one stays
 * in the annotations folder) and the annotation is saved by its dialog. An item with no `geometry` (not georeferenced)
 * makes no coverage request. With `readOnly` the photos are shown and nothing can be changed.
 * `uploading` is emitted with true while an upload runs and false when it ends (or the component goes): the host keeps its
 * Save off meanwhile, so that a photo written to the dataset is never left out of the annotation.
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ActionButton from '@/components/ActionButton.vue';
import PhotoThumb from '@/components/measurements/PhotoThumb.vue';
import DatasetImagePicker from '@/components/DatasetImagePicker.vue';
import pathutils from '@/libs/ddb/pathutils';
import {
    MAX_CAPTION, MAX_PHOTOS, PHOTO_SOURCE, UPLOAD_EXTENSIONS, addBlockReason, hasPhoto, isDatasetPath, photoAlt, withPhoto
} from '@/libs/reports/annotationPhotos';
import { photoEntries, uploadPhoto } from '@/libs/reports/photoFiles';

const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    /** The dataset API client (thumbnails, the coverage query, the listing and the writes) */
    dataset: { type: Object, required: true },
    /** The path of the measurement file of the annotation: the uploads go to the `annotations` folder next to it */
    measurementPath: { type: String, default: '' },
    /** The id of the annotation: the name of its uploads */
    itemId: { type: String, default: '' },
    /** The name the alternative texts of the photos have */
    itemName: { type: String, default: '' },
    /** The WGS84 geometry of the annotation; null when it is not georeferenced (no coverage request is made) */
    geometry: { type: Object, default: null },
    readOnly: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue', 'written', 'uploading']);

const uid = useId();
const SOURCE_LABELS = { coverage: 'Pinned from the coverage', dataset: 'From the dataset', upload: 'Uploaded' };
const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map(extension => `.${extension}`).join(',');
const COVERAGE_LIMIT = 20;

// The photos as this component has changed them: the parent's list follows through v-model
const photos = ref(/** @type {any[]} */ ([...props.modelValue]));
watch(() => props.modelValue, value => { photos.value = [...value]; });
const paths = computed(() => photos.value.map(photo => photo.path));
const blocked = computed(() => addBlockReason(photos.value));

function commit(next) {
    photos.value = next;
    emit('update:modelValue', next);
}

const nameOf = path => (typeof path === 'string' ? pathutils.basename(path) : '');
const pinBlocked = path => (hasPhoto(photos.value, path) ? 'Already in this annotation' : blocked.value);

function remove(index) {
    commit(photos.value.filter((_, i) => i !== index));
}

function setCaption(index, caption) {
    commit(photos.value.map((photo, i) => (i === index ? { ...photo, caption } : photo)));
}

function add(photo) {
    try {
        commit(withPhoto(photos.value, photo));
        return true;
    } catch (e) {
        uploadError.value = e.message;
        return false;
    }
}

function pin(result) {
    add({ path: result.path, source: PHOTO_SOURCE.COVERAGE, ...(result.pixel ? { pixel: result.pixel } : {}) });
}

function pick(path, source) {
    add({ path, source });
}

// The entries of the photos (their dimensions place the marker, their hash makes the thumbnail address change with the file)
const entries = ref(/** @type {Record<string, any>} */ ({}));
const hashOf = path => entries.value[path]?.hash;
const sizeOf = path => {
    const properties = entries.value[path]?.properties;
    return properties ? { width: properties.width, height: properties.height } : null;
};
async function loadEntries(list) {
    const wanted = list.filter(path => isDatasetPath(path) && !entries.value[path]);
    if (!wanted.length) return;
    const found = await photoEntries(props.dataset, wanted);
    entries.value = { ...entries.value, ...Object.fromEntries(found) };
}
loadEntries(paths.value);

// The photos that cover the annotation
const state = ref(/** @type {'loading' | 'ready' | 'error' | 'unlocated'} */ ('loading'));
const coverage = ref(/** @type {any[]} */ ([]));
const coverageError = ref('');
let controller = /** @type {AbortController | null} */ (null);

async function loadCoverage() {
    controller?.abort();
    controller = null;
    coverage.value = [];
    if (!props.geometry) {
        state.value = 'unlocated';
        return;
    }
    const mine = (controller = new AbortController());
    state.value = 'loading';
    try {
        const found = await props.dataset.findCoverage(props.geometry, { limit: COVERAGE_LIMIT, signal: mine.signal });
        if (mine !== controller) return;
        coverage.value = (Array.isArray(found) ? found : []).filter(result => isDatasetPath(result?.path));
        state.value = 'ready';
        loadEntries(coverage.value.map(result => result.path));
    } catch (e) {
        if (mine !== controller || mine.signal.aborted) return;
        coverageError.value = `The covering photos could not be found: ${e?.message || e}`;
        state.value = 'error';
    }
}
watch(() => JSON.stringify(props.geometry ?? null), loadCoverage, { immediate: true });
onBeforeUnmount(() => controller?.abort());

// What the editor adds from the dataset and from their computer
const picking = ref(false);
const uploading = ref(false);
// The host holds its Save while a photo is being written: a save in between would leave out the photo that lands after it
watch(uploading, busy => emit('uploading', busy));
onBeforeUnmount(() => { if (uploading.value) emit('uploading', false); });
const uploadError = ref('');
const fileInput = ref(/** @type {HTMLInputElement | null} */ (null));

async function onFiles(event) {
    const input = event.target;
    const files = [...input.files];
    input.value = '';
    uploadError.value = '';
    if (!files.length) return;
    if (!props.measurementPath || !props.itemId) {
        uploadError.value = 'This annotation has to be saved before a photo can be uploaded';
        return;
    }
    uploading.value = true;
    try {
        for (const file of files) {
            const reason = addBlockReason(photos.value);
            if (reason) {
                uploadError.value = reason;
                break;
            }
            const path = await uploadPhoto(props.dataset, { measurementPath: props.measurementPath, id: props.itemId, file, taken: paths.value });
            if (add({ path, source: PHOTO_SOURCE.UPLOAD })) emit('written', path);
        }
    } catch (e) {
        uploadError.value = `The photo could not be uploaded: ${e?.message || e}`;
    } finally {
        uploading.value = false;
    }
}
</script>

<style scoped>
.annotation-photos {
    min-width: 0;
}

.photos-heading {
    margin: 0 0 var(--ddb-spacing-sm);
    font-size: 1rem;
    font-weight: 600;
}

.photos-count {
    font-weight: 400;
    color: var(--ddb-text-secondary);
}

.photos-note {
    margin: var(--ddb-spacing-xs) 0;
    color: var(--ddb-text-secondary);
}

.photos-error {
    margin: var(--ddb-spacing-xs) 0;
    color: var(--ddb-danger);
}

.photo-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.photo-row {
    display: flex;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) 0;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.photo-thumb {
    flex: none;
}

.photo-details {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ddb-spacing-xs);
    min-width: 0;
}

.photo-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
}

.photo-source {
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.photo-caption {
    width: 100%;
}

.photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-sm);
    margin-top: var(--ddb-spacing-sm);
}

.photo-picker {
    margin-top: var(--ddb-spacing-sm);
}
</style>

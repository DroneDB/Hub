<template>
    <div class="cover-field" role="group" :aria-labelledby="labelledby" :aria-describedby="`${uid}-hint`">
        <div class="cover-row">
            <img v-if="previewUrl" :src="previewUrl" :alt="previewAlt" class="cover-preview" @error="failedUrl = previewUrl">
            <img v-else :src="PLACEHOLDER_URL" alt="No thumbnail" class="cover-preview cover-placeholder">
            <div class="cover-actions">
                <input ref="fileInput" type="file" class="visually-hidden" tabindex="-1" aria-label="Thumbnail image"
                       :accept="COVER_ACCEPT" @change="onFile">
                <Button severity="secondary" icon="fa-solid fa-upload" label="Upload" :disabled="busy" :loading="busy && uploading"
                        @click="fileInput.click()" />
                <Button severity="secondary" icon="fa-solid fa-images" label="Choose from dataset" :disabled="busy"
                        :aria-expanded="String(picking)" :aria-controls="`${uid}-picker`" @click="picking = !picking" />
                <Button v-if="previewUrl" severity="danger" text icon="fa-solid fa-trash" label="Remove" :disabled="busy"
                        @click="change({ remove: true })" />
                <Button v-if="modelValue && !busy" severity="secondary" text icon="fa-solid fa-rotate-left" label="Undo"
                        @click="change(null)" />
                <small :id="`${uid}-hint`" class="cover-hint">{{ pendingText || hint }}</small>
                <FieldError :id="`${uid}-error`" :message="fileError" />
            </div>
        </div>
        <div v-if="picking" :id="`${uid}-picker`" class="cover-picker">
            <DatasetImagePicker :dataset="dataset" :id-prefix="`${uid}-pick`" :types="sourceTypes" :accepts="isSource" noun="images and rasters"
                                action-label="Use" action-icon="fa-solid fa-check" :blocked-reason="busy ? 'Saving the thumbnail' : ''"
                                @pick="onPick" />
        </div>
    </div>
</template>

<script setup>
/**
 * The cover of a dataset (its thumbnail in the dataset list): a preview, Upload (an image of the user's), Choose from
 * dataset (an image or a raster of the dataset, whose thumbnail becomes the cover) and Remove. The field only says what
 * the user chose, as `v-model` (a CoverChange of libs/datasetCover, null for none): the window it is in applies it,
 * on Save (Edit dataset) or at once (Dataset Settings, which sets it back to null when it is done). Undo drops a change
 * that is not applied.
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import Button from 'primevue/button';
import FieldError from '@/components/FieldError.vue';
import DatasetImagePicker from '@/components/DatasetImagePicker.vue';
import { COVER_ACCEPT, coverNameFor, isCoverPath } from '@/libs/datasetCover';
import { fileThumbnailTypes } from '@/libs/entryTypeCapabilities';

/** The image of a dataset without a cover, from the site's images (as the dataset list uses it) */
const PLACEHOLDER_URL = '/images/dataset-placeholder.svg';
/** The long side, in pixels, of the preview of a file of the dataset */
const PREVIEW_SIZE = 256;

const props = defineProps({
    dataset: { type: Object, required: true },
    /** The address of the cover the dataset has (null when it has none) */
    currentUrl: { type: String, default: null },
    /** @type {import('vue').PropType<import('@/libs/datasetCover').CoverChange | null>} */
    modelValue: { type: Object, default: null },
    /** A change is being applied: the actions wait */
    busy: { type: Boolean, default: false },
    /** The id of the label of the field */
    labelledby: { type: String, default: undefined },
    hint: { type: String, default: 'WebP, JPEG or PNG, or an image or a raster of the dataset. It is saved as a file in the dataset root and shown in the dataset list.' }
});
const emit = defineEmits(['update:modelValue']);

const uid = useId();
const fileInput = ref(/** @type {HTMLInputElement | null} */ (null));
const picking = ref(false);
const fileError = ref('');
// The upload is the change being applied (its button shows the spinner)
const uploading = computed(() => !!props.modelValue && 'file' in props.modelValue);
// A preview that did not load is shown as no cover
const failedUrl = ref('');
const sourceTypes = fileThumbnailTypes();
// The cover files are not offered: they are the cover already
const isSource = path => !isCoverPath(path);

// The preview of an image of the user's: an object URL, released when it is no longer shown
const objectUrl = ref('');
watch(() => props.modelValue, value => {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = value && 'file' in value ? URL.createObjectURL(value.file) : '';
}, { immediate: true });
onBeforeUnmount(() => { if (objectUrl.value) URL.revokeObjectURL(objectUrl.value); });

const previewUrl = computed(() => {
    const value = props.modelValue;
    const url = !value ? props.currentUrl
        : 'remove' in value ? null
        : 'file' in value ? objectUrl.value
        : props.dataset.thumbUrl(value.entryPath, PREVIEW_SIZE);
    return url && url !== failedUrl.value ? url : null;
});
const previewAlt = computed(() => (props.modelValue ? 'New dataset thumbnail' : 'Dataset thumbnail'));

/** What the change will do, when there is one */
const pendingText = computed(() => {
    const value = props.modelValue;
    if (!value) return '';
    if ('remove' in value) return 'The thumbnail will be removed.';
    if ('file' in value) return `${value.file.name || 'The image'} will be the thumbnail.`;
    return `${value.entryPath} will be the thumbnail.`;
});

function change(value) {
    fileError.value = '';
    emit('update:modelValue', value);
}

function onFile(event) {
    const file = event.target.files?.[0];
    // The same file can be chosen again
    event.target.value = '';
    if (!file) return;
    try {
        coverNameFor(file.type);
    } catch (e) {
        fileError.value = e.message;
        return;
    }
    change({ file });
}

function onPick(path) {
    picking.value = false;
    change({ entryPath: path });
}
</script>

<style scoped>
.cover-row {
    display: flex;
    align-items: flex-start;
    gap: var(--ddb-spacing-md);
}

.cover-preview {
    flex-shrink: 0;
    width: 7.5rem;
    height: 5rem;
    object-fit: cover;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
}

.cover-placeholder {
    object-fit: contain;
    opacity: 0.6;
}

.cover-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    min-width: 0;
}

.cover-hint {
    flex-basis: 100%;
    color: var(--ddb-text-muted);
    font-size: var(--ddb-font-size-sm);
    line-height: 1.4;
}

.cover-actions .field-error {
    flex-basis: 100%;
    margin-top: 0;
}

.cover-picker {
    margin-top: var(--ddb-spacing-sm);
}

@media only screen and (max-width: 575.98px) {
    .cover-row {
        flex-direction: column;
    }
}
</style>

<template>
    <div class="photo-thumb" :class="{ 'photo-thumb-missing': failed || !valid }">
        <template v-if="valid && !failed">
            <img class="photo-thumb-image" :src="dataset.thumbUrl(path, 256, hash)" :alt="alt" loading="lazy" @error="failed = true">
            <!-- Where the annotation is in the photo (the coverage query's pixel over the size of the full image) -->
            <span v-if="marker" class="photo-marker" data-testid="location-marker" role="img" aria-label="Approximate location"
                  title="Approximate location" :style="{ left: `${marker.left}%`, top: `${marker.top}%` }" />
        </template>
        <p v-else class="photo-thumb-note">{{ valid ? 'The image is not in the dataset' : 'Not a path of this dataset' }}</p>
    </div>
</template>

<script setup>
/**
 * The thumbnail of a photo of the dataset (a path is used only when it is a dataset path), with the "Approximate
 * location" marker over it where the annotation is, when the pixel and the size of the full image are known. An image
 * that cannot be loaded, or a path that is not the dataset's, shows a note instead.
 */
import { computed, ref, watch } from 'vue';
import { isDatasetPath, markerPosition } from '@/libs/reports/annotationPhotos';

const props = defineProps({
    dataset: { type: Object, required: true },
    path: { type: String, required: true },
    /** The entry hash: makes the address change with the file, so that the browser can keep the thumbnail */
    hash: { type: String, default: undefined },
    /** [x, y] of the annotation in the full image */
    pixel: { type: Array, default: null },
    /** The dimensions of the full image: { width, height } */
    size: { type: Object, default: null },
    alt: { type: String, required: true }
});

const failed = ref(false);
watch(() => props.path, () => { failed.value = false; });

const valid = computed(() => isDatasetPath(props.path));
const marker = computed(() => markerPosition(props.pixel, props.size));
</script>

<style scoped>
.photo-thumb {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 8rem;
    min-height: 5rem;
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
    overflow: hidden;
}

.photo-thumb-image {
    display: block;
    width: 100%;
    height: auto;
}

.photo-thumb-note {
    margin: 0;
    padding: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
    text-align: center;
}

/* A ring with a white edge: seen on a dark and on a light photo */
.photo-marker {
    position: absolute;
    width: 0.875rem;
    height: 0.875rem;
    margin: -0.4375rem 0 0 -0.4375rem;
    box-sizing: border-box;
    border: 2px solid var(--ddb-primary);
    border-radius: 50%;
    background: rgba(var(--ddb-glass-rgb), 0.55);
    box-shadow: 0 0 0 1px var(--ddb-text-on-dark);
}
</style>

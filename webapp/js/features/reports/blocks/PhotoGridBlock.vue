<template>
    <ul class="report-photos">
        <li v-for="photo in block.photos" :key="photo.path" class="report-photo">
            <!-- A photo that is no longer in the dataset says so, with its path -->
            <div v-if="missing(photo.path)" class="report-photo-missing">
                <strong>Missing photo</strong>
                <span class="report-photo-path">{{ photo.path }}</span>
            </div>
            <PhotoThumb v-else :dataset="context.dataset" :path="photo.path" :hash="entryOf(photo.path)?.hash" :pixel="photo.pixel"
                        :size="sizeOf(photo.path)" :alt="photoAlt(itemName, photo)" />
            <p v-if="photo.caption" class="report-photo-caption">{{ photo.caption }}</p>
        </li>
    </ul>
</template>

<script setup>
/**
 * The photo grid block: the photos of an item, each a thumbnail with its caption and, where the coverage query gave a
 * pixel, the marker of where the item is. A pinned photo that was deleted from the dataset shows as a "Missing photo"
 * tile with its path.
 */
import PhotoThumb from '@/components/measurements/PhotoThumb.vue';
import { isDatasetPath, photoAlt } from '@/libs/reports/annotationPhotos';
import { useReportContext } from '../reportContext';

defineProps({
    /** { itemId, photos: [{ path, caption, source, pixel }] } */
    block: { type: Object, required: true },
    /** The name of the item, for the alternative text of its photos */
    itemName: { type: String, default: '' }
});

const context = useReportContext();

const entryOf = path => context.photoEntries.value?.get(path);
// Missing only once the listings are in, and only for a path that is a dataset path (the thumbnail says the rest)
const missing = path => !!context.photoEntries.value && isDatasetPath(path) && !context.photoEntries.value.has(path);
const sizeOf = path => {
    const properties = entryOf(path)?.properties;
    return properties ? { width: properties.width, height: properties.height } : null;
};
</script>

<style scoped>
.report-photos {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-md);
    margin: 0 0 var(--ddb-spacing-md);
    padding: 0;
    list-style: none;
}

.report-photo {
    max-width: 12rem;
}

.report-photo :deep(.photo-thumb) {
    width: 12rem;
}

.report-photo-missing {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    width: 12rem;
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) dashed var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
}

.report-photo-path {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
    overflow-wrap: anywhere;
}

.report-photo-caption {
    margin: var(--ddb-spacing-xs) 0 0;
    font-size: var(--ddb-font-size-sm);
}
</style>

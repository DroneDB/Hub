<template>
    <Tabs v-if="photoContext" v-model:value="active" class="annotation-tabs">
        <TabList>
            <Tab value="details"><i class="fa-solid fa-pen" aria-hidden="true" /><span class="tab-label">Details</span></Tab>
            <Tab value="photos"><i class="fa-solid fa-images" aria-hidden="true" /><span class="tab-label">Photos ({{ pictureCount }})</span></Tab>
        </TabList>
        <TabPanels>
            <TabPanel value="details"><slot /></TabPanel>
            <TabPanel value="photos">
                <AnnotationCapture v-if="snapshot || canCapture" :dataset="photoContext.dataset" :snapshot="snapshot" :item-name="itemName"
                                   :can-capture="canCapture" />
                <!-- Looks for the covering photos when the tab is first opened, not while the dialog is -->
                <AnnotationPhotos v-if="visited" v-model="photos" :dataset="photoContext.dataset" :measurement-path="photoContext.measurementPath"
                                  :item-id="photoContext.itemId" :item-name="itemName" :geometry="photoContext.geometry"
                                  :read-only="photoContext.readOnly" @written="written" @uploading="emit('uploading', $event)" />
            </TabPanel>
        </TabPanels>
    </Tabs>
    <slot v-else />
</template>

<script setup>
/**
 * The body of the properties dialog of an annotation, 2D or 3D: its details (the slot) and, when the host gives a
 * `photoContext`, a Photos tab (AnnotationPhotos). Without one the details are all there is, and no tab is drawn.
 *
 * `v-model:photos` is the annotation's photos; the dialog owns them and saves them with the rest. `v-model:tab` is the
 * tab shown ('details' or 'photos'): the dialog shows the Photos tab after a capture. A 3D item's capture for reports
 * (`snapshot`) is shown above its photos (AnnotationCapture), also when there is none yet and the dialog can make one
 * (`canCapture`), and the tab counts it with the photos.
 * `photoContext` is `{ dataset, measurementPath, itemId, geometry, readOnly, onWritten? }`: the dataset API client, the
 * path of the measurement file the annotation is saved in, its id, its WGS84 geometry (null: not georeferenced, no
 * coverage request), whether the user cannot change it, and what is told of a photo uploaded to the dataset (its path:
 * the file list of the page that hosts the viewer shows it).
 * `uploading` (true / false) says that a photo is being uploaded: the dialog that holds the tabs waits with its Save.
 */
import { computed, ref, watch } from 'vue';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import AnnotationPhotos from '@/components/measurements/AnnotationPhotos.vue';
import AnnotationCapture from '@/components/measurements/AnnotationCapture.vue';

const props = defineProps({
    photoContext: { type: Object, default: null },
    /** The annotation's name, for the alternative texts of its photos */
    itemName: { type: String, default: '' },
    /** The capture of a 3D item for reports ({ path, camera, capturedAt }), or null */
    snapshot: { type: Object, default: null },
    /** The dialog can capture the item (its Capture for report button) */
    canCapture: { type: Boolean, default: false }
});

const emit = defineEmits(['uploading']);

const photos = defineModel('photos', { type: Array, default: () => [] });

const active = defineModel('tab', { type: String, default: 'details' });
const visited = ref(active.value === 'photos');
watch(active, tab => { if (tab === 'photos') visited.value = true; });
const pictureCount = computed(() => photos.value.length + (props.snapshot ? 1 : 0));

/** A photo uploaded to the dataset: the host is told, when it listens. @param {string} path */
const written = path => props.photoContext?.onWritten?.(path);
</script>

<style scoped>
.annotation-tabs :deep(.p-tabpanels) {
    padding: var(--ddb-spacing-md) 0 0;
}

.tab-label {
    margin-left: var(--ddb-spacing-xs);
}
</style>

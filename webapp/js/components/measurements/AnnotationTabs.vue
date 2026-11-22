<template>
    <Tabs v-if="photoContext" v-model:value="active" class="annotation-tabs">
        <TabList>
            <Tab value="details"><i class="fa-solid fa-pen" aria-hidden="true" /><span class="tab-label">Details</span></Tab>
            <Tab value="photos"><i class="fa-solid fa-images" aria-hidden="true" /><span class="tab-label">Photos ({{ photos.length }})</span></Tab>
        </TabList>
        <TabPanels>
            <TabPanel value="details"><slot /></TabPanel>
            <TabPanel value="photos">
                <!-- Looks for the covering photos when the tab is first opened, not while the dialog is -->
                <AnnotationPhotos v-if="visited" v-model="photos" :dataset="photoContext.dataset" :measurement-path="photoContext.measurementPath"
                                  :item-id="photoContext.itemId" :item-name="itemName" :geometry="photoContext.geometry"
                                  :read-only="photoContext.readOnly" />
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
 * `v-model:photos` is the annotation's photos; the dialog owns them and saves them with the rest.
 * `photoContext` is `{ dataset, measurementPath, itemId, geometry, readOnly }`: the dataset API client, the path of the
 * measurement file the annotation is saved in, its id, its WGS84 geometry (null: not georeferenced, no coverage
 * request) and whether the user cannot change it.
 */
import { ref, watch } from 'vue';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import AnnotationPhotos from '@/components/measurements/AnnotationPhotos.vue';

defineProps({
    photoContext: { type: Object, default: null },
    /** The annotation's name, for the alternative texts of its photos */
    itemName: { type: String, default: '' }
});

const photos = defineModel('photos', { type: Array, default: () => [] });

const active = ref('details');
const visited = ref(false);
watch(active, tab => { if (tab === 'photos') visited.value = true; });
</script>

<style scoped>
.annotation-tabs :deep(.p-tabpanels) {
    padding: var(--ddb-spacing-md) 0 0;
}

.tab-label {
    margin-left: var(--ddb-spacing-xs);
}
</style>

<template>
    <div class="dataset-map">
        <MapCore ref="core" :files="files" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" :defer-load="lazyload"
                 @scroll-to="file => emit('scrollTo', file)" @open-item="(file, view) => emit('openItem', file, view)"
                 @file-written="path => emit('fileWritten', path)" @file-removed="path => emit('fileRemoved', path)">
            <!-- The folder has nothing for the map and a subfolder has (FR-MAP-10); over the map, clear of its controls -->
            <template #overlay>
                <GeoSubfolderChip v-if="hint" :text="hint.text" :folder="hint.folder" @show="emit('showFolder', hint.path)" />
            </template>
        </MapCore>
    </div>
</template>

<script setup>
/**
 * The dataset page's Map tab: MapCore plus the tab plumbing. The tab switcher
 * calls onTabActivated / onPanelResized; with `lazyload` the map is built the first
 * time the tab shows. ViewDataset opens Plant Health through openPlantHealth.
 */
import { ref, inject, onMounted, onBeforeUnmount } from 'vue';
import MapCore from './MapCore.vue';
import GeoSubfolderChip from './GeoSubfolderChip.vue';
import { useGeoSubfolder } from '@/composables/useGeoSubfolder';

defineOptions({ name: 'DatasetMap' });

const props = defineProps({
    files: { type: Array, required: true },
    dataset: { type: Object, default: null },
    // The folder on show (null at the root) and whether it is still being listed: the hint for a folder with nothing to map
    currentPath: { type: String, default: null },
    loading: { type: Boolean, default: false },
    // The tab is on show: the hint searches only then (the page keeps the map mounted behind its other tabs)
    active: { type: Boolean, default: false },
    lazyload: { type: Boolean, default: false },
    canWrite: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: true }
});
// fileWritten / fileRemoved: a path of the dataset the map saved or removed (the measurements); showFolder: the path of
// the subfolder the user chose to see on the map
const emit = defineEmits(['scrollTo', 'openItem', 'fileWritten', 'fileRemoved', 'showFolder']);

const { hint } = useGeoSubfolder({
    dataset: () => props.dataset,
    files: () => props.files,
    currentPath: () => props.currentPath,
    loading: () => props.loading,
    active: () => props.active
});

const core = ref(null);
const registerTabChild = inject('registerTabChild', null);
const unregisterTabChild = inject('unregisterTabChild', null);

const tab = {
    onTabActivated: () => core.value && core.value.activate(),
    onPanelResized: () => core.value && core.value.updateSize(),
    openPlantHealth: (...args) => core.value && core.value.openPlantHealth(...args)
};

onMounted(() => { if (registerTabChild) registerTabChild('map', tab); });
onBeforeUnmount(() => { if (unregisterTabChild) unregisterTabChild('map'); });

defineExpose(tab);
</script>

<style scoped>
.dataset-map {
    position: relative;
    width: 100%;
    height: 100%;
}
</style>

<template>
    <MapCore ref="core" :files="files" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" :defer-load="lazyload"
             @scroll-to="file => emit('scrollTo', file)" @open-item="(file, view) => emit('openItem', file, view)" />
</template>

<script setup>
/**
 * The dataset page's Map tab (HQ-07): MapCore plus the tab plumbing. The tab switcher
 * calls onTabActivated / onPanelResized; with `lazyload` the map is built the first
 * time the tab shows. ViewDataset opens Plant Health through openPlantHealth.
 */
import { ref, inject, onMounted, onBeforeUnmount } from 'vue';
import MapCore from './MapCore.vue';

defineOptions({ name: 'DatasetMap' });

defineProps({
    files: { type: Array, required: true },
    dataset: { type: Object, default: null },
    lazyload: { type: Boolean, default: false },
    canWrite: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: true }
});
const emit = defineEmits(['scrollTo', 'openItem']);

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

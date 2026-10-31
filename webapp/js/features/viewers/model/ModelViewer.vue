<template>
    <component :is="viewer" v-if="viewer" :entry="entry" :dataset="dataset" />
    <ViewerShell v-else v-model:error="error" dark :loading="loading" loading-text="Loading model..." />
</template>

<script setup>
/**
 * ModelViewer - the route of a 3D model: reads the entry, then opens the viewer for the format
 * its build made the model in. libddb lists the legacy Nexus model only while the bm3d one is
 * missing, so an entry that lists no Nexus model (even one that lists no model at all, for
 * which Bm3dViewer says the model is not available) opens in the bm3d viewer. Each viewer is
 * a chunk of its own, so a bm3d model does not download the Nexus viewer, nor the other way round.
 */
import { computed, defineAsyncComponent } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { usesLegacyNexus } from './modelFormat';

defineOptions({ name: 'ModelViewer' });

const Bm3dViewer = defineAsyncComponent(() => import(/* webpackChunkName: "model-bm3d" */ './Bm3dViewer.vue'));
const LegacyNexusViewer = defineAsyncComponent(() => import(/* webpackChunkName: "model-legacy" */ './LegacyNexusViewer.vue'));

const { entry, dataset, loading, error } = useViewerEntry({
    types: [ddb.entry.type.MODEL], typeLabel: 'a 3D model', title: 'Model'
});

const viewer = computed(() => {
    if (!entry.value) return null;
    return usesLegacyNexus(entry.value) ? LegacyNexusViewer : Bm3dViewer;
});
</script>

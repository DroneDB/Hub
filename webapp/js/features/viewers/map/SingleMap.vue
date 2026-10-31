<template>
    <ViewerShell v-model:error="error" class="single-map" :loading="loading">
        <MapCore v-if="files.length" :files="files" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" standalone />
    </ViewerShell>
</template>

<script setup>
/**
 * SingleMap - the map of one file (route /r/:org/:ds/view/:encodedPath/map): MapCore in
 * standalone mode on the viewer shell.
 */
import { computed } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import MapCore from './MapCore.vue';

const { entry, dataset, ddbURI, canWrite, canDelete, loading, error } = useViewerEntry({ title: 'Map' });

const files = computed(() => entry.value ? [{
    path: ddbURI.value,
    entry: entry.value,
    label: ddb.pathutils.basename(entry.value.path),
    selected: false
}] : []);
</script>

<template>
    <ViewerShell v-model:error="error" class="single-map" :loading="loading || pending">
        <MapCore v-if="files.length" :files="files" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" standalone
                 :can-add-layers="canAdd" :add-layer-disabled="atLimit" :add-layer-title="addTitle" :added-layer-paths="addedPaths"
                 @add-layer="add" @remove-layer="remove" />
        <DialogHost :dialogs="dialogs" />
    </ViewerShell>
</template>

<script setup>
/**
 * SingleMap - the map of one file (route /r/:org/:ds/view/:encodedPath/map): MapCore in
 * standalone mode on the viewer shell. On a georaster it takes more georasters on top
 * (useAddedLayers), which the address holds.
 */
import { useRoute } from 'vue-router';
import ViewerShell from '@/components/ViewerShell.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useAddedLayers } from '@/composables/useAddedLayers';
import MapCore from './MapCore.vue';

const dialogs = useDialogs();
const { entry, dataset, ddbURI, canWrite, canDelete, loading, error } = useViewerEntry({ title: 'Map' });
const { addedPaths, files, pending, canAdd, atLimit, addTitle, add, remove } = useAddedLayers({
    route: useRoute(), dialogs, dataset, entry, ddbURI
});
</script>

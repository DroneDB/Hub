<template>
    <ViewerShell v-model:error="error" class="compare-map" :loading="loading">
        <div v-if="state" class="compare-layout">
            <CompareToolbar :name="saved ? saved.name : 'Unsaved comparison'" :dirty="dirty && canWrite" :saved="!!saved" :can-write="canWrite"
                            :can-add="canAdd" :max-layers="maxLayers" :layer-count="state.layers.length" :busy="busy"
                            :url-too-long="urlTooLong" :copied="copied" :notices="notices"
                            @add="pick()" @copy-link="copyLink" @save="save" @save-as-new="saveAsNew"
                            @repick="pick" @remove="remove" />
            <div class="compare-map-area">
                <MapCore :files="files" :dataset="dataset" :comparison="state" :can-write="false" :can-delete="false" standalone
                         @update:comparison="onMapUpdate" @remove-layer="remove" @repick="pick" @add-layer="pick()" @vue:mounted="pickOnFirstShow" />
            </div>
        </div>
        <div v-else-if="!loading" class="compare-failed">
            <router-link :to="{ name: 'ViewDataset', params: { org: dataset.org, ds: dataset.ds } }">
                <i class="fa-solid fa-arrow-left" /> Back to the dataset
            </router-link>
        </div>
        <DialogHost :dialogs="dialogs" />
    </ViewerShell>
</template>

<script setup>
/**
 * CompareMap - the compare view (route /r/:org/:ds/compare): georasters of one dataset side
 * by side on MapCore, picked from any folder, with a URL that holds the comparison and saved
 * comparisons in the dataset meta. useComparison owns the comparison; MapCore shows it.
 */
import { useRoute } from 'vue-router';
import ViewerShell from '@/components/ViewerShell.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useComparison } from '@/composables/useComparison';
import { useCopyText } from '@/composables/useCopyText';
import CompareToolbar from './CompareToolbar.vue';
import MapCore from './MapCore.vue';

const dialogs = useDialogs();
const {
    dataset, loading, error, busy, canWrite, state, saved, files, notices, dirty, canAdd, urlTooLong, maxLayers,
    currentLink, onMapUpdate, remove, pick, pickOnFirstShow, save, saveAsNew
} = useComparison({ route: useRoute(), dialogs });
const { copied, copy } = useCopyText();

const copyLink = () => copy(currentLink());
</script>

<style scoped>
.compare-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
}

.compare-map-area {
    flex: 1;
    min-height: 0;
    position: relative;
}

.compare-failed {
    padding: 1rem;
}
</style>

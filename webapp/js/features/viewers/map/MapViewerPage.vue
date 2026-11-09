<template>
    <ViewerShell v-model:error="error" class="map-viewer" :loading="loading || preparing" :load-error="loadError"
                 :name="name || null">
        <!-- The view bar of the shell: the name of the view, its unsaved mark and Save -->
        <template v-if="shown" #bar>
            <ViewBar :name="name" :dirty="dirty" :saved="!!saved" :can-write="canWrite" :busy="busy"
                     @save="save" @save-as-new="saveAsNew" />
        </template>
        <div v-if="shown" class="viewer-layout">
            <div class="viewer-map-area">
                <MapCore :files="layers.files.value" :view="state" :changed-paths="layers.changedPaths.value" :dataset="dataset"
                         standalone :can-write="canWrite" :can-delete="!!canDelete"
                         can-add-layers :add-layer-disabled="layers.atLimit.value" :add-layer-title="layers.addTitle.value"
                         :link-target="linkTarget" :share-note="shareNote" :can-save="canWrite && !embed"
                         @update:view="onMapUpdate" @add-layer="layers.add"
                         @remove-layer="layers.remove" @repick="layers.repick" @save="save" @vue:mounted="pickOnMount" />
            </div>
        </div>
        <DialogHost :dialogs="dialogs" />
    </ViewerShell>
</template>

<script setup>
/**
 * MapViewerPage - one view on the map viewer: a saved view (/r/:org/:ds/views/:uid) or a new
 * view of a file (/r/:org/:ds/view/:encodedPath/map). useSavedView owns the working state and
 * its saving, useViewLayers the layers; MapCore shows the state and reports what the user
 * changes in it. The page loads once, for the identity of the route it was made for (see
 * MapViewer, which makes another one for another identity).
 */
import { inject, ref, shallowRef, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ViewerShell from '@/components/ViewerShell.vue';
import DialogHost from '@/components/DialogHost.vue';
import { setTitle } from '@/libs/utils';
import { useDialogs } from '@/composables/useDialogs';
import { useSavedView } from '@/composables/useSavedView';
import { useViewLayers } from '@/composables/useViewLayers';
import MapCore from './MapCore.vue';
import ViewBar from './ViewBar.vue';

const emit = defineEmits(['identity']);

const dialogs = useDialogs();
// Provided by the app: true on a view embedded in another page (Viewer only)
const embed = inject('embed', false);
const route = useRoute();

// The view needs the hashes of the layers to save, the layers need the view: one is set after the other exists
const hashOf = shallowRef(null);
const {
    dataset, loading, error, loadError, canWrite, canDelete, state, setState, saved, dirty, shareNote, name, pageTitle, identity,
    baseEntry, busy, pickOnLoad, linkTarget, save, saveAsNew
} = useSavedView({ route, router: useRouter(), dialogs, embed, hashOf });
const layers = useViewLayers({ dataset, state, setState, baseEntry, savedData: () => saved.value?.data ?? null, dialogs, embed });
hashOf.value = layers.hashOf;

// The page moves to another route of its own view (a save, another base file): the parent must
// not take that for a different page. Sync, so it is known before the route changes.
watch(identity, id => emit('identity', id), { immediate: true, flush: 'sync' });

// The map is built once, with every layer: a layer added later does not take it down while it resolves
const shown = ref(false);
watch(() => !!state.value && !layers.pending.value, ready => { if (ready) shown.value = true; }, { immediate: true });
const preparing = computed(() => !!state.value && !shown.value);

// The title is the view's name; the router sets the route's own on a change of path, so it is set
// again after every route change. A page that failed to load keeps the route's title.
watch([pageTitle, () => route.fullPath], () => { if (pageTitle.value) setTitle(pageTitle.value); }, { immediate: true });

/**
 * The state the map reports goes to the browser history entry, which can only hold plain data
 * (the map's own state holds reactive objects).
 * @param {object} next
 */
const onMapUpdate = next => setState(JSON.parse(JSON.stringify(next)));

// "Compare to...": the picker opens once, as soon as the map shows
function pickOnMount() {
    if (!pickOnLoad.value) return;
    pickOnLoad.value = false;
    layers.pickFirst();
}
</script>

<style scoped>
.viewer-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
}

.viewer-map-area {
    flex: 1;
    min-height: 0;
    position: relative;
}
</style>

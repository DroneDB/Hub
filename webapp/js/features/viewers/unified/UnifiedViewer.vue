<template>
    <ViewerShell id="unified-viewer" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading" :load-error="loadError"
                 :ready="ready" settings-button="bottom-right" settings-title="Display settings" settings-id="unified-settings"
                 nav-toolbar :gestures="GESTURES" :build="buildNotice" @home="goHome" @build="startBuild">
        <template #loading>
            <LoadingSpinner :label="loadingText" />
            <LoadProgress :progress="progress" />
        </template>

        <div ref="viewEl" class="giro3d-view" />

        <!-- Local coordinates badge (top-center) -->
        <div v-if="ready && (isLocalPointCloud || isLocalDrawing)" class="local-coords-badge"
             :title="isLocalDrawing ? 'This drawing has no coordinate system: it is shown in its own coordinates, without a map. Add a .prj file with the same name to place it on the map.' : ''">
            <i class="fa-solid fa-unlock" /> Local coordinates<span v-if="isLocalDrawing && localUnits">&nbsp;({{ localUnits }})</span>
        </div>

        <!-- Measurement toolbar (top-left): the one MeasureToolbar of the 3D, splat and point-cloud viewers -->
        <div v-if="ready" class="measure-stack">
            <MeasureToolbar :kinds="MEASURE_KINDS" :active-kind="activeTool" :count="measureCount"
                            @measure="measure" @clear="clearMeasurements" @finish="finishMeasure" @cancel="cancelMeasure" />
        </div>

        <!-- Layer panel (top-right) -->
        <div v-if="ready && layers.length" class="layer-panel">
            <div class="layer-panel-title">Layers</div>
            <label v-for="l in layers" :key="l.id" class="layer-row">
                <input type="checkbox" :checked="l.visible" @change="toggleLayer(l)">
                <i :class="l.icon" /> <span>{{ l.name }}</span>
            </label>
        </div>

        <template #settings>
            <RangeSetting v-model="settings.ambientIntensity" label="Ambient" :max="5" />
            <RangeSetting v-model="settings.directionalIntensity" label="Directional" :max="5" />
            <RangeSetting v-model="settings.hemisphereIntensity" label="Sky / ground fill" :max="5" />
            <Button label="Reset" text @click="resetSettings" />
            <Button label="Close" severity="secondary" text @click="showSettings = false" />
        </template>
    </ViewerShell>
</template>

<script setup>
/**
 * UnifiedViewer - one Giro3D scene for every DroneDB build artifact: OGC 3D Tiles (models,
 * .3tz archives, on a globe when georeferenced), COPC point clouds, georasters (server XYZ
 * tiles) and vectors (MVT, or local CAD drawings), over an OSM basemap, with point /
 * distance / area measurements (the gesture rule of D-027: click adds a point; double click, Enter or right click ends it; Escape cancels). Opt-in ("Open in 3D Viewer"); the default viewers of each
 * type are unchanged. The scene, the loaders and the measure tool are modules next
 * to this view.
 */
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import LoadProgress from '@/components/LoadProgress.vue';
import { ref, reactive, toRefs, watch, onMounted, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import ViewerShell from '@/components/ViewerShell.vue';
import RangeSetting from '@/components/RangeSetting.vue';
import MeasureToolbar from '@/components/MeasureToolbar.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useViewerBuild, isBuildWait } from '@/composables/useViewerBuild';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { usePreference } from '@/composables/usePreference';
import { useNotify } from '@/composables/useNotify';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { loadGiro3dLibs } from './giro3dLibs';
import { UnifiedScene } from './unifiedScene';
import { LOADERS, viewableEntry } from './loaders';
import { MeasureTool } from './measureTool';
import { NAV_GESTURES, showNavHintOnce } from './navKeys';

defineOptions({ name: 'UnifiedViewer' });

// Type checks are the viewer's own (several types; .3tz indexed as generic)
const { entry, dataset, canWrite, loading, error, loadError, entryLoaded } = useViewerEntry({ title: '3D Viewer' });
// A file that is not built (yet) shows its build state with Build / Rebuild, and opens when the build ends (FR-VWR-08)
const { notice: buildNotice, setAvailability, build: startBuild } = useViewerBuild({
    dataset, path: () => entry.value?.path, canWrite, reload: reloadAfterBuild
});
const { settings, resetSettings } = useViewerSettings(PREF.UNIFIED_VIEWER, PREF_DEFAULTS[PREF.UNIFIED_VIEWER]);
const notify = useNotify();

// What the scene reports (reactive); the Giro3D objects themselves never are
const view = reactive({
    loadingText: 'Loading 3D viewer...',
    // 0..1 while data streams in; null hides the bar
    progress: null,
    layers: [],
    activeTool: null,
    // A point cloud without CRS / a drawing without coordinate system: own coordinates, no map
    isLocalPointCloud: false,
    isLocalDrawing: false,
    localUnits: ''
});
const { loadingText, progress, layers, activeTool, isLocalPointCloud, isLocalDrawing, localUnits } = toRefs(view);
const ready = ref(false);
const measureCount = ref(0);
const showSettings = ref(false);
const viewEl = ref(null);
let scene = null;
let measureTool = null;

watch(settings, () => { if (scene) scene.updateLighting(); }, { deep: true });
// The labels of the measurements follow the units preference (changed in another view or tab)
const measureUnit = usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
watch(measureUnit, () => { if (measureTool) measureTool.relabel(); });

// What the navigation does (the help of the toolbar of ViewerShell, which also takes Home, H and 0)
const GESTURES = NAV_GESTURES;
// The hint that points to the keys and to that help is shown once on this device
const navHintSeen = usePreference(PREF.UNIFIED_NAV_HINT, false);

// The shapes of the 3D viewer: a height is the splat viewer's
const MEASURE_KINDS = ['point', 'distance', 'area'];
// Drawing a shape again while it is drawn ends it
const measure = kind => {
    if (!measureTool) return;
    if (measureTool.activeKind === kind) measureTool.cancel();
    else measureTool.measure(kind);
};
const finishMeasure = () => measureTool && measureTool.finish();
const cancelMeasure = () => measureTool && measureTool.cancel();
const clearMeasurements = () => measureTool && measureTool.clear();
const goHome = () => scene && scene.goHome();
const toggleLayer = layer => scene && scene.toggleLayer(layer);

function dispose() {
    ready.value = false;
    if (measureTool) measureTool.dispose();
    if (scene) scene.dispose();
    measureTool = scene = null;
}

async function load() {
    loading.value = true;
    try {
        const viewable = viewableEntry(entry.value);
        // The build artifact must exist (3D Tiles, COPC, COG, MVT/FGB): a clear message, not an
        // empty scene (the dataset page checks before opening; a direct URL comes here)
        const { default: FileAvailabilityChecker } = await import(/* webpackChunkName: "buildcheck" */ '@/libs/build/fileAvailabilityChecker');
        const availability = await FileAvailabilityChecker.check(dataset.value, viewable, 'unified', { current: true });
        if (!availability.available) {
            // Its build is running, on hold, failed or missing: the shell says so, the viewer opens when the build ends
            if (isBuildWait(availability)) {
                setAvailability(availability);
                return;
            }
            throw new Error(availability.message || `${viewable.path} is not available in the 3D viewer.`);
        }
        setAvailability(null);

        scene = new UnifiedScene(await loadGiro3dLibs(), viewEl.value, { settings, view, notify });
        measureTool = new MeasureTool(scene, count => { measureCount.value = count; });
        await LOADERS[viewable.type](scene, viewable, dataset.value);
        ready.value = true;
        showNavHintOnce(notify, navHintSeen);
    } catch (e) {
        // A loader can fail after the instance exists (an empty tileset): no render loop left behind
        dispose();
        error.value = e.message;
    } finally {
        loading.value = false;
        view.progress = null;
    }
}

// The build ended: the file as listed now, and the viewer opens it
async function reloadAfterBuild() {
    try {
        entry.value = await dataset.value.listOne(entry.value.path);
        await load();
    } catch (e) {
        error.value = e.message;
    }
}

onMounted(async () => {
    if (await entryLoaded) await load();
});

onBeforeUnmount(() => {
    dispose();
});
</script>

<style scoped lang="scss" src="./UnifiedViewer.scss"></style>

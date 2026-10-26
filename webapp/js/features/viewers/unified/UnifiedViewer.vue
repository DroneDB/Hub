<template>
    <ViewerShell id="unified-viewer" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading"
                 :ready="ready" settings-button="bottom-right" settings-title="Display settings" settings-id="unified-settings">
        <template #loading>
            <LoadingSpinner :label="loadingText" />
            <div v-if="progress !== null" class="progress-track">
                <div class="progress-fill" :style="{ width: Math.round(progress * 100) + '%' }" />
            </div>
            <p v-if="progress !== null" class="progress-text">{{ Math.round(progress * 100) }}%</p>
        </template>

        <div ref="viewEl" class="giro3d-view" />

        <!-- Local coordinates badge (top-center) -->
        <div v-if="ready && (isLocalPointCloud || isLocalDrawing)" class="local-coords-badge"
             :title="isLocalDrawing ? 'This drawing has no coordinate system: it is shown in its own coordinates, without a map. Add a .prj file with the same name to place it on the map.' : ''">
            <i class="fa-solid fa-unlock" /> Local coordinates<span v-if="isLocalDrawing && localUnits">&nbsp;({{ localUnits }})</span>
        </div>

        <!-- Measurement toolbar (top-left) -->
        <div v-if="ready" class="toolbar">
            <button :class="{ active: activeTool === 'point' }" title="Measure point" aria-label="Measure point" @click="measure('point')">
                <i class="fa-solid fa-location-dot" />
            </button>
            <button :class="{ active: activeTool === 'distance' }" title="Measure distance" aria-label="Measure distance" @click="measure('distance')">
                <i class="fa-solid fa-ruler" />
            </button>
            <button :class="{ active: activeTool === 'area' }" title="Measure area" aria-label="Measure area" @click="measure('area')">
                <i class="fa-solid fa-draw-polygon" />
            </button>
            <button :disabled="measureCount === 0" title="Clear measurements" aria-label="Clear measurements" @click="clearMeasurements">
                <i class="fa-solid fa-trash" />
            </button>
        </div>

        <!-- Layer panel (top-right) -->
        <div v-if="ready && layers.length" class="layer-panel">
            <div class="layer-panel-title">Layers</div>
            <label v-for="l in layers" :key="l.id" class="layer-row">
                <input type="checkbox" :checked="l.visible" @change="toggleLayer(l)">
                <i :class="l.icon" /> <span>{{ l.name }}</span>
            </label>
        </div>

        <!-- Navigation toolbar (bottom-left): one navigation mode in every scene, so Home
                 is the only control it needs. -->
        <div v-if="ready" class="nav-toolbar">
            <button title="Home - return to the framed view (Home key)" aria-label="Home" @click="goHome">
                <i class="fa-solid fa-house" />
            </button>
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
 * distance / area measurements. Opt-in ("Open in 3D Viewer"); the default viewers of each
 * type are unchanged. The scene, the loaders and the measure tool are modules next
 * to this view.
 */
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { ref, reactive, toRefs, watch, onMounted, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import ViewerShell from '@/components/ViewerShell.vue';
import RangeSetting from '@/components/RangeSetting.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { useNotify } from '@/composables/useNotify';
import keyboard from '@/libs/keyboard';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { loadGiro3dLibs } from './giro3dLibs';
import { UnifiedScene } from './unifiedScene';
import { LOADERS, viewableEntry } from './loaders';
import { MeasureTool } from './measureTool';

defineOptions({ name: 'UnifiedViewer' });

// Type checks are the viewer's own (several types; .3tz indexed as generic)
const { entry, dataset, loading, error, entryLoaded } = useViewerEntry({ title: '3D Viewer' });
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

const measure = kind => measureTool && measureTool.measure(kind);
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
        if (!availability.available) throw new Error(availability.message || `${viewable.path} is not available in the 3D viewer.`);

        scene = new UnifiedScene(await loadGiro3dLibs(), viewEl.value, { settings, view, notify });
        measureTool = new MeasureTool(scene, count => { measureCount.value = count; });
        await LOADERS[viewable.type](scene, viewable, dataset.value);
        ready.value = true;
    } catch (e) {
        // A loader can fail after the instance exists (an empty tileset): no render loop left behind
        dispose();
        error.value = e.message;
    } finally {
        loading.value = false;
        view.progress = null;
    }
}

// Home / 0 re-frames, whatever has the focus (but not while typing)
function onHomeKey(e) {
    const t = e.target;
    if (!ready.value || (t instanceof Element && (t.closest('input, textarea') || t.isContentEditable))) return;
    if (e.key === 'Home' || e.key === '0') {
        e.preventDefault();
        goHome();
    }
}

onMounted(async () => {
    keyboard.onKeyDown(onHomeKey);
    if (await entryLoaded) await load();
});

onBeforeUnmount(() => {
    keyboard.offKeyDown(onHomeKey);
    dispose();
});
</script>

<style scoped lang="scss" src="./UnifiedViewer.scss"></style>

<template>
    <ModelViewerShell v-model:error="error" v-model:settings-open="showSettings" :settings="settings" :loading="loading"
                      :loaded="loaded" :has-texture="modelInfo.hasTexture" @reset="resetSettings">
        <canvas ref="canvas" />
    </ModelViewerShell>
</template>

<script setup>
/**
 * LegacyNexusViewer - a Nexus (.nxz) model, which the builds that predate bm3d made. It runs the
 * Nexus scripts on the global three.js build of Potree (the viewer of the bm3d models,
 * Bm3dViewer, uses the npm one) on the scene of modelStage.
 */
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import ModelViewerShell from './ModelViewerShell.vue';
import { createModelStage } from './modelStage';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { loadResources } from '@/libs/lazy';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

defineOptions({ name: 'LegacyNexusViewer' });

const props = defineProps({
    /** The model entry the route names (its build lists the Nexus model) */
    entry: { type: Object, required: true },
    dataset: { type: Object, required: true }
});

const { settings, resetSettings } = useViewerSettings(PREF.MODEL_LIGHTING, PREF_DEFAULTS[PREF.MODEL_LIGHTING]);

const canvas = ref(null);
const loading = ref(true);
const error = ref('');
const loaded = ref(false);
const showSettings = ref(false);
const modelInfo = reactive({ hasTexture: false, hasColors: false, hasNormals: false });

// Not reactive
let stage = null;
let disposed = false;

function loadNexus() {
    if (typeof THREE === 'undefined') throw new Error('Error loading THREE.js library');
    if (typeof NexusObject === 'undefined') throw new Error('Error loading Nexus library');

    stage = createModelStage({ THREE, ArcballControls: THREE.ArcballControls, canvas: canvas.value, settings });

    const model = props.dataset.Entry(props.entry).getModelArtifact();
    const nexusObj = new NexusObject(model, () => {
        stage.frameModel(nexusObj, nexusObj.geometry.boundingSphere);

        const vertex = nexusObj.geometry.instance?.mesh?.vertex;
        if (vertex) {
            modelInfo.hasTexture = !!vertex.texCoord;
            modelInfo.hasColors = !!vertex.color;
            modelInfo.hasNormals = !!vertex.normal;
        }
        if (!modelInfo.hasTexture) nexusObj.material = stage.material;
        loaded.value = true;
    }, () => {}, stage.renderer, false);
    stage.scene.add(nexusObj);
    stage.start();
}

onMounted(async () => {
    try {
        await loadResources('/potree/libs/three.js/build/three.min.js');
        await loadResources('/nexus/nexus.js');
        await loadResources('/nexus/nexusThree.js');
        await loadResources('/nexus/arcballControls.js');
        if (!disposed) loadNexus();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// Stop the render loop and release the WebGL context with the page
onBeforeUnmount(() => {
    disposed = true;
    stage?.dispose();
});
</script>

<style scoped>
canvas {
    display: flex;
    width: 100%;
    height: 100%;
}
</style>

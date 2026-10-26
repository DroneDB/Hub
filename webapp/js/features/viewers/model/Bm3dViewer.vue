<template>
    <ModelViewerShell v-model:error="error" v-model:settings-open="showSettings" :settings="settings" :loading="loading"
                      :loaded="loaded" :has-texture="modelInfo.hasTexture" @reset="resetSettings">
        <canvas ref="canvas" />
    </ModelViewerShell>
</template>

<script setup>
/**
 * Bm3dViewer - a bm3d (.bm3d) multiresolution model: the bm3d-viewer package streams the nodes
 * the view needs by range requests and decodes them in a worker (served from /wasm/bm3d/), on
 * the npm build of three.js and the scene of modelStage.
 */
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import ModelViewerShell from './ModelViewerShell.vue';
import { createModelStage } from './modelStage';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

defineOptions({ name: 'Bm3dViewer' });

// The worker and the decoder (webpack copies them from the package): a worker must come from the
// page's origin
const DECODER_PATH = '/wasm/bm3d/';

const props = defineProps({
    /** The model entry the route names (its build lists the bm3d model) */
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
let model = null;
let disposed = false;

/**
 * Reads what the model has from the material the viewer made for it (a map for a texture, vertex
 * colours, a lit material for normals) and, for a model with normals but no texture, shades it
 * like the Nexus viewer does: with the material of the stage, which the lighting settings drive.
 */
function chooseMaterial() {
    const made = model.material;
    modelInfo.hasTexture = !!made.map;
    modelInfo.hasColors = !!made.vertexColors;
    modelInfo.hasNormals = !!made.isMeshLambertMaterial;
    if (modelInfo.hasTexture || !modelInfo.hasNormals) return;
    stage.material.vertexColors = modelInfo.hasColors;
    stage.material.color.set(modelInfo.hasColors ? 0xffffff : 0xaaaaaa);
    stage.material.needsUpdate = true;
    model.material = stage.material;
}

async function loadBm3d() {
    // three.js and the viewer only load with the page of a model
    const THREE = await import(/* webpackChunkName: "three" */ 'three');
    const { ArcballControls } = await import(/* webpackChunkName: "three" */ 'three/examples/jsm/controls/ArcballControls.js');
    const { Bm3dObject } = await import(/* webpackChunkName: "model-bm3d" */ 'bm3d-viewer');
    if (disposed) return;

    const url = props.dataset.Entry(props.entry).getModelArtifact();
    stage = createModelStage({ THREE, ArcballControls, canvas: canvas.value, settings });
    model = new Bm3dObject(url, object => {
        stage.frameModel(object, object.geometry.boundingSphere);
        chooseMaterial();
        loaded.value = true;
    }, () => {}, stage.renderer, undefined, {
        decoderPath: DECODER_PATH,
        // A model that cannot be opened is the viewer's error; a node that cannot be read (the
        // view lacks a piece, the rest still shows) is only logged
        onError: (e, node) => {
            if (node === undefined) error.value = `The 3D model cannot be opened: ${e.message}`;
            else console.error(`3D model node ${node}:`, e);
        }
    });
    stage.scene.add(model);
    stage.start();
}

onMounted(async () => {
    try {
        await loadBm3d();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// Stop the render loop, free the nodes on the GPU and release the WebGL context with the page
onBeforeUnmount(() => {
    disposed = true;
    model?.dispose();
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

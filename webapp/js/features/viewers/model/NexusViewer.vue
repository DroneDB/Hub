<template>
    <ViewerShell id="nexus" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading"
                 loading-text="Loading model..." :ready="loaded" settings-button="bottom-left" settings-title="Lighting"
                 settings-id="nexus-lighting">
        <canvas ref="canvas" />
        <template #settings>
            <RangeSetting v-model="settings.ambientIntensity" label="Ambient" :max="3" />
            <RangeSetting v-model="settings.directionalIntensity" label="Directional" :max="3" />
            <RangeSetting v-if="!modelInfo.hasTexture" v-model="settings.shininess" label="Shininess" :max="100" :step="5"
                          :format="v => String(v)" />
            <Button label="Reset" text @click="resetSettings" />
            <Button label="Close" severity="secondary" text @click="showSettings = false" />
        </template>
    </ViewerShell>
</template>

<script setup>
/**
 * NexusViewer - a Nexus (.nxz) multiresolution model with arcball controls and MeshLab-style
 * lighting (on ViewerShell, useViewerEntry and useViewerSettings).
 */
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import RangeSetting from '@/components/RangeSetting.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { loadResources } from '@/libs/lazy';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

defineOptions({ name: 'NexusViewer' });

const { entry, dataset, loading, error, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.MODEL], typeLabel: 'a 3D model', title: 'Model'
});
const { settings, resetSettings } = useViewerSettings(PREF.NEXUS_LIGHTING, PREF_DEFAULTS[PREF.NEXUS_LIGHTING]);

const canvas = ref(null);
const loaded = ref(false);
const showSettings = ref(false);
const modelInfo = reactive({ hasTexture: false, hasColors: false, hasNormals: false });

// three.js objects (not reactive)
let lights = null;
let material = null;
let renderer = null;
let controls = null;
let frame = 0;
let disposed = false;

function applyLighting() {
    if (!lights) return;
    lights.ambient.intensity = settings.ambientIntensity;
    lights.key.intensity = settings.directionalIntensity;
    lights.back.intensity = settings.directionalIntensity;
    material.shininess = settings.shininess;
    material.needsUpdate = true;
}
watch(settings, applyLighting, { deep: true });

async function loadNexus() {
    if (typeof THREE === 'undefined') throw new Error('Error loading THREE.js library');
    if (typeof NexusObject === 'undefined') throw new Error('Error loading Nexus library');

    const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
    camera.position.z = 4.0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 2000, 3500);

    lights = {
        ambient: new THREE.AmbientLight(0xffffff, settings.ambientIntensity),
        // Natural sky/ground fill
        hemisphere: new THREE.HemisphereLight(0xffffff, 0x444444, 0.4),
        key: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity),
        back: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity)
    };
    lights.key.position.set(1, 1, -1);
    lights.back.position.set(-1, -1, 1);
    Object.values(lights).forEach(light => scene.add(light));

    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: false });
    renderer.setClearColor(scene.fog.color);
    renderer.setPixelRatio(window.devicePixelRatio);

    // MeshLab-style shading for models without a texture
    material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, specular: 0x444444, shininess: settings.shininess });

    const model = dataset.value.Entry(entry.value).getNxz();
    if (disposed) return;
    const nexusObj = new NexusObject(model, () => {
        const s = 1 / nexusObj.geometry.boundingSphere.radius;
        const p = nexusObj.geometry.boundingBox.getCenter(new THREE.Vector3()).negate();
        nexusObj.position.set(p.x * s, p.y * s, p.z * s);
        nexusObj.scale.set(s, s, s);

        const vertex = nexusObj.geometry.instance?.mesh?.vertex;
        if (vertex) {
            modelInfo.hasTexture = !!vertex.texCoord;
            modelInfo.hasColors = !!vertex.color;
            modelInfo.hasNormals = !!vertex.normal;
        }
        if (!modelInfo.hasTexture) nexusObj.material = material;
        loaded.value = true;
    }, () => {}, renderer, false);
    scene.add(nexusObj);

    controls = new THREE.ArcballControls(camera, renderer.domElement, scene);
    controls.setGizmosVisible(false);

    const fitCanvas = () => {
        const el = renderer.domElement;
        if (el.width !== el.clientWidth || el.height !== el.clientHeight) {
            renderer.setSize(el.clientWidth, el.clientHeight, false);
            camera.aspect = el.clientWidth / el.clientHeight;
            camera.updateProjectionMatrix();
        }
    };
    const animate = () => {
        // lifetime: paired (cancelled in onBeforeUnmount)
        frame = requestAnimationFrame(animate);
        fitCanvas();
        renderer.render(scene, camera);
        controls.update();
    };
    animate();
}

onMounted(async () => {
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        await loadResources('/potree/libs/three.js/build/three.min.js');
        await loadResources('/nexus/nexus.js');
        await loadResources('/nexus/nexusThree.js');
        await loadResources('/nexus/arcballControls.js');
        await loadNexus();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// Stop the render loop and release the WebGL context with the page
onBeforeUnmount(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    if (controls && controls.dispose) controls.dispose();
    if (renderer) renderer.dispose();
});
</script>

<style scoped>
canvas {
    display: flex;
    width: 100%;
    height: 100%;
}
</style>

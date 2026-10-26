<template>
    <ViewerShell id="splat" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading"
                 loading-text="Loading Gaussian Splat..." settings-title="View settings" settings-id="splat-settings">
        <canvas ref="canvas" />

        <div class="top-right-stack">
            <div v-if="loaded && activeCameraName" class="camera-hud" title="Current camera view">
                <i class="fa-solid fa-camera" /> {{ activeCameraName }}
            </div>
        </div>

        <!-- Paged .rad: level-of-detail streaming -->
        <div v-if="loaded && streaming" class="streaming-badge" title="Level-of-detail streaming: only the detail in view is downloaded">
            <i class="fa-solid fa-tower-broadcast m-0" />
        </div>

        <div v-if="loaded" class="btn-stack">
            <button class="btn-overlay" :class="{ active: navMode === 'fly' }" title="Fly navigation: drag to look around, WASD/QE to move"
                    aria-label="Fly navigation" @click="navMode = 'fly'">
                <i class="fa-solid fa-plane" />
            </button>
            <button class="btn-overlay" :class="{ active: navMode === 'earth' }"
                    title="Earth navigation: drag to pan, right-drag to orbit, wheel to zoom" aria-label="Earth navigation" @click="navMode = 'earth'">
                <i class="fa-solid fa-earth-americas" />
            </button>
            <button class="btn-overlay" title="View settings" aria-label="View settings" @click="showSettings = !showSettings">
                <i class="fa-solid fa-gear" />
            </button>
            <button class="btn-overlay" title="Manage camera views" aria-label="Manage camera views" @click="showCameraManager = !showCameraManager">
                <i class="fa-solid fa-camera" />
            </button>
        </div>

        <SplatCameraRail v-if="loaded" :cameras="cameras" :active-index="activeCameraIndex" :mode="presentationMode" :can-write="canWrite"
                         :dirty="camerasDirty" @goto="flyTo" @toggle-orbit="toggleOrbit" @toggle-tour="toggleTour" @add="addCurrentCamera"
                         @save="saveCameras" />
        <SplatNavPad v-if="loaded" :pressed="pressed" :touch="isTouch" @press="pressKey" @release="releaseKey" />

        <template #settings>
            <SplatSettings :flipped="flipped" :point-scale="pointScale" :tilt-roll="tiltRoll" :tilt-pitch="tiltPitch"
                           @update:flipped="setFlipped" @update:point-scale="setPointScale"
                           @update:tilt-roll="v => setTilt(v, tiltPitch)" @update:tilt-pitch="v => setTilt(tiltRoll, v)"
                           @close="showSettings = false" />
        </template>

        <CameraManager v-if="showCameraManager" :cameras="cameras" :can-write="canWrite" :dirty="camerasDirty"
                       :active-index="activeCameraIndex" @goto="flyTo" @add-current="addCurrentCamera" @update-current="updateCameraToCurrent"
                       @delete="deleteCamera" @move="moveCamera" @rename="renameCamera" @save="saveCameras"
                       @close="showCameraManager = false" />
    </ViewerShell>
</template>

<script setup>
/**
 * SplatViewer - a Gaussian splat (Spark.js on three.js): streamed level of detail for paged
 * .rad files, fly and earth navigation, saved camera views with a tour, ground-plane
 * calibration. The camera rig, the two navigation modes, the presentation and the
 * camera sidecar are modules next to this view; the view wires them to the scene.
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useEventListener, useListenerBag } from '@/composables/useEventListener';
import { usePreference } from '@/composables/usePreference';
import { useNotify } from '@/composables/useNotify';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import CameraManager from './CameraManager.vue';
import SplatCameraRail from './SplatCameraRail.vue';
import SplatNavPad from './SplatNavPad.vue';
import SplatSettings from './SplatSettings.vue';
import { CameraRig } from './cameraRig';
import { FlyControls, MOVE_KEYS } from './flyControls';
import { EarthControls } from './earthControls';
import { Presentation } from './presentation';
import { camerasPathFor, parseCamerasFile, serializeCamerasFile, cameraFromRig, activeAfterDelete, activeAfterMove } from './cameraPresets';

defineOptions({ name: 'SplatViewer' });

const { entry, dataset, canWrite, loading, error, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.GAUSSIAN_SPLAT], typeLabel: 'a Gaussian Splat', title: 'Gaussian Splat'
});
const notify = useNotify();
const listeners = useListenerBag();

const canvas = ref(null);
const loaded = ref(false);
const showSettings = ref(false);
const showCameraManager = ref(false);
const streaming = ref(false);
// Most INRIA/3DGS scenes render upside down without the flip
const flipped = ref(true);
const pointScale = ref(1.0);
// Ground-plane calibration (degrees), saved with the cameras: levels off-gravity reconstructions
const tiltRoll = ref(0);
const tiltPitch = ref(0);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const navMode = usePreference(PREF.SPLAT_NAV_MODE, PREF_DEFAULTS[PREF.SPLAT_NAV_MODE]);
const pressed = reactive(Object.fromEntries(MOVE_KEYS.map(k => [k, false])));
const presentationMode = ref(null);
const cameras = ref([]);
const activeCameraIndex = ref(null);
const camerasDirty = ref(false);
const activeCameraName = computed(() => {
    const i = activeCameraIndex.value;
    const c = i === null ? null : cameras.value[i];
    return c ? (c.name || `Camera ${i + 1}`) : null;
});

// three.js / Spark objects: never reactive (a proxy breaks their identity checks)
let THREE = null;
let renderer = null;
let scene = null;
let controls = null;
let splatMesh = null;
let rig = null;
let fly = null;
let earth = null;
let presentation = null;
let bounds = null;
let frameTimer = null;
let resizeObserver = null;
let lastFrameTime = 0;
let camerasPath = null;

const dialogOpen = () => showSettings.value || showCameraManager.value;

// Explicit navigation stops the presentation and leaves the camera on show
function onUserInteract() {
    if (presentation) presentation.stop();
    activeCameraIndex.value = null;
}

// ---- Scene ------------------------------------------------------------------------------

function applyOrientation() {
    // 180° about X, or none
    if (splatMesh) splatMesh.quaternion.set(flipped.value ? 1 : 0, 0, 0, flipped.value ? 0 : 1);
}

function resizeCanvas() {
    const el = renderer && renderer.domElement;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    if (el.width !== el.clientWidth || el.height !== el.clientHeight) {
        renderer.setSize(el.clientWidth, el.clientHeight, false);
        rig.camera.aspect = el.clientWidth / el.clientHeight;
        rig.camera.updateProjectionMatrix();
    }
}

/**
 * Frames the splat: the build-time bounds when known (the only source for a paged .rad at
 * load), else the resident bounds of a plain .spz. Returns whether a real box was framed.
 */
function frameCamera() {
    let box = null;
    if (bounds && bounds.min && bounds.max) box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
    if (!box || box.isEmpty()) box = splatMesh.getBoundingBox ? splatMesh.getBoundingBox(true) : null;
    const real = !!box && !box.isEmpty();
    if (!real) box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    // The mesh stays at the origin and unit scale (point size is its scale)
    splatMesh.scale.setScalar(pointScale.value);
    splatMesh.position.set(0, 0, 0);
    rig.frame(box, splatMesh.quaternion);
    return real;
}

// A paged .rad has no bounds until its first chunks arrive: retry for ~10 s
function frameCameraWhenReady(attempt = 0) {
    clearTimeout(frameTimer);
    if (!splatMesh || frameCamera() || attempt >= 40) return;
    // lifetime: paired (cleared in onBeforeUnmount)
    frameTimer = setTimeout(() => frameCameraWhenReady(attempt + 1), 250);
}

function renderFrame(time) {
    const now = time || performance.now();
    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 0;
    lastFrameTime = now;
    resizeCanvas();

    // Moving with the keys or the pad stops the presentation
    if (fly.update(dt)) onUserInteract();
    else presentation.update(dt);
    controls.update();

    // controls.update() looks at the target: reassert our own orientation
    const mode = presentation.mode;
    if (!mode) {
        if (navMode.value === 'earth') rig.syncYawPitch();
        else fly.look(dt);
    } else if (mode === 'orbit') {
        rig.syncYawPitch();
    }
    earth.updateMarker();
    renderer.render(scene, rig.camera);
}

async function loadSplat() {
    const splatEntry = dataset.value.Entry(entry.value);
    // The level-of-detail .rad streams by range requests; the plain .spz is the fallback of
    // datasets built before LOD (getGsplat throws when it is absent: not called with a .rad)
    const radUrl = splatEntry.getGsplatLod();
    const spzUrl = radUrl ? null : splatEntry.getGsplat();
    streaming.value = !!radUrl;
    bounds = await splatEntry.getGsplatBounds();
    await loadCameras();

    // three.js, OrbitControls and Spark (WebGL + WASM) only load with the viewer
    THREE = await import(/* webpackChunkName: "three" */ 'three');
    const { OrbitControls } = await import(/* webpackChunkName: "three" */ 'three/examples/jsm/controls/OrbitControls.js');
    const { SparkRenderer, SplatMesh } = await import(/* webpackChunkName: "spark" */ '@sparkjsdev/spark');

    const el = canvas.value;
    renderer = new THREE.WebGLRenderer({ canvas: el, antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth || 1, el.clientHeight || 1, false);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    const camera = new THREE.PerspectiveCamera(60, (el.clientWidth || 1) / (el.clientHeight || 1), 0.1, 1000);
    camera.position.set(0, 0, 4);

    // Paged .rad: foveation spends the splat budget toward the view direction
    scene.add(streaming.value
        ? new SparkRenderer({ renderer, pagedExtSplats: true, coneFov0: 70.0, coneFov: 120.0, behindFoveate: 0.2, coneFoveate: 0.4 })
        : new SparkRenderer({ renderer }));

    // OrbitControls pans, zooms and auto-rotates; looking around is ours
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enableDamping = false;
    listeners.add(controls, 'start', onUserInteract);

    rig = new CameraRig(THREE, camera, controls);
    rig.setTilt(tiltRoll.value, tiltPitch.value);
    const hooks = mode => ({ enabled: () => navMode.value === mode && !dialogOpen(), onInteract: onUserInteract });
    fly = new FlyControls(rig, hooks('fly'));
    fly.attach(el, (t, type, fn, opts) => listeners.add(t, type, fn, opts));
    earth = new EarthControls(rig, el, scene, hooks('earth'));
    earth.attach((t, type, fn, opts) => listeners.add(t, type, fn, opts));
    presentation = new Presentation(rig, {
        cameras: () => cameras.value,
        onMode: mode => { presentationMode.value = mode; },
        onCamera: index => { activeCameraIndex.value = index; }
    });

    // Paged .rad: chunks on demand by range requests; .spz: whole file, LOD built in a worker.
    // Authentication rides on the same-origin jwtToken cookie.
    splatMesh = streaming.value ? new SplatMesh({ url: radUrl, paged: true }) : new SplatMesh({ url: spzUrl, lod: true });
    scene.add(splatMesh);
    await splatMesh.initialized;

    applyOrientation();
    frameCameraWhenReady();
    loaded.value = true;
    applyNavMode();
    // A tour through the saved cameras, else a slow orbit; any navigation stops it, P resumes
    startPresentation();

    // Spark streams and traverses its LOD from renderer.render: render every frame
    renderer.setAnimationLoop(renderFrame);
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(el);
}

// ---- Settings ---------------------------------------------------------------------------

function setFlipped(value) {
    flipped.value = value;
    applyOrientation();
    camerasDirty.value = true;
}

function setPointScale(value) {
    pointScale.value = value;
    if (splatMesh) splatMesh.scale.setScalar(value);
}

// Re-levels the current view on the new scene up
function setTilt(roll, pitch) {
    tiltRoll.value = roll;
    tiltPitch.value = pitch;
    camerasDirty.value = true;
    if (!rig) return;
    presentation.stop();
    rig.setTilt(roll, pitch);
    rig.applyYawPitch();
}

// Earth mode: our pointer handlers pan / orbit / zoom; fly mode: OrbitControls pans and zooms
function applyNavMode() {
    if (!controls) return;
    const earthMode = navMode.value === 'earth';
    controls.enablePan = !earthMode;
    controls.enableZoom = !earthMode;
    if (earthMode) {
        presentation.stop();
    } else {
        earth.reset();
        rig.syncYawPitch();
    }
}
watch(navMode, mode => {
    if (mode !== 'fly' && mode !== 'earth') navMode.value = PREF_DEFAULTS[PREF.SPLAT_NAV_MODE];
    else applyNavMode();
});

// ---- Keyboard and pad -------------------------------------------------------------------

function pressKey(code) {
    fly.press(code);
    pressed[code] = true;
    onUserInteract();
}

function releaseKey(code) {
    if (fly) fly.release(code);
    if (code in pressed) pressed[code] = false;
}

function onKeyDown(e) {
    const t = e.target;
    if (!loaded.value || e.ctrlKey || e.metaKey || e.altKey) return;
    // Not while typing (the camera name input)
    if (t instanceof Element && (t.closest('input, textarea') || t.isContentEditable)) return;
    if (MOVE_KEYS.includes(e.code)) {
        pressKey(e.code);
        e.preventDefault();
    } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        fly.press(e.code);
    } else if (/^Digit[0-9]$/.test(e.code)) {
        // 0-9 fly to that camera
        const index = Number(e.code.slice(5));
        if (index < cameras.value.length) {
            flyTo(index);
            e.preventDefault();
        }
    } else if (e.key === '-' || e.key === '_') {
        stepCamera(-1);
        e.preventDefault();
    } else if (e.key === '+' || e.key === '=') {
        stepCamera(1);
        e.preventDefault();
    } else if (e.key === 'p' || e.key === 'P') {
        startPresentation();
        e.preventDefault();
    }
}

useEventListener(window, 'keydown', onKeyDown);
useEventListener(window, 'keyup', e => releaseKey(e.code));
// Keys released outside the window never send keyup
useEventListener(window, 'blur', () => {
    if (fly) fly.stop();
    MOVE_KEYS.forEach(k => { pressed[k] = false; });
});

// ---- Presentation and cameras -----------------------------------------------------------

function startPresentation() {
    if (!presentation) return;
    fly.stop();
    presentation.start();
}

function toggleOrbit() {
    if (presentation.mode === 'orbit') presentation.stop();
    else {
        fly.stop();
        presentation.orbit();
    }
}

function toggleTour() {
    if (presentation.mode === 'tour') presentation.stop();
    else startPresentation();
}

function flyTo(index) {
    fly.stop();
    presentation.flyTo(index);
}

function stepCamera(step) {
    const n = cameras.value.length;
    if (!n) return;
    const current = activeCameraIndex.value;
    flyTo(current === null ? (step > 0 ? 0 : n - 1) : (current + step + n) % n);
}

// The sidecar next to the splat (absent for most datasets)
async function loadCameras() {
    camerasPath = camerasPathFor(entry.value.path);
    try {
        const { cameras: list, orientation } = parseCamerasFile(await dataset.value.getFileContents(camerasPath));
        cameras.value = list;
        if (orientation.flipped !== undefined) flipped.value = orientation.flipped;
        if (orientation.tiltRoll !== undefined) tiltRoll.value = orientation.tiltRoll;
        if (orientation.tiltPitch !== undefined) tiltPitch.value = orientation.tiltPitch;
    } catch {
        cameras.value = [];
    }
}

function addCurrentCamera() {
    cameras.value.push(cameraFromRig(rig, `Camera ${cameras.value.length + 1}`));
    camerasDirty.value = true;
    activeCameraIndex.value = cameras.value.length - 1;
}

function updateCameraToCurrent(index) {
    const c = cameras.value[index];
    if (!c) return;
    const { position, quaternion, fov, target } = cameraFromRig(rig, c.name);
    Object.assign(c, { position, quaternion, fov, target });
    camerasDirty.value = true;
    activeCameraIndex.value = index;
}

function deleteCamera(index) {
    if (index < 0 || index >= cameras.value.length) return;
    cameras.value.splice(index, 1);
    camerasDirty.value = true;
    activeCameraIndex.value = activeAfterDelete(activeCameraIndex.value, index);
}

function moveCamera({ index, dir }) {
    const dest = index + dir;
    const list = cameras.value;
    if (index < 0 || index >= list.length || dest < 0 || dest >= list.length) return;
    list.splice(dest, 0, list.splice(index, 1)[0]);
    camerasDirty.value = true;
    activeCameraIndex.value = activeAfterMove(activeCameraIndex.value, index, dest);
}

function renameCamera({ index, name }) {
    const c = cameras.value[index];
    if (!c) return;
    c.name = name;
    camerasDirty.value = true;
}

async function saveCameras() {
    if (!canWrite.value) {
        error.value = "You don't have permission to save camera views in this dataset.";
        return;
    }
    try {
        await dataset.value.writeObj(camerasPath, serializeCamerasFile(cameras.value,
            { flipped: flipped.value, tiltRoll: tiltRoll.value, tiltPitch: tiltPitch.value }));
        camerasDirty.value = false;
        notify.success({ summary: 'Camera views saved' });
    } catch (e) {
        error.value = `Failed to save camera views: ${e.message}`;
    }
}

// ---- Lifecycle --------------------------------------------------------------------------

onMounted(async () => {
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        await loadSplat();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// The render loop, the streaming, the WebGL context and the pivot marker go with the page
// (the listeners go with the component scope)
onBeforeUnmount(() => {
    if (renderer) renderer.setAnimationLoop(null);
    clearTimeout(frameTimer);
    if (resizeObserver) resizeObserver.disconnect();
    if (fly) fly.stop();
    if (earth) earth.dispose();
    if (controls) controls.dispose();
    if (splatMesh && splatMesh.dispose) splatMesh.dispose();
    if (renderer) {
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
    }
    renderer = scene = controls = splatMesh = rig = fly = earth = presentation = null;
});
</script>

<style scoped lang="scss" src="./Splat.scss"></style>

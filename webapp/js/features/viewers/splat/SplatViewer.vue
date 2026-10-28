<template>
    <ViewerShell id="splat" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading"
                 settings-title="View settings" settings-id="splat-settings">
        <template #loading>
            <LoadingSpinner label="Loading Gaussian Splat..." />
            <LoadProgress :progress="progress" />
        </template>

        <canvas ref="canvas" />
        <DialogHost :dialogs="dialogs" />

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
            <SplatSettings :up-axis="upAxis" :auto-up="autoUp" :point-scale="pointScale" :tilt-roll="tiltRoll" :tilt-pitch="tiltPitch"
                           @update:up-axis="setUpAxis" @update:point-scale="setPointScale"
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
 * calibration. The stage (renderer, Spark, loop, disposal), the camera rig, the two navigation
 * modes, the presentation and the camera sidecar are modules next to this view; the view wires
 * them to each other.
 */
import { ref, shallowRef, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import LoadProgress from '@/components/LoadProgress.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useEventListener, useListenerBag } from '@/composables/useEventListener';
import { usePreference } from '@/composables/usePreference';
import { useNotify } from '@/composables/useNotify';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import CameraManager from './CameraManager.vue';
import SplatCameraRail from './SplatCameraRail.vue';
import SplatNavPad from './SplatNavPad.vue';
import SplatSettings from './SplatSettings.vue';
import { CameraRig, tiltUp } from './cameraRig';
import { FlyControls, MOVE_KEYS } from './flyControls';
import { keyAction, consumesKey } from './splatKeys';
import { createPointSize } from './pointSize';
import { createFrameRetry } from './framing';
import { upChoiceQuaternion, estimatedUp, openingUpChoice } from './upAxis';
import { viewSettingsStore, openingViewSettings, VIEW_DEFAULTS } from './viewSettings';
import { EarthControls } from './earthControls';
import { Presentation } from './presentation';
import { createSplatStage, assertWebGL2 } from './splatStage';
import { useSplatCameras } from './useSplatCameras';

defineOptions({ name: 'SplatViewer' });

const { entry, dataset, ddbURI, canWrite, loading, error, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.GAUSSIAN_SPLAT], typeLabel: 'a Gaussian Splat', title: 'Gaussian Splat'
});
const notify = useNotify();
const dialogs = useDialogs();
const listeners = useListenerBag();

const canvas = ref(null);
const loaded = ref(false);
// Fraction of the splat downloaded (null while the total is not known)
const progress = ref(null);
const showSettings = ref(false);
const showCameraManager = ref(false);
const streaming = ref(false);
// The view settings start at the defaults (most INRIA/3DGS scenes render upside down without the
// half turn of the -y axis); loadSplat sets what this device remembers for the entry, and the
// orientation saved in the sidecar replaces that. The up axis is the exception: it stays unset
// (null) until the sidecar was read, because what the sidecar says, what the device remembers
// and the up the build estimated are told apart to choose between them (openingUpChoice)
const upAxis = ref(/** @type {string | null} */ (VIEW_DEFAULTS.upAxis));
// The up the build estimated when it is confident (the "Auto" choice of the Up axis select), else null
const autoUp = shallowRef(null);
const pointScale = ref(VIEW_DEFAULTS.pointScale);
// Ground-plane calibration (degrees), saved with the cameras: levels off-gravity reconstructions
const tiltRoll = ref(VIEW_DEFAULTS.tiltRoll);
const tiltPitch = ref(VIEW_DEFAULTS.tiltPitch);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const navMode = usePreference(PREF.SPLAT_NAV_MODE, PREF_DEFAULTS[PREF.SPLAT_NAV_MODE]);
const pressed = reactive(Object.fromEntries(MOVE_KEYS.map(k => [k, false])));
const presentationMode = ref(null);
const cams = useSplatCameras({
    dataset, entry, canWrite, notify, confirm: useConfirm(dialogs), getRig: () => rig,
    orientation: { upAxis, tiltRoll, tiltPitch }
});
const { cameras, activeIndex: activeCameraIndex, dirty: camerasDirty } = cams;
const { add: addCurrentCamera, update: updateCameraToCurrent, remove: deleteCamera, move: moveCamera, rename: renameCamera, save: saveCameras } = cams;
const activeCameraName = computed(() => {
    const i = activeCameraIndex.value;
    const c = i === null ? null : cameras.value[i];
    return c ? (c.name || `Camera ${i + 1}`) : null;
});

// three.js / Spark objects: never reactive (a proxy breaks their identity checks)
let THREE = null;
let stage = null;
let splatMesh = null;
let rig = null;
let fly = null;
let earth = null;
let presentation = null;
let pointSize = null;
let bounds = null;
let lastFrameTime = 0;
let unmounted = false;
// The user moved the camera: a late framing (bounds that arrive with the first chunks) must not take it back
let userInteracted = false;

// Any dialog: the settings, the camera views, or one opened through the dialog host (a confirmation)
const dialogOpen = computed(() => showSettings.value || showCameraManager.value || dialogs.stack.value.length > 0);

// Explicit navigation stops the presentation and leaves the camera on show
function onUserInteract() {
    userInteracted = true;
    if (presentation) presentation.stop();
    activeCameraIndex.value = null;
}

// ---- Scene ------------------------------------------------------------------------------

function applyOrientation() {
    // The turn that lays the chosen axis (or the estimated up) of the splat along world up
    if (splatMesh) splatMesh.quaternion.set(...upChoiceQuaternion(upAxis.value, bounds));
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
    // The mesh stays at the origin and unit scale: the point size is in the splats, not the mesh
    splatMesh.position.set(0, 0, 0);
    rig.frame(box, splatMesh.quaternion);
    return real;
}

// A paged .rad has no bounds until its first chunks arrive: retried for ~10 s, until the user moves
const frameRetry = createFrameRetry({ frame: () => !!splatMesh && frameCamera(), userInteracted: () => userInteracted });

function renderFrame(time) {
    const now = time || performance.now();
    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 0;
    lastFrameTime = now;

    // Moving with the keys or the pad stops the presentation
    if (fly.update(dt)) onUserInteract();
    else presentation.update(dt);
    rig.updateControls(dt);

    // controls.update() looks at the target: reassert our own orientation
    const mode = presentation.mode;
    if (!mode) {
        if (navMode.value === 'earth') rig.syncYawPitch();
        else fly.look(dt);
    } else if (mode === 'orbit') {
        rig.syncYawPitch();
    }
    earth.updateMarker();
}

// three.js, OrbitControls and Spark (WebGL + WASM) only load with the viewer
async function importLibraries() {
    const [three, orbit, spark] = await Promise.all([
        import(/* webpackChunkName: "three" */ 'three'),
        import(/* webpackChunkName: "three" */ 'three/examples/jsm/controls/OrbitControls.js'),
        import(/* webpackChunkName: "spark" */ '@sparkjsdev/spark')
    ]);
    return { THREE: three, OrbitControls: orbit.OrbitControls, Spark: spark };
}

async function loadSplat() {
    assertWebGL2();
    // The build artifact must exist (the level-of-detail .rad, or the .spz of older builds): the
    // build state says why not when a direct link opens a splat that is not built (yet)
    const { default: FileAvailabilityChecker } = await import(/* webpackChunkName: "buildcheck" */ '@/libs/build/fileAvailabilityChecker');
    const availability = await FileAvailabilityChecker.check(dataset.value, entry.value, 'splat', { current: true });
    if (!availability.available) throw new Error(availability.message || `${entry.value.path} is not available in the splat viewer.`);

    const splatEntry = dataset.value.Entry(entry.value);
    // The level-of-detail .rad streams by range requests; the plain .spz is the fallback of
    // datasets built before LOD (getGsplat throws when it is absent: not called with a .rad)
    const radUrl = splatEntry.getGsplatLod();
    const spzUrl = radUrl ? null : splatEntry.getGsplat();
    streaming.value = !!radUrl;

    // What this device remembers for the entry (the sidecar, read next, takes precedence)
    const stored = viewSettingsStore.get(ddbURI.value);
    const remembered = openingViewSettings(stored);
    upAxis.value = null;
    pointScale.value = remembered.pointScale;
    tiltRoll.value = remembered.tiltRoll;
    tiltPitch.value = remembered.tiltPitch;

    // None of the three needs another
    const [boundsData, , libraries] = await Promise.all([splatEntry.getGsplatBounds(), cams.load(), importLibraries()]);
    if (unmounted) return;
    bounds = boundsData;
    autoUp.value = estimatedUp(bounds);
    // The sidecar's up (the ref, if it had one), else the user's choice on this device, else the build's estimate
    upAxis.value = openingUpChoice({ saved: upAxis.value ?? undefined, local: stored.upAxis, bounds });
    THREE = libraries.THREE;

    // The tilt is known before the controls exist: they are built on the final up (and follow setTilt)
    stage = createSplatStage({
        ...libraries, canvas: canvas.value, streaming: streaming.value, up: tiltUp(THREE, tiltRoll.value, tiltPitch.value), onFrame: renderFrame,
        onContextLost: () => notify.warn('The browser took the graphics context away. The view comes back when it gives it back.', { summary: 'Graphics' }),
        onContextRestored: () => notify.info('The graphics context is back.', { summary: 'Graphics' })
    });
    const { camera, controls } = stage;
    listeners.add(controls, 'start', onUserInteract);

    rig = new CameraRig(THREE, camera, controls);
    rig.setTilt(tiltRoll.value, tiltPitch.value);
    const hooks = mode => ({ enabled: () => navMode.value === mode && !dialogOpen.value, onInteract: onUserInteract });
    const el = canvas.value;
    fly = new FlyControls(rig, hooks('fly'));
    fly.attach(el, (t, type, fn, opts) => listeners.add(t, type, fn, opts));
    earth = new EarthControls(rig, el, stage.scene, hooks('earth'));
    earth.attach((t, type, fn, opts) => listeners.add(t, type, fn, opts));
    presentation = new Presentation(rig, {
        cameras: () => cameras.value,
        onMode: mode => { presentationMode.value = mode; },
        onCamera: index => { activeCameraIndex.value = index; }
    });

    // Paged .rad: chunks on demand by range requests; .spz: whole file, LOD built in a worker.
    // Authentication rides on the same-origin jwtToken cookie.
    pointSize = createPointSize(libraries.Spark.dyno, pointScale.value);
    const meshOptions = streaming.value ? { url: radUrl, paged: true } : { url: spzUrl, lod: true };
    const mesh = await stage.loadMesh({ ...meshOptions, objectModifier: pointSize.modifier }, fraction => { progress.value = fraction; });
    // The page was left meanwhile: the stage released everything
    if (!mesh) return;
    splatMesh = mesh;

    applyOrientation();
    // Nothing was in view while loading: a drag then did not choose a view
    userInteracted = false;
    frameRetry.start();
    loaded.value = true;
    applyNavMode();
    // A tour through the saved cameras, else a slow orbit; any navigation stops it, P resumes
    startPresentation();

    stage.start();
}

// ---- Settings ---------------------------------------------------------------------------

// A change is remembered for the entry on this device (what a user who cannot save the sidecar has)
// and marks the sidecar out of date (for one who can)
function remember(changes) {
    viewSettingsStore.set(ddbURI.value, changes);
}

function setUpAxis(value) {
    upAxis.value = value;
    applyOrientation();
    // The scene turned about its own origin: frame it again, so the view is not left beside it
    if (splatMesh) {
        presentation.stop();
        frameCamera();
    }
    camerasDirty.value = true;
    remember({ upAxis: value });
}

function setPointScale(value) {
    pointScale.value = value;
    if (pointSize) pointSize.set(value, splatMesh);
    remember({ pointScale: value });
}

// Re-levels the current view on the new scene up
function setTilt(roll, pitch) {
    tiltRoll.value = roll;
    tiltPitch.value = pitch;
    camerasDirty.value = true;
    remember({ tiltRoll: roll, tiltPitch: pitch });
    if (!rig) return;
    presentation.stop();
    rig.setTilt(roll, pitch);
    rig.applyYawPitch();
}

// Earth mode: our pointer handlers pan / orbit / zoom; fly mode: OrbitControls pans and zooms
function applyNavMode() {
    if (!stage) return;
    const earthMode = navMode.value === 'earth';
    stage.controls.enablePan = !earthMode;
    stage.controls.enableZoom = !earthMode;
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
    const action = keyAction(e, { loaded: loaded.value, dialogOpen: dialogOpen.value, cameraCount: cameras.value.length });
    if (!action) return;
    if (action.type === 'move') pressKey(action.code);
    else if (action.type === 'speed') fly.press(action.code);
    else if (action.type === 'camera') flyTo(action.index);
    else if (action.type === 'step') stepCamera(action.step);
    else startPresentation();
    if (consumesKey(action)) e.preventDefault();
}

useEventListener(window, 'keydown', onKeyDown);
useEventListener(window, 'keyup', e => releaseKey(e.code));
// Keys released outside the window never send keyup
function releaseAllKeys() {
    if (fly) fly.stop();
    MOVE_KEYS.forEach(k => { pressed[k] = false; });
}
useEventListener(window, 'blur', releaseAllKeys);
// A dialog that opens while a key is held would not see it released
watch(dialogOpen, open => { if (open) releaseAllKeys(); });

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
    userInteracted = true;
    fly.stop();
    presentation.flyTo(index);
}

function stepCamera(step) {
    const n = cameras.value.length;
    if (!n) return;
    const current = activeCameraIndex.value;
    flyTo(current === null ? (step > 0 ? 0 : n - 1) : (current + step + n) % n);
}

// ---- Lifecycle --------------------------------------------------------------------------

onMounted(async () => {
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        await loadSplat();
    } catch (e) {
        // A page that was left has nobody to tell
        if (!unmounted) error.value = e.message;
    } finally {
        loading.value = false;
        progress.value = null;
    }
});

// The render loop, the streaming, the WebGL context and the pivot marker go with the page
// (the listeners go with the component scope). A load still running finds the stage disposed
// and stops there.
onBeforeUnmount(() => {
    unmounted = true;
    frameRetry.cancel();
    if (fly) fly.stop();
    if (presentation) presentation.dispose();
    if (earth) earth.dispose();
    if (stage) stage.dispose();
    stage = splatMesh = rig = fly = earth = presentation = pointSize = null;
});
</script>

<style scoped lang="scss" src="./Splat.scss"></style>

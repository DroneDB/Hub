<template>
    <ViewerShell id="splat" v-model:error="error" v-model:settings-open="showSettings" dark :loading="loading"
                 settings-title="View settings" settings-id="splat-settings">
        <template #loading>
            <LoadingSpinner label="Loading Gaussian Splat..." />
            <LoadProgress :progress="progress" />
        </template>

        <canvas ref="canvas" />
        <!-- The labels of the measurements: HTML over the canvas, drawn by the stage -->
        <div ref="labelLayer" class="label-layer" :class="{ drawing: !!measureKind }" />
        <DialogHost :dialogs="dialogs" />

        <div class="top-right-stack">
            <div v-if="loaded && activeCameraName" class="camera-hud" title="Current camera view">
                <i class="fa-solid fa-camera" /> {{ activeCameraName }}
            </div>
            <PinCard v-if="loaded && shownPin" :pin="shownPin" :image-url="shownPinImage" :coordinates="shownPinCoordinates" :can-write="canWrite"
                     @close="activePin = null" @edit="showPins = true" />
        </div>

        <div v-if="loaded" class="top-left-stack">
            <!-- Paged .rad: level-of-detail streaming -->
            <div v-if="streaming" class="streaming-badge" title="Level-of-detail streaming: only the detail in view is downloaded">
                <i class="fa-solid fa-tower-broadcast m-0" />
            </div>
            <SplatMeasureToolbar :active-kind="measureKind" :count="measureCount" :metric="measureScale.metric"
                                 :can-set-scale="canWrite && !georeferenced" :coordinate-mode="coordToggle" @toggle-coordinates="toggleCoordinates" @measure="startMeasure" @clear="clearMeasurements"
                                 @finish="finishMeasure" @cancel="cancelMeasure" />
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
            <button class="btn-overlay" :class="{ active: showInfo }" title="About this splat and its downloads" aria-label="About this splat"
                    :aria-expanded="showInfo" @click="showInfo = !showInfo">
                <i class="fa-solid fa-circle-info" />
            </button>
            <button class="btn-overlay" title="View settings" aria-label="View settings" @click="showSettings = !showSettings">
                <i class="fa-solid fa-gear" />
            </button>
            <button class="btn-overlay" title="Manage camera views" aria-label="Manage camera views" @click="showCameraManager = !showCameraManager">
                <i class="fa-solid fa-camera" />
            </button>
            <button class="btn-overlay" title="Pins" aria-label="Pins" @click="showPins = !showPins">
                <i class="fa-solid fa-map-pin" />
            </button>
        </div>

        <SplatInfoPanel v-if="loaded && showInfo" :info="infoSource" :read-pager="readPager" :downloads="downloads"
                        @download="startDownload" @close="showInfo = false" />

        <SplatCameraRail v-if="loaded" :cameras="cameras" :active-index="activeCameraIndex" :mode="presentationMode" :can-write="canWrite"
                         :dirty="camerasDirty" :has-tour="tourAvailable" @goto="flyTo" @toggle-orbit="toggleOrbit" @toggle-tour="toggleTour" @add="addCurrentCamera"
                         @save="saveCameras" />
        <SplatNavPad v-if="loaded" :pressed="pressed" :touch="isTouch" @press="pressKey" @release="releaseKey" />

        <template #settings>
            <SplatSettings v-model:quality="qualitySetting" :up-axis="upAxis" :auto-up="autoUp" :point-scale="pointScale" :tilt-roll="tiltRoll"
                           :tilt-pitch="tiltPitch" :quality-level="qualityLevel"
                           @update:up-axis="setUpAxis" @update:point-scale="setPointScale"
                           @update:tilt-roll="v => setTilt(v, tiltPitch)" @update:tilt-pitch="v => setTilt(tiltRoll, v)"
                           @close="showSettings = false" />
        </template>

        <CameraManager v-if="showCameraManager" :cameras="cameras" :can-write="canWrite" :dirty="camerasDirty"
                       :active-index="activeCameraIndex" @goto="flyTo" @add-current="addCurrentCamera" @update-current="updateCameraToCurrent"
                       @delete="deleteCamera" @move="moveCamera" @rename="renameCamera" @save="saveCameras"
                       @close="showCameraManager = false" />
        <AnnotationManager v-if="showPins" :pins="annotations" :can-write="canWrite" :dirty="camerasDirty" :active-index="activePin"
                           @goto="selectPin" @update-view="updatePinView" @move="movePin" @delete="removePin" @rename="renamePin"
                           @edit="({ index, changes }) => editPin(index, changes)" @add="addPin" @save="saveCameras"
                           @close="showPins = false" />
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
import { PREF, PREF_DEFAULTS, prefChoice } from '@/libs/preferences';
import AnnotationManager from './AnnotationManager.vue';
import CameraManager from './CameraManager.vue';
import PinCard from './PinCard.vue';
import SplatInfoPanel from './SplatInfoPanel.vue';
import SplatCameraRail from './SplatCameraRail.vue';
import SplatMeasureToolbar from './SplatMeasureToolbar.vue';
import SplatNavPad from './SplatNavPad.vue';
import SplatSettings from './SplatSettings.vue';
import { CameraRig, framingOf, tiltUp } from './cameraRig';
import { FlyControls, MOVE_KEYS } from './flyControls';
import { keyAction, consumesKey } from './splatKeys';
import { createPointSize } from './pointSize';
import { createFrameRetry } from './framing';
import { upChoiceQuaternion, resolvedAutoUp, openingUpChoice } from './upAxis';
import { viewSettingsStore, openingViewSettings, VIEW_DEFAULTS } from './viewSettings';
import { EarthControls } from './earthControls';
import { Presentation } from './presentation';
import { createSplatStage, assertWebGL2 } from './splatStage';
import { createQualityController, describeQuality } from './qualityPresets';
import { splatDownloadsOf, splatExportOffered } from './splatDownloads';
import { useSplatDownloads } from './useSplatDownloads';
import { SplatMeasureTool } from './measureTool';
import { createPinLayer } from './pinLayer';
import { tourStops } from './sceneData';
import ScaleDialog from './ScaleDialog.vue';
import { sceneScale, distanceBetween, metersPerUnitFrom } from './measureMath';
import { COORD_MODE, createGeorefFrame, availableModes, coordinateFormatter, modeLabel, nextMode } from './georefCoords';
import { useSplatScene } from './useSplatScene';

defineOptions({ name: 'SplatViewer' });

const { entry, dataset, ddbURI, canWrite, loading, error, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.GAUSSIAN_SPLAT], typeLabel: 'a Gaussian Splat', title: 'Gaussian Splat'
});
const notify = useNotify();
const dialogs = useDialogs();
const listeners = useListenerBag();

const canvas = ref(null);
const labelLayer = ref(null);
const loaded = ref(false);
// Fraction of the splat downloaded (null while the total is not known)
const progress = ref(null);
const showSettings = ref(false);
const showCameraManager = ref(false);
const showPins = ref(false);
const showInfo = ref(false);
const streaming = ref(false);
// The view settings start at the defaults (most INRIA/3DGS scenes render upside down without the
// half turn of the -y axis); loadSplat sets what this device remembers for the entry, and the
// orientation saved in the sidecar replaces that. The up axis is the exception: it stays unset
// (null) until the sidecar was read, because what the sidecar says, what the device remembers
// and the up the build estimated are told apart to choose between them (openingUpChoice)
const upAxis = ref(/** @type {string | null} */ (VIEW_DEFAULTS.upAxis));
// The up the "Auto" choice of the Up axis select follows (the one saved with the views, else the build's
// estimate when it is confident), else null
const autoUp = shallowRef(null);
const pointScale = ref(VIEW_DEFAULTS.pointScale);
// Ground-plane calibration (degrees), saved with the cameras: levels off-gravity reconstructions
const tiltRoll = ref(VIEW_DEFAULTS.tiltRoll);
const tiltPitch = ref(VIEW_DEFAULTS.tiltPitch);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const navMode = usePreference(PREF.SPLAT_NAV_MODE, PREF_DEFAULTS[PREF.SPLAT_NAV_MODE]);
// The quality: the stored choice ('auto' or a preset; one that is not a choice is auto) and the preset in force
const qualityPref = usePreference(PREF.SPLAT_QUALITY, PREF_DEFAULTS[PREF.SPLAT_QUALITY]);
const qualitySetting = computed({
    get: () => prefChoice(PREF.SPLAT_QUALITY, qualityPref.value),
    set: value => { qualityPref.value = value; }
});
const qualityLevel = ref('high');
const pressed = reactive(Object.fromEntries(MOVE_KEYS.map(k => [k, false])));
const presentationMode = ref(null);
const views = useSplatScene({
    dataset, entry, canWrite, notify, confirm: useConfirm(dialogs), getRig: () => rig,
    orientation: { upAxis, tiltRoll, tiltPitch, autoUp }
});
const { cameras, activeIndex: activeCameraIndex, dirty: camerasDirty } = views;
const { add: addCurrentCamera, update: updateCameraToCurrent, remove: deleteCamera, move: moveCamera, rename: renameCamera, save: saveCameras } = views;
// Measurements: the kind being drawn, how many are shown, and what their values are in
const measureKind = ref(/** @type {string | null} */ (null));
const measureCount = ref(0);
// What the info popover shows besides the entry: the bounds the build wrote (shallow: only replaced)
const boundsInfo = shallowRef(null);
const georeferenced = computed(() => entry.value?.properties?.georeferenced === true);
// Where the points are on the Earth, for a splat with a georeference: shown in its CRS or in WGS84
const geoFrame = computed(() => createGeorefFrame(entry.value?.properties));
const coordMode = ref(COORD_MODE.CRS);
const coordWriter = computed(() => (geoFrame.value ? coordinateFormatter(geoFrame.value, coordMode.value) : null));
const coordToggle = computed(() => {
    const frame = geoFrame.value;
    return frame && availableModes(frame).length > 1 ? modeLabel(frame, coordMode.value) : '';
});
const measureScale = computed(() => sceneScale({ georeferenced: georeferenced.value, metersPerUnit: views.scale.value?.metersPerUnit }));
// The pins: the one on show (clicked, picked in the panel, or visited by the tour) opens its card
const { annotations, activePin } = views;
const { removePin, movePin, renamePin, editPin, updatePinView } = views;
const shownPin = computed(() => (activePin.value === null ? null : annotations.value[activePin.value] ?? null));
const shownPinCoordinates = computed(() => (shownPin.value && coordWriter.value ? coordWriter.value(shownPin.value.position) : ''));
const shownPinImage = computed(() => (shownPin.value?.image ? dataset.value.thumbUrl(shownPin.value.image, 800) : ''));
const infoSource = computed(() => ({
    entry: entry.value, bounds: boundsInfo.value, scale: measureScale.value, streaming: streaming.value,
    quality: describeQuality(qualitySetting.value, qualityLevel.value)
}));
// Spark's pager (the streaming of a paged .rad), for the popover; there is none before the stage
const readPager = () => stage?.spark.pager ?? null;
const downloads = computed(() => splatDownloadsOf(entry.value, { canExport: splatExportOffered() }));
const tourAvailable = computed(() => tourStops(cameras.value, annotations.value).length > 0);
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
let measureTool = null;
let pinLayer = null;
let quality = null;
// Drawing a measurement owns the pointer: the navigation controls stand by
let navigationSuspended = false;
let lastFrameTime = 0;
let unmounted = false;
// The user moved the camera: a late framing (bounds that arrive with the first chunks) must not take it back
let userInteracted = false;

// Any dialog: the settings, the camera views, or one opened through the dialog host (a confirmation)
const dialogOpen = computed(() => showSettings.value || showCameraManager.value || showPins.value || dialogs.stack.value.length > 0);

// Explicit navigation stops the presentation and leaves the camera on show
function onUserInteract() {
    userInteracted = true;
    if (presentation) presentation.stop();
    activeCameraIndex.value = null;
}

// ---- Scene ------------------------------------------------------------------------------

function applyOrientation() {
    if (!splatMesh) return;
    // The turn that lays the chosen axis (or the estimated up) of the splat along world up
    splatMesh.quaternion.set(...upChoiceQuaternion(upAxis.value, autoUp.value));
    // What is drawn over the splats turns with them; so does the up the measurements are made along
    stage.overlay.quaternion.copy(splatMesh.quaternion);
    if (measureTool) measureTool.refresh();
}

// The scene's up in the frame of the splat file (the world up, tilt included, turned back by the mesh)
const fileUp = () => rig.sceneUp.clone().applyQuaternion(stage.overlay.quaternion.clone().invert()).toArray();

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
    rig.frame(box, splatMesh.quaternion, framingOf({ georeferenced: georeferenced.value }));
    return real;
}

// A paged .rad has no bounds until its first chunks arrive: retried for ~10 s, until the user moves
const frameRetry = createFrameRetry({ frame: () => !!splatMesh && frameCamera(), userInteracted: () => userInteracted });

function renderFrame(time) {
    const now = time || performance.now();
    // The time the frame really took: the quality reads it as it is, the controls get it capped
    const frameMs = lastFrameTime ? now - lastFrameTime : 0;
    const dt = Math.min(frameMs / 1000, 0.1);
    lastFrameTime = now;
    if (quality) quality.frame(frameMs);

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
    const [three, orbit, labels, spark] = await Promise.all([
        import(/* webpackChunkName: "three" */ 'three'),
        import(/* webpackChunkName: "three" */ 'three/examples/jsm/controls/OrbitControls.js'),
        import(/* webpackChunkName: "three" */ 'three/examples/jsm/renderers/CSS2DRenderer.js'),
        import(/* webpackChunkName: "spark" */ '@sparkjsdev/spark')
    ]);
    return { THREE: three, OrbitControls: orbit.OrbitControls, CSS2DRenderer: labels.CSS2DRenderer, CSS2DObject: labels.CSS2DObject, Spark: spark };
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
    const [boundsData, , libraries] = await Promise.all([splatEntry.getGsplatBounds(), views.load(), importLibraries()]);
    if (unmounted) return;
    bounds = boundsData;
    boundsInfo.value = boundsData;
    autoUp.value = resolvedAutoUp(bounds, views.savedUp.value);
    // The sidecar's up (the ref, if it had one), else the user's choice on this device, else the build's estimate
    upAxis.value = openingUpChoice({ saved: upAxis.value ?? undefined, savedUp: views.savedUp.value, local: stored.upAxis, bounds });
    THREE = libraries.THREE;

    // The tilt is known before the controls exist: they are built on the final up (and follow setTilt)
    stage = createSplatStage({
        ...libraries, canvas: canvas.value, labelLayer: labelLayer.value, streaming: streaming.value, up: tiltUp(THREE, tiltRoll.value, tiltPitch.value), onFrame: renderFrame,
        onContextLost: () => notify.warn('The browser took the graphics context away. The view comes back when it gives it back.', { summary: 'Graphics' }),
        onContextRestored: () => notify.info('The graphics context is back.', { summary: 'Graphics' })
    });
    const { camera, controls } = stage;
    listeners.add(controls, 'start', onUserInteract);
    // In force before the mesh exists: it is made at the preset's detail (a low preset never loads the colour detail)
    quality = createQualityController({
        setting: qualitySetting.value, apply: preset => stage.applyQuality(preset), onLevel: level => { qualityLevel.value = level; }
    });
    quality.start();

    rig = new CameraRig(THREE, camera, controls);
    rig.setTilt(tiltRoll.value, tiltPitch.value);
    const hooks = mode => ({ enabled: () => navMode.value === mode && !dialogOpen.value && !navigationSuspended, onInteract: onUserInteract });
    const el = canvas.value;
    fly = new FlyControls(rig, hooks('fly'));
    fly.attach(el, (t, type, fn, opts) => listeners.add(t, type, fn, opts));
    earth = new EarthControls(rig, el, stage.scene, hooks('earth'));
    earth.attach((t, type, fn, opts) => listeners.add(t, type, fn, opts));
    presentation = new Presentation(rig, {
        cameras: () => cameras.value,
        stops: () => tourStops(cameras.value, annotations.value),
        onMode: mode => { presentationMode.value = mode; },
        onCamera: index => { activeCameraIndex.value = index; },
        onPin: index => { activePin.value = index; }
    });

    // Paged .rad: chunks on demand by range requests; .spz: whole file, LOD built in a worker.
    // Authentication rides on the same-origin jwtToken cookie.
    pointSize = createPointSize(libraries.Spark.dyno, pointScale.value);
    const meshOptions = streaming.value ? { url: radUrl, paged: true } : { url: spzUrl, lod: true };
    const mesh = await stage.loadMesh({ ...meshOptions, objectModifier: pointSize.modifier }, fraction => { progress.value = fraction; });
    // The page was left meanwhile: the stage released everything
    if (!mesh) return;
    splatMesh = mesh;

    measureTool = new SplatMeasureTool({
        THREE, CSS2DObject: libraries.CSS2DObject, stage, canvas: canvas.value, getUp: fileUp, getScale: () => measureScale.value, getCoordinateWriter: () => coordWriter.value,
        listen: (target, type, fn) => listeners.add(target, type, fn),
        setNavigationEnabled: enabled => { navigationSuspended = !enabled; stage.controls.enabled = enabled; },
        // Spark keeps its extra set of splats for picking only while something is being picked
        onActive: kind => { measureKind.value = kind; stage?.setPicking(kind !== null); },
        onChange: list => views.setMeasurements(list),
        onMiss: () => notify.info('No splat there: click on the scene.', { summary: 'Measure' })
    }, count => { measureCount.value = count; });
    pinLayer = createPinLayer({
        CSS2DObject: libraries.CSS2DObject, overlay: stage.overlay, listen: (target, type, fn) => listeners.add(target, type, fn), onSelect: selectPin
    });
    applyOrientation();
    measureTool.show(views.measurements.value);
    syncPins();
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
    // The up the heights and areas are measured along moved
    if (measureTool) measureTool.refresh();
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
    const valid = prefChoice(PREF.SPLAT_NAV_MODE, mode);
    if (valid !== mode) navMode.value = valid;
    else applyNavMode();
});

// A change of quality (here, in the settings or in the Preferences window) takes effect at once
watch(qualitySetting, value => { if (quality) quality.setSetting(value); });

// ---- Downloads --------------------------------------------------------------------------

const splatDownloads = useSplatDownloads(() => dataset.value);
const startDownload = download => splatDownloads.download(download, entry.value, () => dataset.value.downloadWithCheck(entry.value.path));

// ---- Measurements -----------------------------------------------------------------------

// A change of scale, or of how coordinates are written, changes the labels
watch([measureScale, coordWriter], () => { if (measureTool) measureTool.refresh(); });

function toggleCoordinates() {
    if (geoFrame.value) coordMode.value = nextMode(geoFrame.value, coordMode.value);
}

// Drawing a shape again while it is drawn ends it
function startMeasure(kind) {
    if (!measureTool) return;
    if (measureTool.activeKind === kind) {
        measureTool.cancel();
        return;
    }
    onUserInteract();
    if (kind === 'scale') setScale();
    else measureTool.measure(kind);
}

const finishMeasure = () => measureTool?.finish();
const cancelMeasure = () => measureTool?.cancel();

function clearMeasurements() {
    if (measureTool) measureTool.clear();
}

// Two points on something of a known length give the metres per unit of the scene
async function setScale() {
    const picked = await measureTool.measure('scale');
    if (!picked) return;
    const [a, b] = picked.points;
    const length = await dialogs.open(ScaleDialog, { unitsApart: distanceBetween(a, b) });
    if (length === undefined) return;
    const metersPerUnit = metersPerUnitFrom(a, b, length);
    if (metersPerUnit === null) {
        notify.warn('The two points are in the same place: pick the two ends of something you know the length of.', { summary: 'Scale' });
        return;
    }
    views.setScale(metersPerUnit);
}

// ---- Pins -------------------------------------------------------------------------------

function syncPins() {
    if (pinLayer) pinLayer.sync(annotations.value, activePin.value);
}
watch([annotations, activePin], syncPins, { deep: true });

// A click on a pin (or its row in the panel) shows it and flies to the view saved with it
function selectPin(index) {
    const pin = annotations.value[index];
    if (!pin || !presentation) return;
    userInteracted = true;
    fly.stop();
    if (pin.view) presentation.flyToView(pin.view, () => {});
    else presentation.stop();
    // After the flight started: starting it clears what was on show
    activePin.value = index;
}

// The place of a new pin is picked on the splats, then its panel opens to name it
async function addPin() {
    if (!measureTool || !canWrite.value) return;
    onUserInteract();
    const picked = await measureTool.measure('pin');
    if (!picked) return;
    views.addPin({ position: picked.points[0] });
}

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
    if (measureTool) measureTool.dispose();
    if (pinLayer) pinLayer.dispose();
    if (stage) stage.dispose();
    stage = splatMesh = rig = fly = earth = presentation = pointSize = measureTool = pinLayer = quality = null;
});
</script>

<style scoped lang="scss" src="./Splat.scss"></style>
<!-- The elements the scene draws itself (labels, dots) are not in this template: no scoping -->
<style lang="scss" src="./SplatOverlays.scss"></style>

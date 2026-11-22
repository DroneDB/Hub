<template>
    <ViewerShell id="potree" v-model:error="error" dark fullscreen-button fullscreen-corner="bottom-right" :fullscreen-key="fullscreenKeyFree"
                 :loading="loading" :load-error="loadError" loading-text="Loading point cloud...">
        <DialogHost :dialogs="dialogs" />

        <div class="potree-container" :class="{ loading, 'sidebar-open': sidebarOpen }">
            <!-- What the user does to the cloud, top left: the one MeasureToolbar of the 3D, splat and point-cloud viewers, whose
                 tools start the measures of Potree's own icons; after them, once the cloud is there, its clip volume, and once
                 there are measurements, their undo and Save -->
            <div v-if="loaded" class="tools-top">
                <MeasureToolbar :active-kind="measureKind" :show-clear="false" labelled @measure="startMeasure" @finish="finishMeasure" @cancel="cancelMeasure">
                    <template #extra>
                        <PotreeClipTools v-if="toolsViewer" :viewer="toolsViewer" @before-clip="endMeasure" />
                        <div v-if="hasMeasurements || hasSavedMeasurements" class="tool-group" role="group" aria-label="History" data-testid="measure-history">
                            <button type="button" :disabled="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="measure-undo" @click="undo">
                                <i class="fa-solid fa-rotate-left" />
                            </button>
                            <button type="button" :disabled="!canRedo" title="Redo (Ctrl+Y)" aria-label="Redo" data-testid="measure-redo" @click="redo">
                                <i class="fa-solid fa-rotate-right" />
                            </button>
                            <button type="button" class="danger" :class="{ active: deleteToolActive }" title="Delete a measurement: click it in the view"
                                    aria-label="Delete measurement tool" :aria-pressed="deleteToolActive" data-testid="measure-delete-tool" @click="toggleDeleteTool">
                                <i class="fa-solid fa-trash" />
                            </button>
                        </div>
                        <div v-if="canSave || canDeleteSaved" class="tool-group" role="group" aria-label="Saved measurements" data-testid="measure-saved">
                            <button v-if="canSave" type="button" class="primary" :disabled="savingMeasurements" title="Save the measurements in the dataset"
                                    aria-label="Save measurements" data-testid="measure-save" @click="saveMeasurements">
                                <i class="fa-solid fa-floppy-disk" />
                                <span v-if="!compact" class="tool-label">Save</span>
                            </button>
                            <OverlayMenu v-if="canDeleteSaved" label="More measurement actions" :items="SAVED_ACTIONS" @select="requestDelete()" />
                        </div>
                    </template>
                </MeasureToolbar>
            </div>

            <!-- How the cloud is shown, bottom left: the views, the colour of the points and the unit -->
            <PotreeDisplayBar v-if="toolsViewer" v-model:unit="unitPref" class="tools-bottom" :viewer="toolsViewer" :units-locked-reason="unitsLockedReason" />

            <div id="potree_sidebar_container" ref="sidebar" />
            <div id="potree_render_area" ref="container" />
        </div>
        <DeleteSavedMeasurementsDialog v-if="deleteDialogOpen" @close="onDeleteDialogClose" />
    </ViewerShell>
</template>

<script setup>
/**
 * PotreeViewer - a point cloud (COPC) in Potree 1.8 with its measuring tools (the measurements live in usePotreeMeasurements and libs/potree/*; the viewer and everything it creates belong to a PotreeSession, released on leave).
 * Its controls are two bars of one look (OverlayToolbar): what the user does to the cloud at the top left, how the cloud is shown at the bottom left.
 */
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import DeleteSavedMeasurementsDialog from '@/components/measurements/DeleteSavedMeasurementsDialog.vue';
import DialogHost from '@/components/DialogHost.vue';
import MeasureToolbar from '@/components/MeasureToolbar.vue';
import OverlayMenu from '@/components/OverlayMenu.vue';
import PotreeClipTools from './PotreeClipTools.vue';
import PotreeDisplayBar from './PotreeDisplayBar.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useDialogs } from '@/composables/useDialogs';
import { usePreference } from '@/composables/usePreference';
import { usePotreeMeasurements } from '@/composables/usePotreeMeasurements';
import { useTimerGroup } from '@/composables/useTimers';
import { useStackedLayout } from '@/composables/useStackedLayout';
import { loadResources } from '@/libs/lazy';
import { isMobile, deviceMemoryGb } from '@/libs/responsive';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { PotreeSession, pointBudgetFor } from '@/libs/potree/potreeSession';
import { POTREE_RESOURCES, versioned, fixPotreePaths } from '@/libs/potree/potreeResources';
import { labelPotreeControls } from '@/libs/potree/potreeControls';
import { attachPotreeScale } from '@/libs/potree/potreeScale';
import { PotreeMeasureGestures } from '@/libs/potree/measureGestures';
import { HUB_VERSION } from '@/libs/hubUpdateChecker';
import { cloudUnitsOf, LINEAR_UNITS } from '@/libs/map/crsProjection';
import { labelCircleRadii } from '@/libs/potree/circleRadiusLabel';
import { notify } from '@/libs/notify';
import { useRoute } from 'vue-router';
import { replaceQueryKeys } from '@/libs/routeQuery';
import { ITEM_GONE, itemFromQuery } from '@/libs/views/itemQuery';

defineOptions({ name: 'PotreeViewer' });

const { entry, dataset, canWrite, canDelete, loading, error, loadError, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.POINTCLOUD], typeLabel: 'a point cloud', title: 'Point Cloud'
});
const dialogs = useDialogs();
const m = usePotreeMeasurements({ entry, dataset, canWrite, error, dialogs });
const {
    hasMeasurements, hasSavedMeasurements, savingMeasurements, deleteDialogOpen, deleteToolActive, canUndo, canRedo,
    undo, redo, toggleDeleteTool, save: saveMeasurements, requestDelete, onDeleteDialogClose, discardMeasure
} = m;
const later = useTimerGroup();
// Shared with the map's measure control
const unitPref = usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
// On a phone (below sm) Save is its icon, as the tools beside it
const compact = useStackedLayout();
// Save makes the file the same as the view (also with nothing left in the view); deleting what was saved is seldom
// wanted and cannot be undone, so it is not a button: it is in the menu beside Save
const canSave = computed(() => (hasMeasurements.value || hasSavedMeasurements.value) && canWrite.value);
const canDeleteSaved = computed(() => hasSavedMeasurements.value && canDelete.value);
const SAVED_ACTIONS = Object.freeze([{ key: 'delete-saved', label: 'Delete saved measurements', icon: 'fa-solid fa-trash', danger: true }]);

const container = ref(null);
const sidebar = ref(null);
const loaded = ref(false);
const sidebarOpen = ref(false);
// The viewer once its point cloud is loaded: the clip volume and the display bar (views, colours, unit) need it
const toolsViewer = shallowRef(null);
// Owns the viewer and everything it creates (released on leave)
let session = new PotreeSession();
let viewer = null;
// Stops following the ratio of the screen (potreeScale)
let stopScale = () => {};
// The key F toggles fullscreen (ViewerShell), but not in fly mode, where it flies down (FirstPersonControls of Potree)
const fullscreenKeyFree = () => !viewer?.fpControls || viewer.getControls() !== viewer.fpControls;

// The measures follow the gesture rule of every measuring tool (D-027): click adds a point; double click, Enter or
// right click ends it; Escape cancels it (libs/potree/measureGestures). The toolbar shows the kind being drawn; a
// measure it has no button for (the angle, circle or azimuth of the Potree menu) is 'other': the general hint, Done
// and Cancel, with no button pressed.
let gestures = null;
// Set when the component goes away: what is still loading then is not built for a viewer that is gone
let unmounted = false;
const measureKind = ref(null);
// Drawing a measure again while it is drawn cancels it
function startMeasure(kind) {
    if (!gestures) return;
    if (gestures.activeKind === kind) gestures.cancel();
    else gestures.start(kind);
}
const finishMeasure = () => gestures?.finish({ dropShort: false });
// A measure that is drawn when another tool starts ends as a right click ends it
const endMeasure = () => gestures?.finish({ dropShort: true });
const cancelMeasure = () => gestures?.cancel();

// The units of the cloud's coordinates, from the CRS of its COPC (metres until it is loaded): a cloud in feet measures
// in feet, and Potree turns it into the unit the user chose
let cloudUnits = cloudUnitsOf(null);
// Heights in another unit than x and y (UTM in metres with NAVD88 heights in US survey feet): Potree has one unit for
// every axis, so its lengths and heights cannot be converted. Its labels then show the numbers of the coordinates with
// no unit of length, and the unit selector has nothing to do; the saved measurements are worked out per axis in metres
const mixedUnits = ref(false);
const unitsLockedReason = computed(() => (mixedUnits.value
    ? 'The heights of this cloud are in another unit than its other coordinates: lengths are not converted' : ''));
const UNCONVERTED = Object.freeze({ code: 'units', unitspermeter: 1 });
// A unit in words, plural: "US survey feet", "metres"
const unitName = unit => ({ metre: 'metres', foot: 'feet', 'US survey foot': 'US survey feet' }[unit.name] ?? unit.name);
// A unit as Potree has it: what its labels show, and how many of it make a metre
const potreeUnit = unit => ({ code: unit.symbol, unitspermeter: 1 / unit.metresPerUnit });

// Lengths in the chosen unit, for the viewer, the scene and every existing measure
function applyUnits() {
    if (!viewer) return;
    viewer.lengthUnit = cloudUnits.mixed ? UNCONVERTED : potreeUnit(cloudUnits.horizontal);
    viewer.lengthUnitDisplay = cloudUnits.mixed
        ? UNCONVERTED
        : potreeUnit(unitPref.value === 'metric' ? LINEAR_UNITS.METRE : LINEAR_UNITS.FOOT);
    viewer.scene.lengthUnit = viewer.lengthUnit;
    viewer.scene.lengthUnitDisplay = viewer.lengthUnitDisplay;
    for (const measure of viewer.scene.measurements || []) {
        measure.lengthUnit = viewer.lengthUnit;
        measure.lengthUnitDisplay = viewer.lengthUnitDisplay;
        measure.update();
    }
    [...(viewer.scene.profiles || []), ...(viewer.scene.volumes || [])].forEach(item => { if (item.update) item.update(); });
}
watch(unitPref, applyUnits);

// Scale, offset, bounds and WKT from the COPC header the point cloud was read with (copc.js, kept by its geometry)
function coordinateSystemOf(copc) {
    const header = copc?.header || {};
    const cube = copc?.info?.cube;
    return {
        srs: copc?.wkt || null,
        scale: header.scale ? [...header.scale.slice(0, 3)] : [1, 1, 1],
        offset: header.offset ? [...header.offset.slice(0, 3)] : [0, 0, 0],
        bounds: cube ? { minx: cube[0], miny: cube[1], minz: cube[2], maxx: cube[3], maxy: cube[4], maxz: cube[5] } : null
    };
}

async function addPointCloud(ddbEntry) {
    let copcUrl;
    try {
        copcUrl = ddbEntry.getCopc();
    } catch (e) {
        throw new Error(`${ddbEntry.path} is being processed.\n\nReturn to the file list to check the status or try again in a few minutes.`, { cause: e });
    }
    return new Promise((resolve, reject) => {
        Potree.loadPointCloud(copcUrl, ddb.pathutils.basename(ddbEntry.path), e => {
            if (unmounted) {
                resolve();
                return;
            }
            if (e.type === 'loading_failed') {
                reject(new Error(`Unable to load ${ddbEntry.path}.\n\nThe file may still be processing. Return to the file list to check the build status, or try again in a few minutes.`));
                return;
            }
            viewer.scene.addPointCloud(e.pointcloud);
            // Sizes in CSS px (the vendored renderer draws them in buffer pixels): an adaptive size of 1 closes the surface at
            // any screen resolution, and no point is smaller than 2 px (FR-VWR-36). The Appearance menu changes them in CSS px
            const material = e.pointcloud.material;
            material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
            material.size = 1;
            material.minSize = 2;
            resolve(coordinateSystemOf(e.pointcloud.pcoGeometry?.copc));
        });
    });
}

// The annotation the address asked for (`?item=<id>`, the link of a report item): framed once the measurements are in the
// viewer, or told that it no longer exists. Read once, and taken off the address
const wantedItem = itemFromQuery(useRoute()?.query);
if (wantedItem) replaceQueryKeys({ item: null });
function showRequestedItem() {
    if (wantedItem && !m.focusItem(wantedItem)) notify.warn(ITEM_GONE, { summary: 'Item not found' });
}

async function loadViewer() {
    // A previous viewer of this component is released completely first
    stopScale();
    session.dispose();
    session = new PotreeSession();
    toolsViewer.value = null;
    cloudUnits = cloudUnitsOf(null);
    mixedUnits.value = false;
    viewer = session.create(() => new Potree.Viewer(container.value), [container.value, sidebar.value]);
    // The canvas, the points and the labels are drawn at the applied ratio of the screen (FR-XC-32)
    stopScale = attachPotreeScale(viewer, session);
    // At once: a measure that the Potree menu starts while the cloud still loads is followed too. A measure that is
    // dropped leaves without a step of the history; before the measurements are attached there is no history yet
    const potree = viewer;
    const discard = measure => {
        discardMeasure(measure);
        if (potree.scene.measurements.includes(measure)) potree.scene.removeMeasurement(measure);
    };
    gestures = new PotreeMeasureGestures({ viewer, session, onActive: kind => { measureKind.value = kind; }, discard, later });

    // The layout of the open menu (beside the view, or over it on phones) is the stylesheet's
    viewer.toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value; };
    viewer.setEDLEnabled(false);
    viewer.setFOV(60);
    viewer.setPointBudget(pointBudgetFor(deviceMemoryGb(), isMobile()));
    // High-quality splats on desktop, standard on phones
    viewer.useHQ = !isMobile();
    applyUnits();

    viewer.loadGUI(() => {
        viewer.setLanguage('en');
        $('#menu_tools').next().show();
        labelPotreeControls(container.value, session);
        m.onGuiLoaded($);
    });

    viewer.scene.scene.add(new THREE.AmbientLight(0x404040, 2.0));
    viewer.scene.scene.add(new THREE.DirectionalLight(0xcccccc, 0.5));
    const top = new THREE.DirectionalLight(0xcccccc, 0.5);
    top.position.z = 99999999999;
    viewer.scene.scene.add(top);
    loaded.value = true;

    const coordinateSystem = await addPointCloud(dataset.value.Entry(entry.value));
    if (unmounted) return;
    cloudUnits = cloudUnitsOf(coordinateSystem?.srs);
    mixedUnits.value = cloudUnits.mixed;
    applyUnits();
    if (cloudUnits.mixed) {
        notify.warn(`The heights of this point cloud are in ${unitName(cloudUnits.vertical)} and its other coordinates in `
            + `${unitName(cloudUnits.horizontal)}. This viewer measures every axis in one unit, so its labels show the numbers `
            + 'of the coordinates, not metres or feet. Saved measurements have their lengths in metres.', { summary: 'Mixed units', life: 'long' });
    }
    toolsViewer.value = viewer;
    m.attach(viewer, session, coordinateSystem);
    viewer.fitToScreen();
    await m.load();
    if (unmounted) return;
    showRequestedItem();
    window.viewer = viewer;
}

onMounted(async () => {
    if (!await entryLoaded || unmounted) return;
    loading.value = true;
    try {
        // One request wave: the files download in parallel, the scripts run in order
        await loadResources(versioned(POTREE_RESOURCES, HUB_VERSION));
        if (unmounted) return;
        fixPotreePaths(window.Potree, window.location.origin);
        labelCircleRadii(window.Potree);
        await loadViewer();
    } catch (e) {
        if (!unmounted) error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// Everything the viewer created goes with it: listeners, render loop, WebGL context,
// the jQuery UI sidebar, window.viewer
onBeforeUnmount(() => {
    unmounted = true;
    toolsViewer.value = null;
    stopScale();
    stopScale = () => {};
    session.dispose();
    if (window.viewer === viewer) delete window.viewer;
    viewer = gestures = null;
});
</script>

<style lang="scss" src="./PotreeViewer.scss"></style>

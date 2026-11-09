<template>
    <ViewerShell id="potree" v-model:error="error" dark :loading="loading" :load-error="loadError" loading-text="Loading point cloud...">
        <DialogHost :dialogs="dialogs" />

        <div class="potree-container" :class="{ loading, 'sidebar-open': sidebarOpen }">
            <div v-if="loaded" class="top-left-column">
                <div class="top-left-toolbar">
                    <div v-if="hasMeasurements || hasSavedMeasurements" class="undo-redo-toolbar">
                        <button :disabled="!canUndo" class="btn-undo-redo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo">
                            <i class="fa-solid fa-rotate-left" />
                        </button>
                        <button :disabled="!canRedo" class="btn-undo-redo" title="Redo (Ctrl+Y)" aria-label="Redo" @click="redo">
                            <i class="fa-solid fa-rotate-right" />
                        </button>
                        <button :class="{ active: deleteToolActive }" class="btn-undo-redo btn-delete-tool"
                                title="Delete measurement tool (click on measurement to delete)" aria-label="Delete measurement tool"
                                @click="toggleDeleteTool">
                            <i class="fa-solid fa-trash" />
                        </button>
                    </div>

                    <div class="unit-selector-toolbar">
                        <label for="potree-unit-select">Units:</label>
                        <select id="potree-unit-select" v-model="unitPref" aria-label="Units">
                            <option value="metric">Metric (m)</option>
                            <option value="imperial">Imperial (ft)</option>
                        </select>
                    </div>
                </div>

                <!-- The one MeasureToolbar of the 3D, splat and point-cloud viewers: the tools start the measures of Potree's own icons;
                     the clip volume, the views and the colour of the points are its extra tools, once the cloud is there -->
                <MeasureToolbar :active-kind="measureKind" :show-clear="false" labelled @measure="startMeasure" @finish="finishMeasure" @cancel="cancelMeasure">
                    <template #extra>
                        <PotreeTools v-if="toolsViewer" :viewer="toolsViewer" @before-clip="endMeasure" />
                    </template>
                </MeasureToolbar>

                <div v-if="hasMeasurements || hasSavedMeasurements" class="measurements-toolbar">
                    <button v-if="(hasMeasurements || hasSavedMeasurements) && canWrite" :disabled="savingMeasurements" class="btn-measurement"
                            title="Save measurements" @click="saveMeasurements">
                        <i class="fa-solid fa-floppy-disk" />
                        Save Measurements
                    </button>
                    <button v-if="hasSavedMeasurements && canDelete" class="btn-measurement btn-measurement--danger"
                            title="Delete the saved measurements" @click="requestDelete">
                        <i class="fa-solid fa-trash" />
                        Delete Saved
                    </button>
                </div>
            </div>

            <div id="potree_sidebar_container" ref="sidebar" />
            <div id="potree_render_area" ref="container" />
        </div>
        <DeleteSavedMeasurementsDialog v-if="deleteDialogOpen" @close="onDeleteDialogClose" />
    </ViewerShell>
</template>

<script setup>
/**
 * PotreeViewer - a point cloud (COPC) in Potree 1.8 with its measuring tools (the measurements live in usePotreeMeasurements and libs/potree/*; the viewer and everything it creates belong to a PotreeSession, released on leave).
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import DeleteSavedMeasurementsDialog from '@/components/measurements/DeleteSavedMeasurementsDialog.vue';
import DialogHost from '@/components/DialogHost.vue';
import MeasureToolbar from '@/components/MeasureToolbar.vue';
import PotreeTools from './PotreeTools.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { useDialogs } from '@/composables/useDialogs';
import { usePreference } from '@/composables/usePreference';
import { usePotreeMeasurements } from '@/composables/usePotreeMeasurements';
import { useTimerGroup } from '@/composables/useTimers';
import { loadResources } from '@/libs/lazy';
import { isMobile, deviceMemoryGb } from '@/libs/responsive';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { PotreeSession, pointBudgetFor } from '@/libs/potree/potreeSession';
import { POTREE_RESOURCES, versioned, fixPotreePaths } from '@/libs/potree/potreeResources';
import { labelPotreeControls } from '@/libs/potree/potreeControls';
import { attachPotreeScale } from '@/libs/potree/potreeScale';
import { PotreeMeasureGestures } from '@/libs/potree/measureGestures';
import { HUB_VERSION } from '@/libs/hubUpdateChecker';

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

const container = ref(null);
const sidebar = ref(null);
const loaded = ref(false);
const sidebarOpen = ref(false);
// The viewer once its point cloud is loaded: the tools of the point cloud (clip volume, views, colours) need it
const toolsViewer = shallowRef(null);
// Owns the viewer and everything it creates (released on leave)
let session = new PotreeSession();
let viewer = null;
// Stops following the ratio of the screen (potreeScale)
let stopScale = () => {};

// The measures follow the gesture rule of every measuring tool (D-027): click adds a point; double click, Enter or
// right click ends it; Escape cancels it (libs/potree/measureGestures). The toolbar shows the kind being drawn; a
// measure it has no button for (the angle, circle or azimuth of the Potree menu) is 'other': the general hint, Done
// and Cancel, with no button pressed.
let gestures = null;
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

// Lengths in the chosen unit, for the viewer, the scene and every existing measure
function applyUnits() {
    if (!viewer) return;
    viewer.setLengthUnit(unitPref.value === 'metric' ? 'm' : 'ft');
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

// Scale, offset, bounds and WKT from the COPC header (copc.js)
async function coordinateSystemOf(copcUrl) {
    try {
        const { Copc, Getter } = window.Copc;
        const copc = await Copc.create(Getter.http(copcUrl));
        const header = copc.header || {};
        const cube = (copc.info || {}).cube;
        return {
            srs: copc.wkt || null,
            scale: header.scale ? [...header.scale.slice(0, 3)] : [1, 1, 1],
            offset: header.offset ? [...header.offset.slice(0, 3)] : [0, 0, 0],
            bounds: cube ? { minx: cube[0], miny: cube[1], minz: cube[2], maxx: cube[3], maxy: cube[4], maxz: cube[5] } : null
        };
    } catch (e) {
        console.warn('Could not load coordinate system from COPC:', e);
        return { srs: null, scale: [1, 1, 1], offset: [0, 0, 0], bounds: null };
    }
}

async function addPointCloud(ddbEntry) {
    let copcUrl;
    try {
        copcUrl = ddbEntry.getCopc();
    } catch (e) {
        throw new Error(`${ddbEntry.path} is being processed.\n\nReturn to the file list to check the status or try again in a few minutes.`, { cause: e });
    }
    const coordinateSystem = await coordinateSystemOf(copcUrl);
    await new Promise((resolve, reject) => {
        Potree.loadPointCloud(copcUrl, ddb.pathutils.basename(ddbEntry.path), e => {
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
            resolve();
        });
    });
    return coordinateSystem;
}

async function loadViewer() {
    // A previous viewer of this component is released completely first
    stopScale();
    session.dispose();
    session = new PotreeSession();
    toolsViewer.value = null;
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
    toolsViewer.value = viewer;
    m.attach(viewer, session, coordinateSystem);
    viewer.fitToScreen();
    await m.load();
    window.viewer = viewer;
}

onMounted(async () => {
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        // One request wave: the files download in parallel, the scripts run in order
        await loadResources(versioned(POTREE_RESOURCES, HUB_VERSION));
        fixPotreePaths(window.Potree, window.location.origin);
        await loadViewer();
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

// Everything the viewer created goes with it: listeners, render loop, WebGL context,
// the jQuery UI sidebar, window.viewer
onBeforeUnmount(() => {
    toolsViewer.value = null;
    stopScale();
    stopScale = () => {};
    session.dispose();
    viewer = gestures = null;
});
</script>

<style lang="scss" src="./PotreeViewer.scss"></style>

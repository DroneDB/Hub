/**
 * usePotreeMeasurements - the measurements of the point-cloud viewer: count, saved file (load / save / delete), editing through the properties
 * dialogs on double click, the delete tool, and undo / redo of deletions (Ctrl+Z / Ctrl+Y).
 *
 * Like the 2D map, the viewer is a working copy of its measurements in the file: Save makes the file match the
 * viewer (also with nothing left to save), and Delete saved removes them from the file and the viewer. The map's
 * measurements in the same file are not shown and stay as they are; the file goes when nothing is left in it.
 *
 *   const m = usePotreeMeasurements({ entry, dataset, canWrite, error, dialogs });
 *   m.attach(viewer, session, coordinateSystem);   // once the viewer exists
 *   await m.load();
 */
import { ref, computed } from 'vue';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import AnnotationPropertiesDialog from '@/features/viewers/pointcloud/AnnotationPropertiesDialog.vue';
import { MeasurementStorage, MeasurementOwner, saveResultMessage } from '@/libs/map/measurementStorage';
import { exportMeasurements, importMeasurements } from '@/libs/map/potreeMeasurementConverter';
import { createUndoStack } from '@/libs/undoStack';
import { applyMeasureStyle, measureAsFeature, assignMeasureProperties } from '@/libs/potree/measureStyle';
import { snapshotMeasure, restoreMeasure, matchesSnapshot } from '@/libs/potree/measureSnapshot';
import { measureAt, annotationElement, updateNameLabel, updateAnnotationTooltip } from '@/libs/potree/measureLabels';
import { PotreeDeleteTool } from '@/libs/potree/deleteTool';
import { flash } from '@/composables/useMapAlerts';
import { useTimerGroup } from '@/composables/useTimers';

const isTyping = t => t instanceof Element && (t.closest('input, textarea, select') || t.isContentEditable);

/**
 * @param {object} ctx  refs from useViewerEntry and useDialogs
 * @param {import('vue').Ref<any>} ctx.entry
 * @param {import('vue').Ref<any>} ctx.dataset
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {import('vue').Ref<string>} ctx.error
 * @param {{ open: Function }} ctx.dialogs
 */
export function usePotreeMeasurements({ entry, dataset, canWrite, error, dialogs }) {
    const measurementCount = ref(0);
    const hasSavedMeasurements = ref(false);
    const savingMeasurements = ref(false);
    const deleteDialogOpen = ref(false);
    const deleteToolActive = ref(false);
    const canUndo = ref(false);
    const canRedo = ref(false);
    const later = useTimerGroup();
    const history = createUndoStack({ limit: 50, onChange: h => { canUndo.value = h.canUndo(); canRedo.value = h.canRedo(); } });

    // Set by attach (non-reactive: Potree objects)
    let viewer = null;
    let session = null;
    let coordinateSystem = null;
    let deleteTool = null;
    let storage = null;
    let dialog = null;

    const labelCtx = () => ({ viewer, session });
    const storageFor = () => storage || (storage = new MeasurementStorage(dataset.value, entry.value, MeasurementOwner.POINT_CLOUD));

    // What Save writes: the measures and the annotations (profiles and volumes are not saved)
    function countMeasurements() {
        const scene = viewer.scene;
        let annotations = 0;
        scene.annotations.traverse(a => { if (a && a.position) annotations++; });
        measurementCount.value = (scene.measurements || []).length + annotations;
    }

    // Takes what Save writes out of the viewer
    function clearMeasurements() {
        const scene = viewer.scene;
        [...(scene.measurements || [])].forEach(measure => scene.removeMeasurement(measure));
        scene.annotations.removeAllChildren();
        countMeasurements();
    }

    function openDialog(component, props) {
        if (dialog) dialog.close();
        dialog = dialogs.open(component, { ...props, onClose: () => { dialog = null; } });
    }

    function editMeasure(measure) {
        openDialog(MeasurementPropertiesDialog, {
            feature: measureAsFeature(measure),
            geometryType: measure.showArea && measure.closed ? 'Polygon' : 'LineString',
            onSave: properties => {
                assignMeasureProperties(measure, properties);
                applyMeasureStyle(measure);
                updateNameLabel(measure, labelCtx());
            }
        });
    }

    function editAnnotation(annotation) {
        openDialog(AnnotationPropertiesDialog, {
            annotation,
            showDelete: true,
            onSave: properties => {
                if (properties.name !== undefined) annotation.title = properties.name;
                if (properties.description !== undefined) annotation.description = properties.description;
                updateAnnotationTooltip(annotation, labelCtx());
            },
            onDelete: () => {
                viewer.scene.annotations.remove(annotation);
                countMeasurements();
            }
        });
    }

    // Double click on an annotation's title edits it
    function listenToAnnotation(annotation) {
        const el = annotation && annotation.position && annotationElement(annotation);
        if (!el) return;
        const title = el.querySelector('.annotation-titlebar') || el.querySelector('[id$="-titlebar"]') || el;
        if (annotation._editHandler) session.untrack(title, 'dblclick', annotation._editHandler);
        annotation._editHandler = event => {
            event.stopPropagation();
            event.preventDefault();
            editAnnotation(annotation);
        };
        session.track(title, 'dblclick', annotation._editHandler);
    }

    // A deletion goes through the history, so Ctrl+Z brings the measure back
    function deleteMeasure(measure) {
        history.push(snapshotMeasure(measure));
        viewer.scene.removeMeasurement(measure);
        flash('Measurement deleted (Ctrl+Z to undo)', 'warning');
    }

    function undo() {
        const data = history.undo();
        if (!data) return;
        viewer.scene.addMeasurement(restoreMeasure(data));
        flash('Measurement restored');
    }

    function redo() {
        const data = history.redo();
        if (!data) return;
        const measure = (viewer.scene.measurements || []).find(m => matchesSnapshot(m, data));
        if (!measure) return;
        viewer.scene.removeMeasurement(measure);
        flash('Measurement deleted');
    }

    /**
     * Wires the measurements to a new viewer (its listeners belong to `potreeSession`).
     * @param {any} potreeViewer
     * @param {import('@/libs/potree/potreeSession').PotreeSession} potreeSession
     * @param {any} crs  the point cloud's coordinate system (for the GeoJSON file)
     */
    function attach(potreeViewer, potreeSession, crs) {
        viewer = potreeViewer;
        session = potreeSession;
        coordinateSystem = crs;
        const scene = viewer.scene;

        ['measurement_added', 'measurement_removed']
            .forEach(type => session.track(scene, type, countMeasurements));
        session.track(scene.annotations, 'annotation_added', e => {
            countMeasurements();
            listenToAnnotation(e.annotation);
        });
        scene.annotations.traverse(listenToAnnotation);
        countMeasurements();

        // Double click on a finished measure edits it (while drawing, it ends the measure)
        session.track(viewer.renderer.domElement, 'dblclick', event => {
            if (viewer.measuringTool && viewer.measuringTool.activeMeasurement) return;
            const measure = measureAt(viewer, event);
            if (measure) editMeasure(measure);
        });

        session.track(document, 'keydown', event => {
            if (!(event.ctrlKey || event.metaKey) || isTyping(event.target)) return;
            const key = event.key.toLowerCase();
            if (key === 'z') { event.preventDefault(); undo(); }
            else if (key === 'y') { event.preventDefault(); redo(); }
        });

        deleteTool = new PotreeDeleteTool({ viewer, session, onDelete: deleteMeasure, onChange: active => { deleteToolActive.value = active; } });
    }

    /** Potree's GUI is ready: the delete tool joins its toolbar. */
    function onGuiLoaded($) {
        if (deleteTool) deleteTool.addToolbarButton($);
    }

    function toggleDeleteTool() {
        if (deleteTool) deleteTool.toggle();
    }

    async function load() {
        try {
            const geojson = await storageFor().load();
            if (!geojson) return;
            const count = geojson.features.length;
            const imported = importMeasurements(geojson, viewer, coordinateSystem) || [];
            // Potree builds the measure geometry asynchronously
            later(() => imported.forEach(item => {
                if (item.edges) {
                    item.lengthUnit = viewer.lengthUnit;
                    item.lengthUnitDisplay = viewer.lengthUnitDisplay;
                    item.update();
                    applyMeasureStyle(item);
                    updateNameLabel(item, labelCtx());
                } else if (item.description) {
                    updateAnnotationTooltip(item, labelCtx());
                }
            }), 500);
            hasSavedMeasurements.value = true;
            flash(`${count} measurement${count > 1 ? 's' : ''} loaded`);
        } catch (e) {
            console.error('Error loading measurements:', e);
            error.value = `Could not load measurements: ${e.message}`;
        }
    }

    async function save() {
        if (!canWrite.value) {
            error.value = 'You do not have permission to save measurements in this dataset';
            return;
        }
        if (!viewer) {
            error.value = 'Viewer not ready';
            return;
        }
        error.value = '';
        const geojson = exportMeasurements(viewer, entry.value.path, coordinateSystem);
        if (!(geojson.features || []).length && !hasSavedMeasurements.value) {
            error.value = 'No measurements to save';
            return;
        }
        savingMeasurements.value = true;
        try {
            afterFileChange(await storageFor().save(geojson));
        } catch (e) {
            console.error('Error saving measurements:', e);
            error.value = `Failed to save measurements: ${e.message}`;
        } finally {
            savingMeasurements.value = false;
        }
    }

    // The file holds what the viewer shows now
    function afterFileChange(result) {
        hasSavedMeasurements.value = result.count > 0;
        flash(saveResultMessage(result));
    }

    async function onDeleteDialogClose(result) {
        deleteDialogOpen.value = false;
        if (result !== 'confirm') return;
        try {
            const result = await storageFor().deleteSaved();
            clearMeasurements();
            afterFileChange(result);
        } catch (e) {
            console.error('Error deleting measurements:', e);
            error.value = `Failed to delete measurements: ${e.message}`;
        }
    }

    return {
        measurementCount, hasMeasurements: computed(() => measurementCount.value > 0),
        hasSavedMeasurements, savingMeasurements, deleteDialogOpen, deleteToolActive, canUndo, canRedo,
        attach, onGuiLoaded, load, save, onDeleteDialogClose, undo, redo, toggleDeleteTool,
        requestDelete: () => { deleteDialogOpen.value = true; }
    };
}

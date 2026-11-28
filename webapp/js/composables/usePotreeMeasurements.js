/**
 * usePotreeMeasurements - the measurements of the point-cloud viewer: count, saved file (load / save / delete), editing through the properties
 * dialogs on double click, the delete tool, and undo / redo of additions and deletions (Ctrl+Z / Ctrl+Y).
 *
 * Like the 2D map, the viewer is a working copy of its measurements in the file: Save makes the file match the
 * viewer (also with nothing left to save), and Delete saved removes them from the file and the viewer. The map's
 * measurements in the same file are not shown and stay as they are; the file goes when nothing is left in it.
 *
 *   const m = usePotreeMeasurements({ entry, dataset, canWrite, error, dialogs });
 *   m.attach(viewer, session, coordinateSystem);   // once the viewer exists
 *   await m.load();
 */
import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import AnnotationPropertiesDialog from '@/features/viewers/pointcloud/AnnotationPropertiesDialog.vue';
import { MeasurementStorage, MeasurementOwner, saveResultMessage, notifySaveRefused, notifyRenumbered } from '@/libs/map/measurementStorage';
import { exportMeasurements, importMeasurements, ensureProperties, applyRefs, viewerRefs, PROPERTY_BAG } from '@/libs/map/potreeMeasurementConverter';
import { applyFields } from '@/libs/map/annotationIds';
import { applyPhotos, documentFeatureGeometry } from '@/libs/reports/annotationPhotos';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { unstatedMeasurementCrs } from '@/libs/build/pointCloudCrs';
import { createUndoStack } from '@/libs/undoStack';
import { applyMeasureStyle, measureAsFeature, assignMeasureProperties } from '@/libs/potree/measureStyle';
import { snapshotMeasure, restoreMeasure, matchesSnapshot } from '@/libs/potree/measureSnapshot';
import { measureAt, annotationElement, updateItemLabel, removeItemLabel, updateAnnotationTooltip, hideTooltips } from '@/libs/potree/measureLabels';
import { PotreeDeleteTool } from '@/libs/potree/deleteTool';
import { focusItem as focusViewerItem } from '@/libs/potree/itemFocus';
import { captureForReport } from '@/libs/potree/captureForReport';
import { flash } from '@/composables/useMapAlerts';
import { notify } from '@/libs/notify';
import { textToHtml } from '@/libs/sanitize';
import { inModalDialog } from '@/libs/views/modalFocus';
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
    /**
     * Typed history (FR-VWR-13). `ref` follows the measure through undo and redo (a restored measure is a new
     * object): an add undoes by removing `ref.measure` (its points are read at that moment, Potree adds the
     * measure before the user has clicked its points), a removal undoes by adding a copy of `snapshot`.
     * @type {import('@/libs/undoStack').UndoStack<{ op: 'add' | 'remove', ref: { measure: any }, snapshot: any }>}
     */
    const history = createUndoStack({ limit: 50, onChange: h => { canUndo.value = h.canUndo(); canRedo.value = h.canRedo(); } });

    // The viewer is gone with its component: a Reload notice that comes later does nothing
    let alive = true;
    if (getCurrentScope()) onScopeDispose(() => { alive = false; });

    // Set by attach (non-reactive: Potree objects)
    let viewer = null;
    let session = null;
    let coordinateSystem = null;
    let deleteTool = null;
    let storage = null;
    let dialog = null;
    // The organization's categories, severities and statuses for the dialogs (the default ones until they are read)
    let annotationSchema = DEFAULT_SCHEMA;
    // The measure of a history entry, whichever object stands for it now
    const refs = new WeakMap();
    // Undo, redo, load and clear change the scene themselves: their events are not history
    let replaying = 0;
    const replay = fn => {
        replaying++;
        try { return fn(); } finally { replaying--; }
    };

    // The labels name the category and the severity of an item from the organization's schema
    const labelCtx = () => ({ viewer, session, schema: () => annotationSchema });
    // The file's migration needs the CRS of the cloud's coordinates when the file states none: the COPC's when it was
    // written, which is the file's for a COPC built since in another CRS
    const storageFor = () => storage
        || (storage = new MeasurementStorage(dataset.value, entry.value, MeasurementOwner.POINT_CLOUD,
            { pointCloudCrs: unstatedMeasurementCrs(entry.value, coordinateSystem) }));

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
        replay(() => [...(scene.measurements || [])].forEach(measure => scene.removeMeasurement(measure)));
        scene.annotations.removeAllChildren();
        // What the history refers to is gone
        history.clear();
        countMeasurements();
    }

    // What the properties dialogs of a measure or an annotation need to offer its fields: the schema, and whether a
    // reference the user types is one that another annotation of the file has
    const fieldsContext = target => ({
        schema: annotationSchema,
        isRefTaken: ref => storageFor().refs.isTaken(ref, viewerRefs(viewer, target))
    });

    // What the Photos tab of the dialog of a measure or an annotation needs: the dataset, the file it is saved in (the
    // uploads go beside it), its id, photos and capture, and its WGS84 geometry as the save would write it (none for a cloud with
    // no CRS: such an item is not sent to the coverage query)
    function photoContext(target) {
        const { id, photos, snapshot } = ensureProperties(target);
        let geometry = null;
        try {
            geometry = documentFeatureGeometry(exportMeasurements(viewer, entry.value.path, coordinateSystem), id);
        } catch (e) {
            // The photos can still be edited: only the search for the photos that cover the item is left out
            console.warn('The position of the item could not be worked out:', e);
        }
        return {
            dataset: dataset.value,
            measurementPath: storageFor().measurementPath,
            readOnly: !canWrite.value,
            itemId: id,
            geometry,
            photos: photos || [],
            // The capture of the item for reports, shown above its photos
            snapshot: snapshot || null
        };
    }

    // What the "Capture for report" button of the dialog of a measure or an annotation needs, for those who can write (the
    // capture writes a file to the dataset): what runs it. The capture is the item's own: it is kept in its property bag,
    // so Save writes it to the file with the rest.
    function captureContext(target) {
        if (!canWrite.value) return null;
        return {
            run: () => captureForReport({ viewer, item: target, dataset: dataset.value, measurementPath: storageFor().measurementPath })
        };
    }

    // A modal dialog of the viewer is open (its properties, Delete saved), or the key comes from one
    const behindModal = target => !!dialog || deleteDialogOpen.value || inModalDialog(target);

    function openDialog(component, props) {
        if (dialog) dialog.close();
        hideTooltips(viewer);
        dialog = dialogs.open(component, { ...props, onClose: () => { dialog = null; } });
    }

    // A measure or an annotation made in the viewer has an id and the next ref (one that was loaded has them already)
    function identify(target) {
        if (!target || target[PROPERTY_BAG]) return;
        const properties = ensureProperties(target);
        properties.ref = storageFor().refs.issue(viewerRefs(viewer, target));
    }

    // A drawing Potree takes back: one marker, never finished
    const isUnfinished = measure => (measure.points || []).length < 2 && measure.maxMarkers > 1;

    function editMeasure(measure) {
        openDialog(MeasurementPropertiesDialog, {
            ...fieldsContext(measure),
            photoContext: photoContext(measure),
            capture: captureContext(measure),
            feature: measureAsFeature(measure),
            geometryType: measure.showArea && measure.closed ? 'Polygon' : 'LineString',
            onSave: properties => {
                assignMeasureProperties(measure, properties);
                if ('photos' in properties) applyPhotos(ensureProperties(measure), properties.photos);
                applyMeasureStyle(measure);
                updateItemLabel(measure, labelCtx());
            }
        });
    }

    function editAnnotation(annotation) {
        openDialog(AnnotationPropertiesDialog, {
            ...fieldsContext(annotation),
            photoContext: photoContext(annotation),
            capture: captureContext(annotation),
            annotation,
            showDelete: true,
            onSave: properties => {
                applyFields(ensureProperties(annotation), properties);
                if ('photos' in properties) applyPhotos(ensureProperties(annotation), properties.photos);
                // Potree keeps both as HTML: the typed text is escaped on its way in
                if (properties.name !== undefined) annotation.title = textToHtml(properties.name);
                if (properties.description !== undefined) annotation.description = textToHtml(properties.description);
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

    // The scene tells every addition and removal, the delete tool's, Potree's own remove button's and a drawing's
    function recordAdded(measure) {
        if (replaying || !measure) return;
        const ref = { measure };
        refs.set(measure, ref);
        history.push({ op: 'add', ref, snapshot: null });
    }

    function recordRemoved(measure) {
        // A drawing Potree takes back (one marker, never finished) is nothing to restore
        if (replaying || !measure || isUnfinished(measure)) return;
        const ref = refs.get(measure) || { measure };
        refs.set(measure, ref);
        history.push({ op: 'remove', ref, snapshot: snapshotMeasure(measure) });
    }

    // Potree adds a measure to the scene when its drawing starts, and the last marker follows the pointer
    // (the input handler drags its sphere) until the measure has all its markers: such a measure is not
    // there to be undone yet. Potree's measuring tool keeps no active measurement to ask instead.
    function isDrawing(measure) {
        const dragged = viewer.inputHandler && viewer.inputHandler.drag && viewer.inputHandler.drag.object;
        return !!dragged && (measure.spheres || []).includes(dragged) && (measure.points || []).length < measure.maxMarkers;
    }
    const drawingAny = () => (viewer.scene.measurements || []).some(isDrawing);

    const sceneHas = measure => !!measure && (viewer.scene.measurements || []).includes(measure);

    // A deletion goes through the scene's event, so Ctrl+Z brings the measure back
    function deleteMeasure(measure) {
        viewer.scene.removeMeasurement(measure);
        flash('Measurement deleted (Ctrl+Z to undo)', 'warning');
    }

    // A drawing the user cancelled (Escape, Cancel): removed, and not a deletion that Ctrl+Z brings back. The
    // entry of its start has no measure left, and undo goes by it
    function discardMeasure(measure) {
        if (viewer && sceneHas(measure)) replay(() => viewer.scene.removeMeasurement(measure));
    }

    // A measure built outside Potree's measuring tool (from the file or a snapshot): its units, labels and look
    function finishRestored(measure) {
        measure.lengthUnit = viewer.lengthUnit;
        measure.lengthUnitDisplay = viewer.lengthUnitDisplay;
        measure.update();
        applyMeasureStyle(measure);
        updateItemLabel(measure, labelCtx());
    }

    function addCopy(entry) {
        const measure = restoreMeasure(entry.snapshot);
        replay(() => viewer.scene.addMeasurement(measure));
        finishRestored(measure);
        entry.ref.measure = measure;
        refs.set(measure, entry.ref);
    }

    function removeOf(entry) {
        const measure = sceneHas(entry.ref.measure)
            ? entry.ref.measure
            : (viewer.scene.measurements || []).find(m => matchesSnapshot(m, entry.snapshot));
        if (!measure) return false;
        replay(() => viewer.scene.removeMeasurement(measure));
        return true;
    }

    // An entry whose measure is gone (Delete saved, a cancelled drawing) is skipped: the next one is the action
    function undo() {
        if (drawingAny()) return;
        for (let entry = history.undo(); entry; entry = history.undo()) {
            if (entry.op === 'add') {
                if (!sceneHas(entry.ref.measure)) continue;
                entry.snapshot = snapshotMeasure(entry.ref.measure);
                removeOf(entry);
                flash('Measurement removed');
            } else {
                addCopy(entry);
                flash('Measurement restored');
            }
            return;
        }
    }

    function redo() {
        if (drawingAny()) return;
        for (let entry = history.redo(); entry; entry = history.redo()) {
            if (entry.op === 'add') {
                if (!entry.snapshot) continue;
                addCopy(entry);
                flash('Measurement restored');
            } else {
                if (!removeOf(entry)) continue;
                flash('Measurement deleted');
            }
            return;
        }
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
        storage = null;
        const scene = viewer.scene;

        session.track(scene, 'measurement_added', e => {
            countMeasurements();
            if (!replaying) identify(e && e.measurement);
            recordAdded(e && e.measurement);
        });
        session.track(scene, 'measurement_removed', e => {
            countMeasurements();
            recordRemoved(e && e.measurement);
            // A measure that is gone has no label to follow the camera, nor a tooltip in the page
            if (e && e.measurement) removeItemLabel(e.measurement, labelCtx());
        });
        session.track(scene.annotations, 'annotation_added', e => {
            countMeasurements();
            if (e.annotation && e.annotation.position) identify(e.annotation);
            listenToAnnotation(e.annotation);
        });
        scene.annotations.traverse(listenToAnnotation);
        countMeasurements();

        // Double click on a finished measure (a marker or its label) edits it, and the camera stays where it is: the
        // document's capture hears it before Potree's input handler, which would fly to the point under the pointer.
        // While a measure is drawn the double click ends it (the drawing gestures handle it and mark it handled)
        const canvas = viewer.renderer.domElement;
        session.track(canvas.ownerDocument ?? document, 'dblclick', event => {
            if (event.target !== canvas || event.defaultPrevented || drawingAny()) return;
            const measure = measureAt(viewer, event);
            if (!measure) return;
            event.stopPropagation();
            event.preventDefault();
            editMeasure(measure);
        }, true);

        // Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo (Cmd for the Mac); what is behind a modal dialog is not touched
        session.track(document, 'keydown', event => {
            if (!(event.ctrlKey || event.metaKey) || isTyping(event.target) || behindModal(event.target)) return;
            const key = event.key.toLowerCase();
            if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
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

    // The message of the failed read: it goes away when a read (Reload) succeeds
    let loadErrorText = '';

    async function load() {
        // The viewer can be left (or replaced) while the file is read: what the file brings is for the viewer that asked
        const forViewer = viewer;
        const gone = () => !alive || viewer !== forViewer;
        try {
            const geojson = await storageFor().load();
            if (gone()) return;
            storageFor().annotationSchema().then(schema => {
                annotationSchema = schema;
                // The labels drawn before the schema came show its names and colours now
                if (alive && viewer) (viewer.scene.measurements || []).forEach(measure => updateItemLabel(measure, labelCtx()));
            });
            if (error.value === loadErrorText) error.value = '';
            if (!geojson) return;
            const { imported, unplaced } = replay(() => importMeasurements(geojson, viewer, coordinateSystem)) || { imported: [], unplaced: 0 };
            const count = geojson.features.length - unplaced;
            // Measurements in a coordinate system the cloud's cannot be converted from are not shown, and saves are
            // refused so that the file keeps them: the user is told now, not when a save is refused
            const current = storageFor();
            current.keepUnplaced(unplaced);
            if (unplaced) notify.warn(current.saveRefusal.message, { summary: 'Measurements not shown', life: 'long' });
            // Potree builds the measure geometry asynchronously
            later(() => imported.forEach(item => {
                if (item.edges) {
                    finishRestored(item);
                } else if (item.description) {
                    updateAnnotationTooltip(item, labelCtx());
                }
            }), 500);
            hasSavedMeasurements.value = true;
            if (count) flash(`${count} measurement${count > 1 ? 's' : ''} loaded`);
        } catch (e) {
            console.error('Error loading measurements:', e);
            if (gone()) return;
            loadErrorText = `Could not load measurements: ${e.message}`;
            error.value = loadErrorText;
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
        // The viewer does not show what the file holds (the read failed or is still going)
        const current = storageFor();
        if (notifySaveRefused(current, () => alive && storage === current, load)) return;
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
        // The file numbered what had no ref (and renumbered a new one whose ref another session had taken)
        applyRefs(viewer, result.refs);
        notifyRenumbered(result);
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

    /**
     * Frames the measure or annotation with an id (the `item` of the address).
     * @param {string} id
     * @returns {boolean} false when the viewer has none with that id
     */
    const focusItem = id => !!viewer && focusViewerItem(viewer, id);

    return {
        measurementCount, hasMeasurements: computed(() => measurementCount.value > 0),
        hasSavedMeasurements, savingMeasurements, deleteDialogOpen, deleteToolActive, canUndo, canRedo,
        attach, onGuiLoaded, load, save, onDeleteDialogClose, undo, redo, toggleDeleteTool, discardMeasure, focusItem,
        requestDelete: () => { deleteDialogOpen.value = true; }
    };
}

import { createUndoStack } from '@/libs/undoStack';
import { newId } from '@/libs/ids';
import { RefSequence, choiceLabel, isAnnotationType } from '@/libs/map/annotationIds';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { controlButton, controlGroup } from './controlButton';
import { isTypingTarget } from '@/libs/typingTarget';
import { Control } from 'ol/control';
import Overlay from 'ol/Overlay';
import Collection from 'ol/Collection';
import Modify from 'ol/interaction/Modify';
import Translate from 'ol/interaction/Translate';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { ANALYSIS_MEASUREMENT_TYPES, haloStyle } from '@/libs/map/analysisStyles';
import { Vector as VectorLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import { geodesicArea, geodesicLength } from '@/libs/map/geodesic';
import { startDrawingSession } from '@/libs/map/drawingSession';
import { LineString, Polygon, Point } from 'ol/geom';
import { toLonLat, fromLonLat } from 'ol/proj';
import { containsCoordinate, createEmpty, extend, getHeight, getWidth } from 'ol/extent';
import { exportMeasurements, importMeasurements, measurementSizeText, updateFeatureTooltip } from '@/libs/map/olMeasurementConverter';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import { showPointPopup, removeMeasureTooltip, setPointPopupShown, CALLOUTS_ON_HOVER_CLASS } from '@/libs/map/pointPopup';
import { MEASURE_COLOR, FILE_FIT_OPTIONS, POINT_FIT_MIN_RESOLUTION } from '@/libs/map/mapUtils';
import { mapFeatureGeometry } from '@/libs/reports/annotationPhotos';
import { latLonText, stockpileLabel } from '@/libs/format';
import { colorToken, tokenRgba } from '@/libs/colorScheme';
import { getPref, setPref, onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';
import {
    AREA_ICON, CALLOUTS_ICON, CLEAR_ALL_ICON, DELETE_ICON, EDIT_VERTICES_ICON, ERASE_ICON, EXPORT_CSV_ICON, EXPORT_GEOJSON_ICON, LENGTH_ICON,
    MEASUREMENT_LIST_ICON, MEASURE_ICON, POINT_ICON, REFERENCES_ICON, SAVE_ICON, STOP_ICON
} from '@/libs/glyphs';

// Cursor shown over a measurement while the eraser tool is active: an eraser,
// as the glyph of the tool is. It is a static asset (file URL, not an inline SVG
// data URL) because data-URL cursors are unreliable: some browsers fail to
// load them and others re-normalize the value on read-back, breaking any
// equality check used to detect ownership of the cursor.
const ERASE_HOVER_CURSOR = `url('${'/images/measure-erase.svg'}') 12 12, crosshair`;

// The smallest line and area that are kept: a click that draws less is a mistake, and goes
const MIN_LENGTH_METERS = 0.01; // 1 cm
const MIN_AREA_SQUARE_METERS = 0.0001; // 1 cm2

/**
 * Whether a drawn geometry is too small to be a measurement (a line of less than 1 cm, an area of less than 1 cm2).
 * @param {import('ol/geom').Geometry} geometry
 * @returns {boolean}
 */
export function isDegenerateMeasurement(geometry) {
    if (geometry instanceof LineString) return geodesicLength(geometry) < MIN_LENGTH_METERS;
    if (geometry instanceof Polygon) return geodesicArea(geometry) < MIN_AREA_SQUARE_METERS;
    return false;
}

/**
 * The label of a stockpile in the units of the map, from its stored metric properties; null for one
 * with no volume (saved before the volume was stored), which keeps its own text (as on import).
 * @param {Record<string, any>} props @param {string} unitPref
 */
const stockpileText = (props, unitPref) => (typeof props.netVolume === 'number' ? stockpileLabel(props, unitPref) : null);

/**
 * The label of a measurement that shows only while its feature is hovered (`ol-tooltip`), or null:
 * the popup of a point annotation (`ol-point-popup`) is always on show, so hovering its point
 * neither reveals nor hides it.
 * @param {any} feature
 * @returns {HTMLElement | null}
 */
function hoverLabelOf(feature) {
    const element = feature.get && feature.get('measureTooltipElement');
    return element && element.classList && element.classList.contains('ol-tooltip') ? element : null;
}

/** The name of the button that switches the callouts of the point annotations between always and on hover */
const CALLOUTS_LABEL = 'Always Show Point Callouts';

/** The button that shows or hides the reference (`ref`) of each annotation on the map */
const REFERENCES_LABEL = 'Show References';

class MeasureControls extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const unitPref = getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);

        const btnPoint = controlButton('Point Annotation', 'Click on the map to place an annotation.', POINT_ICON);
        const btnLength = controlButton('Measure Length', 'Click on the map to place points along a line. Double-click, right-click or Enter to finish. Press ESC to cancel.', LENGTH_ICON);
        const btnArea = controlButton('Measure Area', 'Click on the map to draw a polygon. Double-click, right-click or Enter to finish and calculate the area. Press ESC to cancel.', AREA_ICON);
        const btnErase = controlButton('Erase Measurement', 'Click on a measurement to delete it.', ERASE_ICON);
        const btnEdit = controlButton('Edit/Move Measurements', 'Click and drag measurement points to reposition them.', EDIT_VERTICES_ICON);
        const btnStop = controlButton('Stop Measuring', 'Cancel the current measurement (ESC)', STOP_ICON);
        btnStop.style.display = 'none'; // Hidden by default, shown when a tool is active

        // Save/Load/Clear buttons (hidden until there is something to manage)
        const btnSave = controlButton('Save Measurements', null, SAVE_ICON);
        const btnClear = controlButton('Clear All Measurements', null, CLEAR_ALL_ICON);
        const btnExport = controlButton('Export Measurements as GeoJSON', null, EXPORT_GEOJSON_ICON);
        const btnExportCsv = controlButton('Export Measurements as CSV', null, EXPORT_CSV_ICON);
        const btnDelete = controlButton('Delete Saved Measurements', null, DELETE_ICON);
        const btnList = controlButton('Measurement List', null, MEASUREMENT_LIST_ICON);
        // Pressed: the callouts of the point annotations are always shown; released: each one shows while its point is
        // hovered (or tapped). Shown while the map has a point annotation; the account keeps the choice
        const btnCallouts = controlButton(CALLOUTS_LABEL, '', CALLOUTS_ICON);
        // Pressed: the reference of each annotation is drawn next to it (on by default)
        const btnReferences = controlButton(REFERENCES_LABEL, '', REFERENCES_ICON);
        [btnSave, btnClear, btnExport, btnExportCsv, btnDelete, btnList, btnCallouts, btnReferences].forEach(btn => { btn.style.display = 'none'; });

        // The 'Measure' toggle: on a compact map (css/ol-controls.css: a phone, a small frame) it is the one button of the
        // measure tools in the rail, and the toolbars below open from it (FR-MAP-12). Elsewhere it is not shown
        const btnToggle = controlButton('Measure', 'Show the measure tools.', MEASURE_ICON);
        btnToggle.setAttribute('aria-expanded', 'false');
        const toolbarToggle = controlGroup('Measure', 'ol-measure-toggle');
        toolbarToggle.appendChild(btnToggle);

        // First toolbar: drawing tools (always visible)
        const toolbar1 = controlGroup('Measure Tools');
        toolbar1.appendChild(btnPoint);
        toolbar1.appendChild(btnLength);
        toolbar1.appendChild(btnArea);
        toolbar1.appendChild(btnErase);
        toolbar1.appendChild(btnEdit);
        toolbar1.appendChild(btnStop);

        // Second toolbar: save/manage tools (hidden until there are measurements)
        const toolbar2 = controlGroup('Manage Measurements');
        toolbar2.style.display = 'none';
        toolbar2.appendChild(btnList);
        toolbar2.appendChild(btnCallouts);
        toolbar2.appendChild(btnReferences);
        toolbar2.appendChild(btnSave);
        toolbar2.appendChild(btnClear);
        toolbar2.appendChild(btnExport);
        toolbar2.appendChild(btnExportCsv);
        toolbar2.appendChild(btnDelete);

        const element = document.createElement('div');
        element.className = 'ol-measure-control ol-unselectable';
        element.appendChild(toolbarToggle);
        element.appendChild(toolbar1);
        element.appendChild(toolbar2);

        super({
            element: element,
            target: options.target,
        });

        // lifetime: element (the control's own toolbar buttons, dropped with the control)
        btnToggle.addEventListener('click', this.handleToggle.bind(this), false);
        btnPoint.addEventListener('click', this.handlePointLocation.bind(this), false);
        btnLength.addEventListener('click', this.handleMeasureLength.bind(this), false);
        btnArea.addEventListener('click', this.handleMeasureArea.bind(this), false);
        btnErase.addEventListener('click', this.handleErase.bind(this), false);
        btnEdit.addEventListener('click', this.handleEdit.bind(this), false);
        btnStop.addEventListener('click', this.handleStop.bind(this), false);
        btnSave.addEventListener('click', this.handleSave.bind(this), false);
        btnClear.addEventListener('click', this.handleClearAll.bind(this), false);
        btnExport.addEventListener('click', this.handleExport.bind(this), false);
        btnExportCsv.addEventListener('click', () => this.onExportCsv(), false);
        btnDelete.addEventListener('click', this.handleDeleteSaved.bind(this), false);
        btnList.addEventListener('click', this.handleListOpen.bind(this), false);
        btnCallouts.addEventListener('click', () => this.setPointCallouts(!this.showPointCallouts), false);
        btnReferences.addEventListener('click', () => this.setShowReferences(!this.showReferences), false);

        this.selectedTool = null;
        // On a compact map the tools are shown from the Measure toggle (the class and the toggle's state)
        this.toolsOpen = false;
        this.btnToggle = btnToggle;
        this.onToolSelected = options.onToolSelected || (() => { });
        this.onToolDeselected = options.onToolDeselected || (() => { });
        this.canWrite = options.canWrite !== undefined ? options.canWrite : true;
        this.canDelete = options.canDelete !== undefined ? options.canDelete : true;
        this.onSave = options.onSave || (() => { });
        this.onClearAll = options.onClearAll || (() => { });
        this.onExport = options.onExport || (() => { });
        this.onExportCsv = options.onExportCsv || (() => { });
        this.onDeleteSaved = options.onDeleteSaved || (() => { });
        this.onRequestClearConfirm = options.onRequestClearConfirm || (() => { });
        this.onRequestDeleteConfirm = options.onRequestDeleteConfirm || (() => { });
        this.onListOpen = options.onListOpen || (() => { });
        // The measurement groups, offered by the properties dialog
        this.getGroups = options.getGroups || (() => []);
        // Makes a group ({ name, color }) and returns its id: the properties dialog has New group when it is given
        this.createGroup = options.createGroup || null;
        // Notified whenever a feature is removed from the measurement source
        // (eraser tool, deleteMeasurement, etc.). Consumers use this to keep
        // the deletedMeasurementIds tracking in sync so persisted features
        // (stockpiles) don't get re-hydrated from the saved GeoJSON file.
        this.onMeasurementDeleted = options.onMeasurementDeleted || (() => { });
        // Told after the user changed the geometry of a measurement: a vertex dragged or added, the feature
        // moved, a change undone (the owner measures again what depends on the geometry, a pile's volume)
        this.onFeatureModified = options.onFeatureModified || (() => { });
        // Renders a dialog inside the app (useDialogs().open) and returns its handle
        this.openDialog = options.openDialog;
        this._dialog = null;
        // The point just placed whose dialog is open: it is not kept until its dialog is saved
        this._unkeptPoint = null;

        this.source = new VectorSource();
        // A measurement that another tool made (a profile) comes without an id: it gets its id and ref when it is added.
        // One that was read from a file has its id already (measurementFormat), and a point is typed after it is added
        // (its draw end identifies it)
        // lifetime: owner (the control's own measurement source)
        this.source.on('addfeature', evt => {
            if (evt.feature && evt.feature.get('measurementType') && !evt.feature.get('id')) this.identify(evt.feature);
        });
        // lifetime: owner (the control's own measurement source)
        this.source.on('removefeature', (evt) => {
            try { this.onMeasurementDeleted(evt.feature); } catch { /* noop */ }
        });
        this.vector = new VectorLayer({
            source: this.source,
            style: (feature) => this.createFeatureStyle(feature),
        });

        // The references of the annotations are drawn on the map unless the user turns them off
        this.showReferences = true;
        this.btnReferences = btnReferences;
        this._syncReferencesButton();
        // The categories, severities and statuses of the properties dialog (the organization's: setAnnotationSchema)
        this.annotationSchema = DEFAULT_SCHEMA;
        // The refs this control issues: the storage's when the host gives it (it knows the file), else its own
        this.getRefSequence = options.getRefSequence || (() => null);
        // What the Photos tab of the properties dialog needs of the host: { dataset, measurementPath, readOnly }, or null
        // for a host that has no photos to offer
        this.getPhotoHost = options.getPhotoHost || (() => null);
        this._ownRefs = new RefSequence();

        this.unitPref = unitPref;
        this.btnCallouts = btnCallouts;
        this.showPointCallouts = getPref(PREF.SHOW_POINT_CALLOUTS, PREF_DEFAULTS[PREF.SHOW_POINT_CALLOUTS]);
        this._syncCalloutsButton();

        // Store button references
        this.btnStop = btnStop;
        this.btnEdit = btnEdit;
        this.btnSave = btnSave;
        this.btnClear = btnClear;
        this.btnExport = btnExport;
        this.btnExportCsv = btnExportCsv;
        this.btnDelete = btnDelete;
        this.btnList = btnList;
        this.btnPoint = btnPoint;
        this.btnLength = btnLength;
        this.btnArea = btnArea;
        this.btnErase = btnErase;
        this.toolbar2 = toolbar2;

        // Reentrant counter for setToolsDisabled() so multiple panels (e.g.
        // raster profile + stockpile drawing) can suspend the toolbar at the
        // same time without one releasing it for the other.
        this._disableLockCount = 0;

        // Store keyboard listener reference (the edit mode's; a drawing tool has its session)
        this.keyboardListener = null;

        // The drawing session of the tool that is selected (libs/map/drawingSession), null with none
        this.session = null;

        // Edit mode interactions
        this.modifyInteraction = null;
        this.translateInteraction = null;
        this.isEditMode = false;
        // Told when edit mode ends, whoever ends it (a panel that started it for one feature shows its own state)
        this._onEditModeExit = null;

        // Dialog instance reference
        this.propertiesDialog = null;
        this.dblClickListener = null;
        this.changeFeatureListener = null;
        this.doubleClickZoomInteraction = null;

        // Geometry modifications, undone with Ctrl+Z while editing
        this.undoStack = createUndoStack({ limit: 50 });

        // Whether the measurements file exists (set by the owner after a load, save or delete)
        this.hasSaved = false;
        // The measurements as last loaded or saved, to tell unsaved changes (isDirty): none yet
        this._savedSnapshot = '[]';
        // The features of the file that the map cannot draw or write back (a point with no type, a multi-polygon):
        // a Save writes them as they were read (importMeasurements)
        this.carried = [];
    }

    /**
     * Override setMap to initialize button visibility when control is added
     */
    setMap(map) {
        // The tool in use and edit mode end with the map, and both need it to take their interactions and keys away
        if (!map) {
            this.deselectCurrent();
            if (this.isEditMode) this.disableEditMode();
        }
        // The map the control leaves shows its point popups as it did before the control
        const previous = this.getMap();
        if (previous && previous !== map) previous.getViewport().classList.remove(CALLOUTS_ON_HOVER_CLASS);
        super.setMap(map);

        // The unit follows the Preferences page, other tabs and the account while on a map
        if (this._unsubscribeUnitPref) {
            this._unsubscribeUnitPref();
            this._unsubscribeUnitPref = null;
        }

        // Initialize button visibility when control is added to map
        if (map) {
            this._unsubscribeUnitPref = onPrefChange(key => {
                if (key === PREF.SHOW_POINT_CALLOUTS) {
                    this.showCallouts(getPref(PREF.SHOW_POINT_CALLOUTS, PREF_DEFAULTS[PREF.SHOW_POINT_CALLOUTS]));
                    return;
                }
                if (key !== PREF.MEASURE_UNIT) return;
                const unit = getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
                if (unit !== this.unitPref) this.showUnit(unit);
            });
            this.showCallouts(getPref(PREF.SHOW_POINT_CALLOUTS, PREF_DEFAULTS[PREF.SHOW_POINT_CALLOUTS]));
            this.refreshButtons();
            // Detail dialog: outside edit mode, double-clicking on a measurement
            // opens the properties dialog with a Delete button. We only act on
            // hits against our own vector layer; misses fall through so the
            // native DoubleClickZoom interaction still zooms the map.
            this._detailDblClickKey = map.on('dblclick', (evt) => {
                if (this.isEditMode || this.selectedTool) return;
                const feature = this._measurementAt(map, evt.pixel);
                if (feature) {
                    evt.stopPropagation();
                    if (evt.preventDefault) evt.preventDefault();
                    this.openPropertiesDialog(feature);
                    return true;
                }
            });

            // Hover highlight: visually flag the measurement under the cursor
            // (the same one that a double-click would target) and switch the
            // pointer to a context-appropriate cursor. Allowed in two modes:
            //   - no tool selected -> hand cursor ("open in detail dialog")
            //   - eraser tool active -> trash cursor ("click to delete")
            // Drawing tools (point/length/area) manage their own crosshair
            // and would fight this handler, so we skip those.
            this._hoverPointerKey = map.on('pointermove', (evt) => {
                if (evt.dragging || this.isEditMode) return;
                const tool = this.selectedTool;
                if (tool && tool !== 'erase') return;
                // The pointer on the callout of a point hovers that point, not what is under the callout: the map
                // still gets the moves over a popup (and the moves of a drag of its handle), and the buttons of a
                // callout shown on hover are reached by moving from the point onto it
                const callout = this._calloutPointAt(evt.originalEvent && evt.originalEvent.target);
                if (callout) {
                    this._setHoveredFeature(callout);
                    return;
                }
                const hit = this._measurementAt(map, evt.pixel);
                this._setHoveredFeature(hit);
                const target = map.getTargetElement();
                if (!target) return;
                // Cursor ownership: we only manage the cursor when nothing
                // external has overridden it since our last write. Tracking a
                // single "last value we set" instance flag is more robust
                // than an allow-list of expected strings, because browsers
                // may re-normalize complex values (notably url() cursors)
                // when reading them back from `style.cursor`.
                const lastManaged = this._currentManagedCursor;
                if (lastManaged !== undefined && target.style.cursor !== lastManaged) {
                    // Someone else (e.g. raster Inspect tool) owns the cursor now.
                    return;
                }
                const next = tool === 'erase'
                    ? (hit ? ERASE_HOVER_CURSOR : 'crosshair')
                    : (hit ? 'pointer' : '');
                target.style.cursor = next;
                this._currentManagedCursor = next;
            });
            // A touch screen has no hover: a tap on a measurement is the hover (it shows the callout of a point while
            // callouts show on hover), and a tap elsewhere ends it
            this._tapKey = map.on('singleclick', (evt) => {
                if (this.isEditMode || this.selectedTool) return;
                this._setHoveredFeature(this._measurementAt(map, evt.pixel));
            });
        } else {
            if (this._detailDblClickKey) {
                try { unByKey(this._detailDblClickKey); } catch { /* noop */ }
                this._detailDblClickKey = null;
            }
            if (this._hoverPointerKey) {
                try { unByKey(this._hoverPointerKey); } catch { /* noop */ }
                this._hoverPointerKey = null;
            }
            if (this._tapKey) {
                unByKey(this._tapKey);
                this._tapKey = null;
            }
            this._setHoveredFeature(null);
        }
    }

    /**
     * Update the currently-hovered measurement feature so the style function
     * picks up the highlighted look. The hover flag lives on the JS instance
     * (not as a feature property) to avoid leaking into persisted GeoJSON.
     */
    _setHoveredFeature(feature) {
        if (this._hoveredFeature === feature) return;
        const previous = this._hoveredFeature;
        this._hoveredFeature = feature || null;
        if (previous) {
            previous._hovered = false;
            try { previous.changed(); } catch { /* noop */ }
            // Re-hide the persistent tooltip label that was revealed on hover.
            const prevTip = hoverLabelOf(previous);
            if (prevTip) prevTip.classList.add('ol-tooltip-hidden');
            setPointPopupShown(this.getMap(), previous, false);
        }
        if (feature) {
            feature._hovered = true;
            try { feature.changed(); } catch { /* noop */ }
            // Reveal the persistent tooltip label only for the hovered feature.
            const tip = hoverLabelOf(feature);
            if (tip) tip.classList.remove('ol-tooltip-hidden');
            setPointPopupShown(this.getMap(), feature, true);
        }
    }

    /**
     * Suspend / resume the measurement toolbar while an external tool (e.g.
     * raster profile drawing or stockpile polygon drawing) is active.
     *
     * Uses a reentrant lock counter so multiple panels can request the
     * toolbar to be disabled concurrently and only the last release actually
     * re-enables it. On the first lock we also deselect the active tool and
     * leave edit mode so the user can't draw two things at once.
     *
     * @param {boolean} disabled
     */
    setToolsDisabled(disabled) {
        if (disabled) {
            this._disableLockCount++;
            if (this._disableLockCount > 1) return; // already suspended
            try { this.deselectCurrent && this.deselectCurrent(); } catch { /* noop */ }
            try { if (this.isEditMode && this.disableEditMode) this.disableEditMode(); } catch { /* noop */ }
        } else {
            if (this._disableLockCount === 0) return;
            this._disableLockCount--;
            if (this._disableLockCount > 0) return; // still held by another caller
        }
        const buttons = [this.btnPoint, this.btnLength, this.btnArea, this.btnErase, this.btnEdit];
        const isOff = this._disableLockCount === 0;
        buttons.forEach(btn => {
            if (!btn) return;
            btn.disabled = !isOff;
            btn.style.opacity = isOff ? '' : '0.4';
            btn.style.cursor = isOff ? '' : 'not-allowed';
        });
    }

    handlePointLocation() {
        this.onSelect('point');
    }

    handleMeasureLength() {
        this.onSelect('length');
    }

    handleMeasureArea() {
        this.onSelect('area');
    }

    handleErase() {
        this.onSelect('erase');
    }

    handleEdit() {
        this.toggleEditMode();
    }

    /** Stop Measuring: the measurement in progress is cancelled (nothing is added) and the tool is deselected. */
    handleStop() {
        this.deselectCurrent();
    }

    /**
     * Apply units change - update preference and recalculate all measurement tooltips
     * @param {string} newUnit - The new unit preference ('metric' or 'imperial')
     */
    applyUnitsChange(newUnit) {
        this.showUnit(newUnit);
        setPref(PREF.MEASURE_UNIT, newUnit);
    }

    /**
     * Show the measurements in a unit, without storing it (it is already stored, or about to be)
     * @param {string} unit - 'metric' or 'imperial'
     */
    showUnit(unit) {
        this.unitPref = unit;

        // Recalculate all existing measurement tooltips
        const features = this.source.getFeatures();
        features.forEach(feature => {
            this.updateMeasurementValue(feature);
        });
    }

    /**
     * Get the count of measurements
     * @returns {number} Number of measurements
     */
    getMeasurementsCount() {
        return this.source.getFeatures().length;
    }

    handleSave() {
        this.onSave();
    }

    handleClearAll() {
        this.onRequestClearConfirm();
    }

    handleExport() {
        this.onExport();
    }

    handleDeleteSaved() {
        this.onRequestDeleteConfirm();
    }

    /**
     * Confirm and execute clear all measurements (called after user confirmation)
     */
    confirmClearAll() {
        // What the map cannot draw is not on it to be cleared: it stays in the file as it is
        this._clearMeasurements();
        this.onClearAll();
    }

    /**
     * Confirm and execute delete saved measurements (called after user confirmation)
     */
    confirmDeleteSaved() {
        this.onDeleteSaved();
    }

    /** Records whether the measurements file exists and updates the buttons. */
    setSavedState(hasSaved) {
        this.hasSaved = !!hasSaved;
        this.refreshButtons();
    }

    /**
     * Shows the management buttons that apply. Save makes the file match the map, so it
     * stays while a saved file exists even with nothing on the map (that save removes it).
     */
    refreshButtons() {
        const hasMeasurements = this.hasMeasurements();
        const show = on => (on ? 'block' : 'none');
        this.toolbar2.style.display = show(hasMeasurements || this.hasSaved);
        this.btnList.style.display = show(hasMeasurements);
        this.btnCallouts.style.display = show(this.source.getFeatures().some(f => f.get('measurementType') === 'point'));
        this.btnReferences.style.display = show(hasMeasurements);
        this.btnSave.style.display = show((hasMeasurements || this.hasSaved) && this.canWrite);
        this.btnClear.style.display = show(hasMeasurements);
        this.btnExport.style.display = show(hasMeasurements);
        this.btnExportCsv.style.display = show(hasMeasurements);
        this.btnDelete.style.display = show(this.hasSaved && this.canDelete);
    }

    /**
     * The measurements as they would be saved, without the times that an export may fill in.
     * @param {Set<ol.Feature>|null} [only]  only these features (the ones a read gave: what the file holds)
     */
    snapshot(only = null) {
        const { features } = exportMeasurements(this.source, '', this.unitPref, [], only);
        return JSON.stringify(features.map(f => {
            const properties = { ...f.properties };
            delete properties.createdAt;
            return { ...f, properties };
        }));
    }

    /**
     * Takes the measurements on the map as the saved ones (after a load or a save), or the given snapshot when the map
     * changed since the file was made from it (a measurement edited while a save was going: it is not in the file and
     * stays unsaved).
     * @param {string} [saved]  what the file holds, as `snapshot` gave it; the measurements on the map now when omitted
     */
    markSaved(saved = this.snapshot()) {
        this._savedSnapshot = saved;
    }

    /** Whether the map has changes that are not in the file. */
    isDirty() {
        return this.snapshot() !== this._savedSnapshot;
    }

    /**
     * Whether the measurement with this id is in the saved file (as last loaded or saved), whatever
     * else changed on the map since: isDirty is for the whole map.
     * @param {string} id  the `id` property of the measurement
     */
    isSaved(id) {
        if (!id) return false;
        try {
            const saved = JSON.parse(this._savedSnapshot);
            return Array.isArray(saved) && saved.some(f => f && f.properties && f.properties.id === id);
        } catch {
            return false;
        }
    }

    handleListOpen() {
        this.onListOpen();
    }

    /**
     * Get a list of all measurements with their details
     * @returns {Array} Array of { name, type, value, feature, groupId, ref, category, severity, status } (and the name of each choice: categoryLabel, ...)
     */
    getMeasurementsList() {
        const features = this.source.getFeatures();
        return features
            .filter(f => f.get('measurementType'))
            .map(f => {
                const type = f.get('measurementType');
                const name = f.get('name') || f.get('title') || '';
                let value;
                if (type === 'point') {
                    const [lon, lat] = toLonLat(f.getGeometry().getCoordinates());
                    value = latLonText(lat, lon);
                } else {
                    // A stockpile with its volume: built from the stored metric properties, in the units of the map now
                    const label = type === 'stockpile' ? stockpileText(f.getProperties(), this.unitPref) : null;
                    // Otherwise the tooltip text, without its HTML tags
                    value = label ?? (f.get('tooltipText') || '').replace(/<[^>]*>/g, '');
                }
                return {
                    name, type, value, feature: f, groupId: f.get('groupId') || '',
                    ref: f.get('ref') ? String(f.get('ref')) : '',
                    category: f.get('category') || '',
                    categoryLabel: choiceLabel(this.annotationSchema.categories, f.get('category')),
                    severity: f.get('severity') || '',
                    severityLabel: choiceLabel(this.annotationSchema.severities, f.get('severity')),
                    status: f.get('status') || '',
                    statusLabel: choiceLabel(this.annotationSchema.statuses, f.get('status'))
                };
            });
    }

    /**
     * Assign a measurement feature to a group
     * @param {ol.Feature} feature - The feature to assign
     * @param {string} groupId - Group ID, or empty string to ungroup
     */
    setMeasurementGroupId(feature, groupId) {
        if (!feature) return;
        if (groupId) {
            feature.set('groupId', groupId);
        } else {
            feature.unset('groupId');
        }
    }

    /**
     * Toggle visibility of all features belonging to a group
     * @param {string} groupId - Group ID
     * @param {boolean} visible - Whether the group should be visible
     */
    setGroupVisibility(groupId, visible) {
        this.source.getFeatures().forEach(f => {
            if (f.get('groupId') === groupId) this.setFeatureVisibility(f, visible);
        });
    }

    /**
     * Whether a measurement is shown (its group is not hidden)
     * @param {ol.Feature} feature
     * @returns {boolean}
     */
    isFeatureVisible(feature) {
        const style = feature.getStyle();
        return !(Array.isArray(style) && style.length === 0);
    }

    /**
     * Shows or hides one measurement (its shape and its label), as the visibility of its group says
     * @param {ol.Feature} feature
     * @param {boolean} visible
     */
    setFeatureVisibility(feature, visible) {
        // Empty style = invisible; undefined = the layer's style
        feature.setStyle(visible ? undefined : []);
        const tooltip = feature.get('measureTooltip');
        if (tooltip) tooltip.getElement().style.display = visible ? '' : 'none';
    }

    /**
     * Deletes the measurement drawn at a map coordinate: the one `_measurementAt` finds there, which is what the
     * eraser's hover shows. A measurement that is not drawn (its group is hidden) is not found, and one under another
     * is left alone: a click deletes one measurement.
     * @param {ol.Map} map
     * @param {number[]} coordinate  in the projection of the map
     * @returns {ol.Feature | null} the measurement that was deleted
     */
    eraseAt(map, coordinate) {
        const feature = this._measurementAt(map, map.getPixelFromCoordinate(coordinate));
        if (!feature || !this.isFeatureVisible(feature)) return null;
        this.deleteMeasurement(feature);
        return feature;
    }

    /**
     * Delete a single measurement by its feature reference
     * @param {ol.Feature} feature - The feature to remove
     */
    deleteMeasurement(feature) {
        // Clear the hovered-feature reference if we're about to remove it,
        // otherwise the next pointermove sees a stale pointer to a feature
        // no longer in the layer (no visual issue today, but avoids latent
        // bugs and lets _setHoveredFeature short-circuit cleanly).
        if (this._hoveredFeature === feature) {
            this._setHoveredFeature(null);
        }
        removeMeasureTooltip(this.getMap(), feature);
        this.source.removeFeature(feature);
        this.refreshButtons();
    }

    /**
     * Create a style for a feature based on its properties (GeoJSON styling conventions)
     * @param {ol.Feature} feature - The feature to style
     * @returns {Style|Style[]} The style for the feature (an analysis overlay: its halo and its style)
     */
    createFeatureStyle(feature) {
        // Default colors
        // The canvas reads the token (--ddb-measure-color, equal to MEASURE_COLOR, the default a
        // measurement stores); the halo of a hovered point is the markers' halo
        const defaultStroke = colorToken('--ddb-measure-color', MEASURE_COLOR);
        const defaultStrokeWidth = 2;

        // Read GeoJSON style properties from feature
        const strokeColor = feature.get('stroke') || defaultStroke;
        const strokeWidth = feature.get('stroke-width') || defaultStrokeWidth;
        const strokeOpacity = feature.get('stroke-opacity') !== undefined ? feature.get('stroke-opacity') : 1;
        const fillColor = feature.get('fill') || defaultStroke;
        const fillOpacity = feature.get('fill-opacity') !== undefined ? feature.get('fill-opacity') : 0.2;

        // Hover state: thicker stroke, slightly more opaque fill, larger
        // anchor circle so the user gets a clear visual cue that the feature
        // is the target of a double-click (which opens the detail dialog).
        // The flag is set on the OL Feature instance directly (not via
        // get/set) so it never bleeds into the persisted GeoJSON properties.
        // A measurement selected in the measurement list looks hovered too
        const hovered = feature._hovered === true || feature._listSelected === true;
        const hoverStrokeBoost = hovered ? 2 : 0;
        const hoverFillBoost = hovered ? 0.15 : 0;
        const effectiveStrokeWidth = strokeWidth + hoverStrokeBoost;
        const effectiveFillOpacity = Math.min(1, fillOpacity + hoverFillBoost);

        // Convert hex color to rgba if needed
        const hexToRgba = (hex, opacity) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (result) {
                const r = parseInt(result[1], 16);
                const g = parseInt(result[2], 16);
                const b = parseInt(result[3], 16);
                return `rgba(${r}, ${g}, ${b}, ${opacity})`;
            }
            return hex;
        };

        const strokeRgba = hexToRgba(strokeColor, strokeOpacity);
        const fillRgba = hexToRgba(fillColor, effectiveFillOpacity);

        const style = new Style({
            fill: new Fill({
                color: fillRgba,
            }),
            stroke: new Stroke({
                color: strokeRgba,
                width: effectiveStrokeWidth,
            }),
            image: new CircleStyle({
                radius: hovered ? 9 : 7,
                fill: new Fill({
                    color: strokeColor,
                }),
                stroke: hovered ? new Stroke({ color: colorToken('--ddb-map-halo'), width: 2 }) : null,
            }),
        });
        // A stockpile or a profile is an analysis overlay: a dark halo under its line
        const reference = this._referenceStyle(feature, strokeColor);
        if (ANALYSIS_MEASUREMENT_TYPES.includes(feature.get('measurementType'))) {
            return reference ? [haloStyle(effectiveStrokeWidth), style, reference] : [haloStyle(effectiveStrokeWidth), style];
        }
        return reference ? [style, reference] : style;
    }

    /**
     * The badge with the reference of an annotation, below its label (the size of an area or a line, the callout of
     * a point are above it): the text on the tooltip colours, with the colour of the measurement as its border.
     * @param {ol.Feature} feature
     * @param {string} colour  the colour of the measurement
     * @returns {Style | null} null when references are hidden, the annotation has none or the measurement is no
     *   annotation (a contour of a file an older Hub numbered, until it is saved)
     */
    _referenceStyle(feature, colour) {
        const ref = feature.get('ref');
        const geometry = feature.getGeometry();
        if (!this.showReferences || !ref || !geometry || !isAnnotationType(feature.get('measurementType'))) return null;
        let anchor = null;
        if (geometry instanceof Polygon) anchor = new Point(geometry.getInteriorPoint().getCoordinates().slice(0, 2));
        else if (geometry instanceof LineString) anchor = new Point(geometry.getCoordinateAt(0.5));
        else if (geometry instanceof Point) anchor = geometry;
        if (!anchor) return null;
        return new Style({
            geometry: anchor,
            text: new Text({
                text: String(ref),
                font: '600 12px sans-serif',
                offsetY: 16,
                padding: [2, 5, 2, 5],
                fill: new Fill({ color: colorToken('--ddb-tooltip-text-dark') }),
                backgroundFill: new Fill({ color: colorToken('--ddb-tooltip-bg-light') }),
                backgroundStroke: new Stroke({ color: colour, width: 2 })
            })
        });
    }

    /**
     * Clear all measurements from the map
     */
    clearAllMeasurements() {
        this._clearMeasurements();
        this.carried = [];
    }

    /** Takes the measurements off the map (see clearAllMeasurements, which also lets go of what the map cannot draw). */
    _clearMeasurements() {
        const map = this.getMap();
        const features = this.source.getFeatures();

        // Remove the labels and popups from the map
        features.forEach(feature => removeMeasureTooltip(map, feature));

        // Clear all features
        this.source.clear();

        // Update button visibility
        this.refreshButtons();
    }

    /**
     * Export measurements to GeoJSON: all of them, or only the features of `only` (a Set)
     */
    exportToGeoJSON(orthophotoPath, groups = [], only = null) {
        return exportMeasurements(this.source, orthophotoPath, this.unitPref, groups, only, this.carried);
    }

    /**
     * Import measurements from GeoJSON
     */
    importFromGeoJSON(geojson) {
        const map = this.getMap();

        const result = importMeasurements(geojson, this.source, this.unitPref, map, this.pointPopupActions());
        if (result.carried) this.carried.push(...result.carried);

        // Update button visibility after import
        this.refreshButtons();

        return result;
    }

    /**
     * Check if there are any measurements
     */
    hasMeasurements() {
        return this.source.getFeatures().length > 0;
    }

    /**
     * Toggle edit mode (Modify + Translate interactions)
     */
    toggleEditMode() {
        const map = this.getMap();

        if (this.isEditMode) {
            // Disable edit mode
            this.disableEditMode();
        } else {
            // First deselect any active drawing tool
            if (this.selectedTool) {
                this.deselectCurrent();
            }

            // Enable edit mode
            this.enableEditMode(map);
        }
    }

    /**
     * Enable edit mode with Modify and Translate interactions: on every measurement, or on `features` only
     * (a panel that edits the outline of one pile). A vertex is added by dragging the middle of an edge, and
     * removed with Alt+click (OpenLayers' defaults).
     * @param {import('ol/Map').default} map
     * @param {{ features?: import('ol/Feature').default[], onExit?: () => void }} [options]
     *   `features`: the only features that can be edited; `onExit`: called once when edit mode ends
     */
    enableEditMode(map, { features, onExit } = {}) {
        if (!map) return;

        this.isEditMode = true;
        this._onEditModeExit = onExit || null;
        // Modify takes a source or a collection, never both; Translate takes layers or the collection
        const editable = features ? new Collection(features) : null;
        this.btnEdit.classList.add('active');
        // Edit mode keeps the tools open, as a drawing tool does: Edit (which ends it) stays in reach
        this.setToolsOpen(true);
        // Drop any hover highlight - the edit interaction has its own visual
        // language for selected/active features.
        this._setHoveredFeature && this._setHoveredFeature(null);

        // Create Modify interaction for vertex editing
        this.modifyInteraction = new Modify({
            ...(editable ? { features: editable } : { source: this.source }),
            style: new Style({
                image: new CircleStyle({
                    radius: 6,
                    fill: new Fill({ color: colorToken('--ddb-measure-color', MEASURE_COLOR) }),
                    stroke: new Stroke({ color: colorToken('--ddb-map-halo'), width: 2 })
                })
            })
        });

        // Create Translate interaction for moving entire features (Shift+drag)
        this.translateInteraction = new Translate({
            ...(editable ? { features: editable } : { layers: [this.vector] }),
            condition: (event) => {
                // Only translate when Shift key is pressed
                return event.originalEvent.shiftKey;
            }
        });

        map.addInteraction(this.modifyInteraction);
        map.addInteraction(this.translateInteraction);

        // Save original geometry before modification starts (for undo)
        // lifetime: owner (the interaction is created here and dropped with its listeners when the tool stops)
        this.modifyInteraction.on('modifystart', (evt) => {
            evt.features.forEach(feature => {
                this.saveToUndoStack(feature);
            });
        });

        // lifetime: owner (the interaction is created here and dropped with its listeners when the tool stops)
        this.translateInteraction.on('translatestart', (evt) => {
            evt.features.forEach(feature => {
                this.saveToUndoStack(feature);
            });
        });

        // Update tooltip in real-time during modification
        // lifetime: owner (the interaction is created here and dropped with its listeners when the tool stops)
        this.modifyInteraction.on('modifyend', (evt) => {
            evt.features.forEach(feature => {
                this.updateMeasurementValue(feature);
                this.updateTooltipPosition(feature);
                // Rebuild point popup to reflect new coordinates
                if (feature.get('measurementType') === 'point') {
                    this.showPointPopup(feature);
                }
                this.onFeatureModified(feature);
            });
        });

        // lifetime: owner (the interaction is created here and dropped with its listeners when the tool stops)
        this.translateInteraction.on('translateend', (evt) => {
            evt.features.forEach(feature => {
                this.updateTooltipPosition(feature);
                // Rebuild point popup to reflect new coordinates
                if (feature.get('measurementType') === 'point') {
                    this.showPointPopup(feature);
                }
                this.onFeatureModified(feature);
            });
        });

        // Real-time update during vertex dragging
        this.changeFeatureListener = (evt) => {
            if (this.isEditMode && evt.feature) {
                this.updateMeasurementValueRealtime(evt.feature);
            }
        };
        this.source.on('changefeature', this.changeFeatureListener);

        // Disable DoubleClickZoom interaction to allow double-click on features
        map.getInteractions().forEach((interaction) => {
            if (interaction instanceof DoubleClickZoom) {
                this.doubleClickZoomInteraction = interaction;
                interaction.setActive(false);
            }
        });

        // Add double-click handler for opening properties dialog using OpenLayers event
        this.dblClickListener = map.on('dblclick', (evt) => {
            // Check if we hit a measurement feature
            const feature = map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === this.vector) return f;
                return null;
            }, { hitTolerance: 5 });

            if (feature && feature.get('measurementType')) {
                evt.stopPropagation();
                evt.preventDefault();
                this.openPropertiesDialog(feature);
                return true; // Stop event propagation in OpenLayers
            }
        });

        // Show help tooltip
        if (this.helpTooltipElement) {
            this.helpTooltipElement.innerHTML = editable
                ? 'Drag a vertex, or the middle of an edge to add one. Alt+click removes a vertex. Shift+drag to move. Ctrl+Z to undo. ESC to exit.'
                : 'Drag vertices to edit. Shift+drag to move. Double-click for properties. Ctrl+Z to undo. ESC to exit.';
            this.helpTooltipElement.classList.remove('hidden');
        }

        // Add keyboard listener for ESC to exit and Ctrl+Z for undo
        this.keyboardListener = (e) => {
            // A field of a dialog (the name of a measurement) keeps its own Ctrl+Z and Escape
            if (isTypingTarget(e.target)) return;
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.stopPropagation();
                e.preventDefault();
                this.disableEditMode();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
        };
        document.addEventListener('keydown', this.keyboardListener, true);
    }

    /**
     * Disable edit mode
     */
    disableEditMode() {
        const map = this.getMap();

        this.isEditMode = false;
        this.btnEdit.classList.remove('active');
        this._syncToggle();

        if (this.modifyInteraction && map) {
            map.removeInteraction(this.modifyInteraction);
            this.modifyInteraction = null;
        }

        if (this.translateInteraction && map) {
            map.removeInteraction(this.translateInteraction);
            this.translateInteraction = null;
        }

        // Remove OpenLayers dblclick listener
        if (this.dblClickListener) {
            unByKey(this.dblClickListener);
            this.dblClickListener = null;
        }

        // Re-enable DoubleClickZoom interaction
        if (this.doubleClickZoomInteraction) {
            this.doubleClickZoomInteraction.setActive(true);
            this.doubleClickZoomInteraction = null;
        }

        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener, true);
            this.keyboardListener = null;
        }

        if (this.changeFeatureListener) {
            this.source.un('changefeature', this.changeFeatureListener);
            this.changeFeatureListener = null;
        }

        if (this.helpTooltipElement) {
            this.helpTooltipElement.classList.add('hidden');
        }

        // Close any open dialog
        this.closePropertiesDialog();

        // Clear undo stack when exiting edit mode
        this.undoStack.clear();

        // Whoever started it is told once, now that everything of the mode is gone
        const exit = this._onEditModeExit;
        this._onEditModeExit = null;
        if (exit) exit();
    }

    /**
     * Save feature state to undo stack
     */
    saveToUndoStack(feature) {
        const geometry = feature.getGeometry();
        if (!geometry) return;

        // Clone geometry and save with feature reference
        this.undoStack.push({
            feature: feature,
            geometry: geometry.clone(),
            tooltipText: feature.get('tooltipText')
        });
    }

    /**
     * Undo last geometry modification
     */
    undo() {
        const state = this.undoStack.undo();
        if (!state) return;
        const feature = state.feature;

        // Check if feature still exists in source
        if (!this.source.getFeatures().includes(feature)) return;

        // Restore geometry
        feature.setGeometry(state.geometry);

        // Restore tooltip text
        if (state.tooltipText) {
            feature.set('tooltipText', state.tooltipText);
        }

        // Update tooltip display and position
        this.updateMeasurementValue(feature);
        this.updateTooltipPosition(feature);
        // Rebuild point popup to reflect restored coordinates
        if (feature.get('measurementType') === 'point') {
            this.showPointPopup(feature);
        }
        this.onFeatureModified(feature);
    }

    /**
     * Update measurement value and tooltip text after geometry change
     */
    updateMeasurementValue(feature) {
        const geometry = feature.getGeometry();
        const measurementType = feature.get('measurementType');

        if (!geometry || !measurementType) return;

        // A stockpile has no size of its own: its label is built from its stored metric properties
        // (one saved without a volume keeps its text, as on import)
        const output = measurementType === 'stockpile'
            ? stockpileText(feature.getProperties(), this.unitPref)
            : measurementSizeText(geometry, measurementType, this.unitPref);

        if (output) {
            feature.set('tooltipText', output);

            // Update tooltip element (the name and the text escaped: they may come from a saved file)
            updateFeatureTooltip(feature);
        }
    }

    /**
     * Real-time update of measurement value during vertex dragging (throttled)
     */
    updateMeasurementValueRealtime(feature) {
        // Throttle updates to avoid performance issues
        if (this._updateTimeout) return;

        // lifetime: defer (50 ms throttle of the tooltip text; touches only OpenLayers objects)
        this._updateTimeout = setTimeout(() => {
            this.updateMeasurementValue(feature);
            this.updateTooltipPosition(feature);
            this._updateTimeout = null;
        }, 50); // Update every 50ms max
    }

    /**
     * Update tooltip position after geometry modification
     */
    updateTooltipPosition(feature) {
        const geometry = feature.getGeometry();
        const tooltip = feature.get('measureTooltip');

        if (!tooltip || !geometry) return;

        let position;
        if (geometry instanceof Polygon) {
            position = geometry.getInteriorPoint().getCoordinates();
        } else if (geometry instanceof LineString) {
            position = geometry.getLastCoordinate();
        } else if (geometry instanceof Point) {
            position = geometry.getCoordinates();
        }

        if (position) {
            tooltip.setPosition(position);
        }
    }

    /**
     * The handlers of the buttons of a point's popup: the properties dialog of the point, the deletion
     * of a measurement, and the end of a drag of its move handle.
     * @returns {import('@/libs/map/pointPopup').PointPopupActions}
     */
    pointPopupActions() {
        return {
            onEdit: feature => this.openPropertiesDialog(feature),
            onDelete: feature => this.deleteMeasurement(feature),
            onMoved: (feature, from) => this.pointMoved(feature, from)
        };
    }

    /**
     * A point moved by the handle of its popup: its popup is shown again at the new place (its coordinates, and
     * above or below the point). In edit mode Ctrl+Z puts it back, as after a move of the point itself (the undo
     * stack lives as long as edit mode).
     * @param {ol.Feature} feature - The point feature, at its new place
     * @param {number[]} from - Its map coordinates before the move
     */
    pointMoved(feature, from) {
        this._recordPointMove(feature, from);
        this.showPointPopup(feature);
    }

    /**
     * In edit mode, a move of a point that Ctrl+Z undoes (the undo stack lives as long as edit mode).
     * @param {ol.Feature} feature - The point feature, at its new place
     * @param {number[]} from - Its map coordinates before the move
     */
    _recordPointMove(feature, from) {
        if (this.isEditMode) this.undoStack.push({ feature, geometry: new Point(from), tooltipText: feature.get('tooltipText') });
    }

    /**
     * Puts a point at the map coordinates its properties dialog was given, and brings it into view when it is
     * outside the map's view (the map is centred on it, at the same zoom).
     * @param {ol.Feature} feature - The point feature
     * @param {number[]} to - Its new map coordinates
     */
    _relocatePoint(feature, to) {
        const point = feature.getGeometry();
        const from = point.getCoordinates();
        point.setCoordinates(to);
        this._recordPointMove(feature, from);
        const map = this.getMap();
        const size = map && map.getSize();
        if (!size) return;
        const view = map.getView();
        if (!containsCoordinate(view.calculateExtent(size), to)) view.animate({ center: to, duration: 250 });
    }

    /**
     * Shows the popup of a point annotation, with its buttons, in place of the popup it had (after
     * it was drawn, or its annotation edited, or the point moved).
     * @param {ol.Feature} feature - The point feature
     * @param {ol.Map} [map] - OpenLayers map instance (the map of the control by default)
     */
    showPointPopup(feature, map = this.getMap()) {
        showPointPopup(map, feature, this.pointPopupActions());
        // The point under the pointer keeps its callout on show while callouts show on hover
        if (feature === this._hoveredFeature) setPointPopupShown(map, feature, true);
    }

    /**
     * The point whose callout holds an element (the target of a pointer event), or null.
     * @param {EventTarget | null | undefined} target
     * @returns {ol.Feature | null}
     */
    _calloutPointAt(target) {
        const callout = target instanceof Element ? target.closest('.ol-point-popup') : null;
        if (!callout) return null;
        return this.source.getFeatures().find(f => f.get('measureTooltipElement') === callout) || null;
    }

    /**
     * Frames and selects the annotation with an id (the link of a report item): the map fits its extent (a point, which
     * has none, to a close scale) and it is shown as the annotation under the pointer is, until the pointer moves to
     * another one.
     * @param {string} id
     * @returns {boolean} false when no annotation of the map has that id
     */
    focusItem(id) {
        const feature = this.source.getFeatures().find(f => f.get('measurementType') && f.get('id') === id);
        if (!feature || !this.fitFeatures([feature])) return false;
        this._setHoveredFeature(feature);
        return true;
    }

    /**
     * Fits the map to the measurements: the extent of all of them; a single point (an extent of no size) is not zoomed
     * in past POINT_FIT_MIN_RESOLUTION.
     * @param {ol.Feature[]} features
     * @returns {boolean} false when none has a geometry or there is no map
     */
    fitFeatures(features) {
        const map = this.getMap();
        const geometries = features.map(f => f && f.getGeometry()).filter(Boolean);
        if (!map || !geometries.length) return false;
        const extent = geometries.reduce((acc, g) => extend(acc, g.getExtent()), createEmpty());
        const isPoint = getWidth(extent) === 0 && getHeight(extent) === 0;
        map.getView().fit(extent, isPoint ? { ...FILE_FIT_OPTIONS, minResolution: POINT_FIT_MIN_RESOLUTION } : FILE_FIT_OPTIONS);
        return true;
    }

    /**
     * Marks the measurements selected in the measurement list: they are drawn as a hovered one is, until the next call
     * (an empty list clears the marks). The mark is a flag on the feature, never one of its properties, so it is not
     * saved.
     * @param {ol.Feature[]} features
     */
    setListSelection(features) {
        const next = new Set(features);
        for (const f of this._listSelection || []) {
            if (next.has(f)) continue;
            f._listSelected = false;
            try { f.changed(); } catch { /* noop */ }
        }
        for (const f of next) {
            if (f._listSelected) continue;
            f._listSelected = true;
            try { f.changed(); } catch { /* noop */ }
        }
        this._listSelection = next;
    }

    /**
     * The measurement at a pixel of the map (within a few pixels), or null.
     * @param {ol.Map} map
     * @param {number[]} pixel
     * @returns {ol.Feature | null}
     */
    _measurementAt(map, pixel) {
        return map.forEachFeatureAtPixel(pixel, (f, layer) => (layer === this.vector && f.get('measurementType') ? f : null), { hitTolerance: 5 }) || null;
    }

    /**
     * Shows the callouts of the point annotations always (true) or only while their point is hovered or
     * tapped (false), and keeps the choice as the user's preference.
     * @param {boolean} always
     */
    setPointCallouts(always) {
        this.showCallouts(always);
        setPref(PREF.SHOW_POINT_CALLOUTS, always);
    }

    /**
     * Shows the callouts of the point annotations always (true) or on hover (false), without storing it
     * (the preference changed elsewhere: the Preferences page, another tab, the account).
     * @param {boolean} always
     */
    showCallouts(always) {
        this.showPointCallouts = always !== false;
        this._syncCalloutsButton();
        const map = this.getMap();
        if (map) map.getViewport().classList.toggle(CALLOUTS_ON_HOVER_CLASS, !this.showPointCallouts);
    }

    _syncCalloutsButton() {
        const always = this.showPointCallouts;
        this.btnCallouts.classList.toggle('active', always);
        this.btnCallouts.setAttribute('aria-pressed', String(always));
        this.btnCallouts.title = `${CALLOUTS_LABEL} - ${always
            ? 'The callouts of the point annotations are always shown. Click to show each one only while the pointer is over its point.'
            : 'Each callout shows while the pointer is over its point, or after a tap on it. Click to always show them.'}`;
    }

    /**
     * Shows the reference of each annotation on the map (true) or hides it (false).
     * @param {boolean} show
     */
    setShowReferences(show) {
        this.showReferences = show !== false;
        this._syncReferencesButton();
        if (this.vector) this.vector.changed();
    }

    _syncReferencesButton() {
        const shown = this.showReferences;
        this.btnReferences.classList.toggle('active', shown);
        this.btnReferences.setAttribute('aria-pressed', String(shown));
        this.btnReferences.title = `${REFERENCES_LABEL} - ${shown
            ? 'The reference of each annotation is drawn next to it. Click to hide the references.'
            : 'The references of the annotations are hidden. Click to draw the reference of each one next to it.'}`;
    }

    /** Sets the categories, severities and statuses that the properties dialog offers. @param {import('@/libs/reports/reportSettings').AnnotationSchema} schema */
    setAnnotationSchema(schema) {
        this.annotationSchema = schema || DEFAULT_SCHEMA;
    }

    /** The refs this control issues: the host's (the file's) when it has them, else its own. @returns {RefSequence} */
    _refSequence() {
        return this.getRefSequence() || this._ownRefs;
    }

    /**
     * The refs that the annotations on the map have, except the one of `except` (a contour of a file an older Hub
     * numbered keeps its ref until it is saved, and it is no annotation's).
     * @param {ol.Feature} [except]
     * @returns {string[]}
     */
    _refsOnMap(except) {
        return this.source.getFeatures()
            .filter(f => f !== except && isAnnotationType(f.get('measurementType')))
            .map(f => f.get('ref')).filter(Boolean).map(String);
    }

    /**
     * Whether a reference that the user typed is used by another annotation of the file: one of the map's, or one
     * of the other view's that the file had when it was read.
     * @param {string} ref
     * @param {ol.Feature} [feature]  the annotation that has the dialog open (its own ref is not taken)
     */
    isRefTaken(ref, feature) {
        return this._refSequence().isTaken(ref, this._refsOnMap(feature));
    }

    /**
     * Gives a measurement that was just made its `id` and, when it is an annotation, the next `ref` (the ones it has stay).
     * @param {ol.Feature} feature
     */
    identify(feature) {
        if (!feature.get('id')) feature.set('id', newId());
        if (!feature.get('ref') && isAnnotationType(feature.get('measurementType'))) feature.set('ref', this._refSequence().issue(this._refsOnMap(feature)));
    }

    /**
     * Gives the measurements the refs a save wrote for them (by id): the file numbered the ones that had no ref and
     * gave the next one to those whose ref another session had taken. A measurement that is no annotation (a contour)
     * has no ref in the file the save wrote, and none on the map either.
     * @param {Record<string, string>} [refs]
     */
    applyRefs(refs = {}) {
        this.source.getFeatures().forEach(f => {
            if (!isAnnotationType(f.get('measurementType'))) {
                if (f.get('ref') !== undefined) f.unset('ref');
                return;
            }
            const ref = refs[f.get('id')];
            if (ref && f.get('ref') !== ref) f.set('ref', ref);
        });
    }

    /**
     * What the Photos tab of the dialog of a measurement needs: the host's dataset and measurement file, and the
     * measurement's id, photos and WGS84 geometry. Null when the host has no photos to offer.
     * @param {ol.Feature} feature
     */
    _photoContext(feature) {
        const host = this.getPhotoHost();
        if (!host) return null;
        return { ...host, itemId: feature.get('id') || '', geometry: mapFeatureGeometry(feature), photos: feature.get('photos') || [] };
    }

    /**
     * The properties dialog of a measurement or a point annotation: the one dialog of a measurement, however it is
     * opened (a double click, the edit button of a point's callout, the measurement list, a point just placed). A
     * measurement that exists has a Delete button; a point just placed has Discard, which removes it, as any other
     * close of its dialog does (closePropertiesDialog).
     * @param {ol.Feature} feature - The measurement feature to edit.
     * @param {{ isNew?: boolean }} [options] isNew: a point just placed
     */
    openPropertiesDialog(feature, { isNew = false } = {}) {
        this.closePropertiesDialog();
        if (isNew) this._unkeptPoint = feature;
        const settle = () => { if (this._unkeptPoint === feature) this._unkeptPoint = null; };

        const geometry = feature.getGeometry();
        const isPoint = feature.get('measurementType') === 'point';
        this._dialog = this.openDialog(MeasurementPropertiesDialog, {
            feature,
            geometryType: geometry ? geometry.getType() : 'LineString',
            isNew,
            showDelete: !isNew,
            groups: this.getGroups(),
            canCreateGroup: !!this.createGroup,
            schema: this.annotationSchema,
            isRefTaken: ref => this.isRefTaken(ref, feature),
            photoContext: this._photoContext(feature),
            onSave: ({ groupId, newGroup, coordinates, ...properties }) => {
                settle();
                Object.keys(properties).forEach(key => feature.set(key, properties[key]));
                // A group made in the dialog is made now that the measurement is saved in it
                this.setMeasurementGroupId(feature, newGroup ? this.createGroup(newGroup) : groupId);
                // Coordinates typed in the dialog move the point
                if (coordinates) this._relocatePoint(feature, fromLonLat(coordinates));

                // The label with the new name; a point annotation has its popup instead, shown again with its buttons
                if (isPoint) this.showPointPopup(feature);
                else updateFeatureTooltip(feature);

                // Trigger re-render for style changes. We invalidate both the
                // feature and the vector layer: setting the same value via
                // feature.set() is a no-op for OL (no propertychange fires),
                // so when only fill-opacity moves while fill stays at the
                // default color the layer can otherwise miss the redraw.
                feature.changed();
                if (this.vector) this.vector.changed();
                if (isNew) this.refreshButtons();
            },
            onDelete: () => {
                this.deleteMeasurement(feature);
            },
            // A point just placed and not kept
            onDiscard: () => {
                settle();
                this._discardPoint(feature);
            },
            onClose: () => {
                this._dialog = null;
            }
        });
    }

    /**
     * Closes the properties dialog. A point just placed whose dialog was not saved is not kept: a second click of the
     * point tool before its dialog was answered leaves no point the user never confirmed.
     */
    closePropertiesDialog() {
        const unkept = this._unkeptPoint;
        this._unkeptPoint = null;
        if (this._dialog) {
            this._dialog.close();
            this._dialog = null;
        }
        if (unkept) this._discardPoint(unkept);
    }

    /** Removes a point just placed that is not kept. @param {ol.Feature} feature */
    _discardPoint(feature) {
        if (this.source.hasFeature(feature)) this.source.removeFeature(feature);
        this.refreshButtons();
    }

    deselectCurrent() {
        if (this.selectedTool) this.onSelect(this.selectedTool);
    }

    /**
     * Drops what a line or an area tool leaves behind with no measurementType: a sketch that was cut short
     * (the degenerate shape is removed just after OpenLayers adds it). A point or an eraser click is typed a
     * moment after it is drawn, so those tools are left alone.
     * @param {string | null} tool  the tool that is ending
     */
    _dropUntypedFeatures(tool) {
        if (tool !== 'length' && tool !== 'area') return;
        this.source.getFeatures()
            .filter(f => !f.get('measurementType'))
            .forEach(f => this.source.removeFeature(f));
    }

    /** Draws the measurements again with the colour tokens (the colour scheme changed). */
    restyle() {
        this.vector?.changed();
    }

    getLayer() {
        return this.vector;
    }

    onSelect(tool) {
        const map = this.getMap();

        // Disable edit mode if active when selecting a drawing tool
        if (this.isEditMode) {
            this.disableEditMode();
        }
        // Clear any hover highlight: while drawing the user gets a different
        // visual affordance and the highlighted feature stays orphaned otherwise.
        this._setHoveredFeature && this._setHoveredFeature(null);
        // Force a fresh cursor write on the next pointermove. Otherwise the
        // ownership check would compare against a stale managed value and
        // refuse to write the appropriate cursor for the new tool.
        this._currentManagedCursor = undefined;
        if (map) {
            const target = map.getTargetElement();
            if (target) target.style.cursor = '';
        }

        const removeHandlers = () => {
            if (!this.loaded) return;

            this.helpTooltipElement.classList.add('hidden');
            // The session leaves the map: its interaction, keys, crosshair and right click. A shape being
            // drawn is cancelled, so it never reaches the source (the session was cleared first: its
            // end must not deselect the tool a second time)
            const session = this.session;
            this.session = null;
            // CRITICAL: null the reference so the dblclick / pointermove
            // guards in setMap() know no Draw is active anymore. Without
            // this, hover highlight + double-click stay disabled forever
            // after the first measurement is drawn.
            this.draw = null;
            if (session) session.end('stop');
            unByKey(this.pointerMoveListener);
            this._dropUntypedFeatures(this.selectedTool);

            // Hide stop button
            this.btnStop.style.display = 'none';
        };
        if (!this.selectedTool || this.selectedTool !== tool) {
            if (this.selectedTool !== tool) removeHandlers();

            const types = {
                'point': 'Point',
                'area': 'Polygon',
                'length': 'LineString',
                'erase': 'Point'
            }
            let type = types[tool];

            this.selectedTool = tool;
            // A tool in use keeps the tools open, so Stop (and the tool) stay in reach on a compact map
            this.setToolsOpen(true);

            if (!this.loaded) {
                // Lazy init

                this.helpTooltipElement = document.createElement('div');
                this.helpTooltipElement.className = 'ol-tooltip ol-tooltip-help hidden';
                this.helpTooltip = new Overlay({
                    element: this.helpTooltipElement,
                    offset: [15, 0],
                    positioning: 'center-left',
                });
                map.addOverlay(this.helpTooltip);

                this.createMeasureTooltipElement(map);
                this.loaded = true;
            }

            let listener;
            let sketch;

            this.pointerMoveHandler = function (evt) {
                if (evt.dragging) {
                    return;
                }

                // Check if pointer is over UI controls
                const pixel = evt.pixel;
                const element = document.elementFromPoint(pixel[0], pixel[1]);
                if (element && (
                    element.closest('.ol-measure-control') ||
                    element.closest('.ol-zoom')
                )) {
                    this.helpTooltipElement.classList.add('hidden');
                    return;
                }

                // One hint for the tool, with its gestures (D-027); the eraser is not a drawing
                const helpMsg = tool === 'erase' ? 'Click a measurement to remove it. Esc exits.' : this.session ? this.session.hint : '';

                this.helpTooltipElement.innerHTML = helpMsg;
                // On the side of the pointer that has the room, so the hint is never cut by the map's edge
                const leftOfPointer = pixel[0] > evt.map.getSize()[0] / 2;
                this.helpTooltip.setPositioning(leftOfPointer ? 'center-right' : 'center-left');
                this.helpTooltip.setOffset(leftOfPointer ? [-15, 0] : [15, 0]);
                this.helpTooltip.setPosition(evt.coordinate);

                this.helpTooltipElement.classList.remove('hidden');
            }

            let self = this;

            const sketchStyle = new Style({
                fill: new Fill({
                    color: tokenRgba('--ddb-glass-rgb', 0.4),
                }),
                stroke: new Stroke({
                    color: tokenRgba('--ddb-measure-color', 0.7),
                    lineDash: [10, 10],
                    width: 2,
                }),
                image: new CircleStyle({
                    radius: 5,
                    stroke: new Stroke({
                        color: tokenRgba('--ddb-shade-rgb', 0.9),
                    }),
                    fill: new Fill({
                        color: tokenRgba('--ddb-glass-rgb', 0.4),
                    }),
                })
            });
            const onDrawStart = function (evt) {
                sketch = evt.feature;
                let tooltipCoord = evt.coordinate;

                listener = sketch.getGeometry().on('change', function (evt) {
                    const geom = evt.target;
                    let output;
                    if (geom instanceof Polygon) {
                        output = measurementSizeText(geom, 'area', self.unitPref);
                        tooltipCoord = geom.getInteriorPoint().getCoordinates();
                    } else if (geom instanceof LineString) {
                        output = measurementSizeText(geom, 'length', self.unitPref);
                        tooltipCoord = geom.getLastCoordinate();
                    }
                    self.measureTooltipElement.innerHTML = output;
                    self.measureTooltip.setPosition(tooltipCoord);
                });
            };
            const onDrawEnd = function (evt) {
                const feat = evt.feature;
                if (tool === 'point') {
                    // Point annotation: open dialog before confirming the point
                    // lifetime: defer (after OpenLayers adds the feature)
                    setTimeout(() => {
                        feat.set('measurementType', 'point');
                        feat.set('createdAt', new Date().toISOString());
                        // A point placed before it (a double click) whose dialog was not answered goes first, so
                        // that this one is numbered without it
                        self.closePropertiesDialog();
                        self.identify(feat);

                        self.openPropertiesDialog(feat, { isNew: true });
                    }, 10);
                } else if (tool === 'erase') {
                    // lifetime: defer (after OpenLayers adds the feature)
                    setTimeout(() => {
                        // Delete the measurement under the click, the one the eraser's hover showed
                        self.eraseAt(map, feat.getGeometry().getCoordinates());

                        // Remove the transient erase-click point itself.
                        try { self.source.removeFeature(feat); } catch { /* noop */ }

                        // Update button visibility after erase
                        self.refreshButtons();
                    }, 100);
                } else {
                    // Validate measurement: discard degenerate geometries (0m lines, 0m² areas)
                    if (isDegenerateMeasurement(feat.getGeometry())) {
                        // Remove degenerate measurement: OpenLayers adds the feature to the source after
                        // this event, so it goes just after (it has no measurementType to be kept for)
                        queueMicrotask(() => { try { self.source.removeFeature(feat); } catch { /* already gone */ } });
                        if (self.measureTooltipElement && self.measureTooltipElement.parentNode) {
                            self.measureTooltipElement.parentNode.removeChild(self.measureTooltipElement);
                        }
                        if (self.measureTooltip) {
                            map.removeOverlay(self.measureTooltip);
                        }
                        self.measureTooltipElement = null;
                        self.createMeasureTooltipElement(map);
                        sketch = null;
                        unByKey(listener);
                        return;
                    }

                    // Save tooltip text and timestamp to feature
                    feat.set('tooltipText', self.measureTooltipElement.textContent);
                    feat.set('createdAt', new Date().toISOString());
                    feat.set('measurementType', tool);
                    self.identify(feat);

                    // Create new measurement tooltip, save ref to existing one
                    self.measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
                    self.measureTooltip.setOffset([0, -7]);
                    feat.set('measureTooltipElement', self.measureTooltipElement);
                    feat.set('measureTooltip', self.measureTooltip);
                    self.measureTooltipElement = null;
                    self.createMeasureTooltipElement(map);

                    // Update button visibility after a short delay to allow OpenLayers to add the feature to the source
                    // lifetime: defer
                    setTimeout(() => self.refreshButtons(), 10);
                }

                sketch = null;
                unByKey(listener);
            };
            // Esc, Stop and the end of the session drop the shape being drawn: nothing is kept, and the
            // measurement tooltip that followed the sketch goes with it
            const onDrawAbort = function () {
                sketch = null;
                unByKey(listener);
                if (self.measureTooltipElement) self.measureTooltipElement.innerHTML = '';
                if (self.measureTooltip) self.measureTooltip.setPosition(undefined);
            };

            // The shared drawing session (D-027, FR-XC-17): double click, Enter and right click finish the
            // shape, Esc and Stop cancel it, Space adds the point under the crosshair
            let session = null;
            session = this.session = startDrawingSession({
                map,
                type,
                source: this.source,
                style: sketchStyle,
                hintKind: tool === 'erase' ? 'pick' : undefined,
                onDrawStart,
                onDrawEnd,
                onDrawAbort,
                // Esc ended the session: the tool is deselected with it
                onEnd: () => {
                    if (this.session !== session) return;
                    this.session = null;
                    this.deselectCurrent();
                }
            });
            this.draw = session.draw;
            this.pointerMoveListener = map.on('pointermove', this.pointerMoveHandler.bind(this));

            // Show stop button when a tool is active
            this.btnStop.style.display = 'inline-block';

            this.onToolSelected(tool);
        } else {
            removeHandlers();
            this.selectedTool = null;
            this._syncToggle();
            this.onToolDeselected();
        }
    }

    /**
     * The Measure toggle of a compact map. Closing the tools folds Stop and Edit away with them, so the
     * tool in use (or edit mode) ends first: taps on the map must not keep adding points behind closed tools.
     */
    handleToggle() {
        if (!this.toolsOpen) {
            this.setToolsOpen(true);
            return;
        }
        this.deselectCurrent();
        if (this.isEditMode) this.disableEditMode();
        this.setToolsOpen(false);
    }

    /**
     * Opens or closes the measure tools of a compact map (the Measure toggle). A map that is not
     * compact shows them always: the class only matters to css/ol-controls.css under `.is-compact`.
     * @param {boolean} open
     */
    setToolsOpen(open) {
        this.toolsOpen = open;
        this.element.classList.toggle('is-open', open);
        this.btnToggle.setAttribute('aria-expanded', String(open));
        this.btnToggle.title = open ? 'Measure - Hide the measure tools.' : 'Measure - Show the measure tools.';
        this._syncToggle();
    }

    /** The Measure toggle looks pressed while the tools are open or a tool (or edit mode) is in use */
    _syncToggle() {
        this.btnToggle.classList.toggle('active', this.toolsOpen || !!this.selectedTool || !!this.isEditMode);
    }

    createMeasureTooltipElement(map) {
        this.measureTooltipElement = document.createElement('div');
        this.measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
        this.measureTooltip = new Overlay({
            element: this.measureTooltipElement,
            offset: [0, -15],
            positioning: 'bottom-center',
            stopEvent: false,
            insertFirst: false,
        });
        map.addOverlay(this.measureTooltip);
    }
}

export default MeasureControls;

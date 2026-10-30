import { createUndoStack } from '@/libs/undoStack';
import { controlButton, controlGroup } from './controlButton';
import { Control } from 'ol/control';
import Overlay from 'ol/Overlay';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Translate from 'ol/interaction/Translate';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { LineString, Polygon, Point } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import { exportMeasurements, importMeasurements, measurementSizeText, updateFeatureTooltip } from '@/libs/map/olMeasurementConverter';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import PointAnnotationDialog from '@/features/viewers/map/PointAnnotationDialog.vue';
import { showPointPopup } from '@/libs/map/pointPopup';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';
import { getPref, setPref, onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';

// Cursor shown over a measurement while the eraser tool is active. We use
// the same static asset as the toolbar button (file URL, not an inline SVG
// data URL) because data-URL cursors are unreliable: some browsers fail to
// load them and others re-normalize the value on read-back, breaking any
// equality check used to detect ownership of the cursor.
const ERASE_HOVER_CURSOR = `url('${'/images/measure-erase.svg'}') 12 12, crosshair`;

class MeasureControls extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const unitPref = getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);

        const btnPoint = controlButton('Point Annotation', 'Click on the map to place an annotation.', '/images/measure-point.svg');
        const btnLength = controlButton('Measure Length', 'Click on the map to place points along a line. Double-click to finish. Press ESC to cancel.', '/images/measure-length.svg');
        const btnArea = controlButton('Measure Area', 'Click on the map to draw a polygon. Double-click to finish and calculate the area. Press ESC to cancel.', '/images/measure-area.svg');
        const btnErase = controlButton('Erase Measurement', 'Click on a measurement to delete it.', '/images/measure-erase.svg');
        const btnEdit = controlButton('Edit/Move Measurements', 'Click and drag measurement points to reposition them.', '/images/edit.svg');
        const btnStop = controlButton('Stop Measuring', 'Cancel the current measurement. Shortcut: ESC', '/images/measure-stop.svg');
        btnStop.style.display = 'none'; // Hidden by default, shown when a tool is active

        // Save/Load/Clear buttons (hidden until there is something to manage)
        const btnSave = controlButton('Save Measurements', 'Save all current measurements to the dataset.', '/images/save.svg');
        const btnClear = controlButton('Clear All Measurements', 'Remove all measurements from the map.', '/images/eraser.svg');
        const btnExport = controlButton('Export Measurements as GeoJSON', 'Download measurements as a GeoJSON file.', '/images/download.svg');
        const btnExportCsv = controlButton('Export Measurements as CSV', 'Download measurements as a CSV table, in the units shown.');
        btnExportCsv.innerHTML = '<i class="fa-solid fa-file-csv" style="font-size: 1rem; line-height: 2rem" aria-hidden="true"></i>';
        const btnDelete = controlButton('Delete Saved Measurements', 'Permanently delete saved measurements from the dataset.', '/images/trash.svg');
        const btnList = controlButton('Measurement List', 'View and manage all measurements.');
        btnList.innerHTML = '<i class="fa-solid fa-list" style="font-size: 1rem; line-height: 2rem" aria-hidden="true"></i>';
        [btnSave, btnClear, btnExport, btnExportCsv, btnDelete, btnList].forEach(btn => { btn.style.display = 'none'; });

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
        toolbar2.appendChild(btnSave);
        toolbar2.appendChild(btnClear);
        toolbar2.appendChild(btnExport);
        toolbar2.appendChild(btnExportCsv);
        toolbar2.appendChild(btnDelete);

        const element = document.createElement('div');
        element.className = 'ol-measure-control ol-unselectable';
        element.appendChild(toolbar1);
        element.appendChild(toolbar2);

        super({
            element: element,
            target: options.target,
        });

        // lifetime: element (the control's own toolbar buttons, dropped with the control)
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

        this.selectedTool = null;
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
        // Notified whenever a feature is removed from the measurement source
        // (eraser tool, deleteMeasurement, etc.). Consumers use this to keep
        // the deletedMeasurementIds tracking in sync so persisted features
        // (stockpiles) don't get re-hydrated from the saved GeoJSON file.
        this.onMeasurementDeleted = options.onMeasurementDeleted || (() => { });
        // Renders a dialog inside the app (useDialogs().open) and returns its handle
        this.openDialog = options.openDialog;
        this._dialog = null;

        this.source = new VectorSource();
        // lifetime: owner (the control's own measurement source)
        this.source.on('removefeature', (evt) => {
            try { this.onMeasurementDeleted(evt.feature); } catch { /* noop */ }
        });
        this.vector = new VectorLayer({
            source: this.source,
            style: (feature) => this.createFeatureStyle(feature),
        });

        this.unitPref = unitPref;

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

        // Store keyboard listener reference
        this.keyboardListener = null;

        // Edit mode interactions
        this.modifyInteraction = null;
        this.translateInteraction = null;
        this.isEditMode = false;

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
    }

    /**
     * Override setMap to initialize button visibility when control is added
     */
    setMap(map) {
        super.setMap(map);

        // The unit follows the Preferences page, other tabs and the account while on a map
        if (this._unsubscribeUnitPref) {
            this._unsubscribeUnitPref();
            this._unsubscribeUnitPref = null;
        }

        // Initialize button visibility when control is added to map
        if (map) {
            this._unsubscribeUnitPref = onPrefChange(key => {
                if (key !== PREF.MEASURE_UNIT) return;
                const unit = getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
                if (unit !== this.unitPref) this.showUnit(unit);
            });
            this.refreshButtons();
            // Detail dialog: outside edit mode, double-clicking on a measurement
            // opens the properties dialog with a Delete button. We only act on
            // hits against our own vector layer; misses fall through so the
            // native DoubleClickZoom interaction still zooms the map.
            this._detailDblClickKey = map.on('dblclick', (evt) => {
                if (this.isEditMode || this.selectedTool) return;
                const feature = map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                    if (layer === this.vector && f.get('measurementType')) return f;
                    return null;
                }, { hitTolerance: 5 });
                if (feature) {
                    evt.stopPropagation();
                    if (evt.preventDefault) evt.preventDefault();
                    this.openPropertiesDialog(feature, { showDelete: true });
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
                const hit = map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                    if (layer === this.vector && f.get('measurementType')) return f;
                    return null;
                }, { hitTolerance: 5 });
                this._setHoveredFeature(hit || null);
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
        } else {
            if (this._detailDblClickKey) {
                try { unByKey(this._detailDblClickKey); } catch { /* noop */ }
                this._detailDblClickKey = null;
            }
            if (this._hoverPointerKey) {
                try { unByKey(this._hoverPointerKey); } catch { /* noop */ }
                this._hoverPointerKey = null;
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
            const prevTip = previous.get && previous.get('measureTooltipElement');
            if (prevTip && prevTip.classList) {
                prevTip.classList.add('ol-tooltip-hidden');
            }
        }
        if (feature) {
            feature._hovered = true;
            try { feature.changed(); } catch { /* noop */ }
            // Reveal the persistent tooltip label only for the hovered feature.
            const tip = feature.get && feature.get('measureTooltipElement');
            if (tip && tip.classList) {
                tip.classList.remove('ol-tooltip-hidden');
            }
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

    handleStop() {
        // Finish current drawing if in progress
        if (this.draw) {
            this.draw.finishDrawing();
        }
        // Deselect current tool
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
        this.clearAllMeasurements();
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
        this.btnSave.style.display = show((hasMeasurements || this.hasSaved) && this.canWrite);
        this.btnClear.style.display = show(hasMeasurements);
        this.btnExport.style.display = show(hasMeasurements);
        this.btnExportCsv.style.display = show(hasMeasurements);
        this.btnDelete.style.display = show(this.hasSaved && this.canDelete);
    }

    /** The measurements as they would be saved, without the times that an export may fill in. */
    _snapshot() {
        const { features } = this.exportToGeoJSON('');
        return JSON.stringify(features.map(f => {
            const properties = { ...f.properties };
            delete properties.createdAt;
            return { ...f, properties };
        }));
    }

    /** Takes the measurements on the map as the saved ones (after a load or a save). */
    markSaved() {
        this._savedSnapshot = this._snapshot();
    }

    /** Whether the map has changes that are not in the file. */
    isDirty() {
        return this._snapshot() !== this._savedSnapshot;
    }

    handleListOpen() {
        this.onListOpen();
    }

    /**
     * Get a list of all measurements with their details
     * @returns {Array} Array of { name, type, value, feature, groupId }
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
                    const coords = f.getGeometry().getCoordinates();
                    const lonLat = toLonLat(coords);
                    value = `${lonLat[1].toFixed(6)}, ${lonLat[0].toFixed(6)}`;
                } else {
                    // Strip HTML tags from tooltip text
                    const tooltipText = f.get('tooltipText') || '';
                    value = tooltipText.replace(/<[^>]*>/g, '');
                }
                return { name, type, value, feature: f, groupId: f.get('groupId') || '' };
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
        const features = this.source.getFeatures();
        features.forEach(f => {
            if (f.get('groupId') === groupId) {
                if (visible) {
                    f.setStyle(undefined); // Reset to default style
                } else {
                    f.setStyle([]); // Empty style = invisible
                }
                // Also toggle tooltip overlay
                const tooltip = f.get('measureTooltip');
                if (tooltip) {
                    tooltip.getElement().style.display = visible ? '' : 'none';
                }
            }
        });
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
        const map = this.getMap();
        const tooltipOverlay = feature.get('measureTooltip');
        if (tooltipOverlay && map) {
            map.removeOverlay(tooltipOverlay);
        }
        const tooltipElement = feature.get('measureTooltipElement');
        if (tooltipElement && tooltipElement.parentNode) {
            tooltipElement.parentNode.removeChild(tooltipElement);
        }
        this.source.removeFeature(feature);
        this.refreshButtons();
    }

    /**
     * Create a style for a feature based on its properties (GeoJSON styling conventions)
     * @param {ol.Feature} feature - The feature to style
     * @returns {ol.style.Style} The style for the feature
     */
    createFeatureStyle(feature) {
        // Default colors
        const defaultStroke = MEASURE_COLOR;
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
        const hovered = feature._hovered === true;
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

        return new Style({
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
                stroke: hovered ? new Stroke({ color: '#ffffff', width: 2 }) : null,
            }),
        });
    }

    /**
     * Clear all measurements from the map
     */
    clearAllMeasurements() {
        const map = this.getMap();
        const features = this.source.getFeatures();

        // Remove tooltip overlays from map
        features.forEach(feature => {
            const tooltipOverlay = feature.get('measureTooltip');
            if (tooltipOverlay && map) {
                map.removeOverlay(tooltipOverlay);
            }
            // Also remove the DOM element if still attached
            const tooltipElement = feature.get('measureTooltipElement');
            if (tooltipElement && tooltipElement.parentNode) {
                tooltipElement.parentNode.removeChild(tooltipElement);
            }
        });

        // Clear all features
        this.source.clear();

        // Update button visibility
        this.refreshButtons();
    }

    /**
     * Export measurements to GeoJSON
     */
    exportToGeoJSON(orthophotoPath, groups = []) {
        return exportMeasurements(this.source, orthophotoPath, this.unitPref, groups);
    }

    /**
     * Import measurements from GeoJSON
     */
    importFromGeoJSON(geojson) {
        const map = this.getMap();

        const result = importMeasurements(geojson, this.source, this.unitPref, map, (feature, m) => {
            this.openPointAnnotationDialog(feature, m, true);
        });

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
     * Enable edit mode with Modify and Translate interactions
     */
    enableEditMode(map) {
        if (!map) return;

        this.isEditMode = true;
        this.btnEdit.classList.add('active');
        // Drop any hover highlight - the edit interaction has its own visual
        // language for selected/active features.
        this._setHoveredFeature && this._setHoveredFeature(null);

        // Create Modify interaction for vertex editing
        this.modifyInteraction = new Modify({
            source: this.source,
            style: new Style({
                image: new CircleStyle({
                    radius: 6,
                    fill: new Fill({ color: MEASURE_COLOR }),
                    stroke: new Stroke({ color: '#fff', width: 2 })
                })
            })
        });

        // Create Translate interaction for moving entire features (Shift+drag)
        this.translateInteraction = new Translate({
            layers: [this.vector],
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
                    this.recreatePointPopup(feature, this.getMap());
                }
            });
        });

        // lifetime: owner (the interaction is created here and dropped with its listeners when the tool stops)
        this.translateInteraction.on('translateend', (evt) => {
            evt.features.forEach(feature => {
                this.updateTooltipPosition(feature);
                // Rebuild point popup to reflect new coordinates
                if (feature.get('measurementType') === 'point') {
                    this.recreatePointPopup(feature, this.getMap());
                }
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
            this.helpTooltipElement.innerHTML = 'Drag vertices to edit. Shift+drag to move. Double-click for properties. Ctrl+Z to undo. ESC to exit.';
            this.helpTooltipElement.classList.remove('hidden');
        }

        // Add keyboard listener for ESC to exit and Ctrl+Z for undo
        this.keyboardListener = (e) => {
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
            this.recreatePointPopup(feature, this.getMap());
        }
    }

    /**
     * Update measurement value and tooltip text after geometry change
     */
    updateMeasurementValue(feature) {
        const geometry = feature.getGeometry();
        const measurementType = feature.get('measurementType');

        if (!geometry || !measurementType) return;

        const output = measurementSizeText(geometry, measurementType, this.unitPref);

        if (output) {
            feature.set('tooltipText', output);

            // Update tooltip element
            const tooltipElement = feature.get('measureTooltipElement');
            if (tooltipElement) {
                const name = feature.get('name');
                let tooltipContent = '';
                if (name) {
                    tooltipContent += `<div class="ol-tooltip-name">${name}</div>`;
                }
                tooltipContent += `<div class="ol-tooltip-value">${output}</div>`;
                tooltipElement.innerHTML = tooltipContent;
            }
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
     * Open annotation dialog for a new or existing point feature
     * @param {ol.Feature} feature - The point feature
     * @param {ol.Map} map - OpenLayers map instance
     * @param {boolean} isEdit - Whether this is editing an existing point (true) or creating a new one (false)
     */
    openPointAnnotationDialog(feature, map, isEdit) {
        this.closePropertiesDialog();

        const currentColor = feature.get('stroke') || MEASURE_COLOR;
        const currentDescription = feature.get('description') || '';

        this._dialog = this.openDialog(PointAnnotationDialog, {
            initialColor: currentColor,
            initialDescription: currentDescription,
            onSave: (data) => {
                feature.set('stroke', data.color);
                feature.set('description', data.description);
                feature.changed();

                if (isEdit) {
                    // Re-create the popup to reflect new color/description
                    this.recreatePointPopup(feature, map);
                } else {
                    // First time: create the popup
                    this.createPointPopupElement(feature, map);
                    this.refreshButtons();
                }
            },
            onDiscard: () => {
                if (!isEdit) {
                    // New point: remove it
                    this.source.removeFeature(feature);
                    this.refreshButtons();
                }
            },
            onClose: () => {
                this._dialog = null;
            }
        });
    }

    /**
     * Create the popup overlay for a point annotation feature
     */
    createPointPopupElement(feature, map) {
        const coords = feature.getGeometry().getCoordinates();
        const [lon, lat] = toLonLat(coords);

        showPointPopup(map, feature, { lat, lon, coords });
    }

    /**
     * Re-create popup for a point after editing its annotation
     */
    recreatePointPopup(feature, map) {
        // Remove old popup
        const oldOverlay = feature.get('measureTooltip');
        const oldEl = feature.get('measureTooltipElement');
        if (oldOverlay) map.removeOverlay(oldOverlay);
        if (oldEl && oldEl.parentNode) oldEl.parentNode.removeChild(oldEl);

        // Create new popup
        this.createPointPopupElement(feature, map);
    }

    /**
     * Open properties dialog for a feature.
     * @param {ol.Feature} feature - The measurement feature to edit.
     * @param {Object} [options]
     * @param {boolean} [options.showDelete] - Render a Delete button in the
     *   dialog. Used by the non-edit-mode "detail" double-click flow.
     */
    openPropertiesDialog(feature, options) {
        // Close any existing dialog
        this.closePropertiesDialog();

        const geometry = feature.getGeometry();
        const geometryType = geometry ? geometry.getType() : 'LineString';
        const showDelete = !!(options && options.showDelete);
        const groups = (options && options.groups) || [];

        this._dialog = this.openDialog(MeasurementPropertiesDialog, {
            feature: feature,
            geometryType: geometryType,
            showDelete: showDelete,
            groups: groups,
            onSave: (properties) => {
                // Update feature properties
                Object.keys(properties).forEach(key => {
                    feature.set(key, properties[key]);
                });

                // Update tooltip with new name
                updateFeatureTooltip(feature);

                // Trigger re-render for style changes. We invalidate both the
                // feature and the vector layer: setting the same value via
                // feature.set() is a no-op for OL (no propertychange fires),
                // so when only fill-opacity moves while fill stays at the
                // default color the layer can otherwise miss the redraw.
                feature.changed();
                if (this.vector) this.vector.changed();
            },
            onDelete: () => {
                this.deleteMeasurement(feature);
            },
            onClose: () => {
                this._dialog = null;
            }
        });
    }

    /**
     * Close properties dialog
     */
    closePropertiesDialog() {
        if (this._dialog) {
            this._dialog.close();
            this._dialog = null;
        }
    }

    deselectCurrent() {
        if (this.selectedTool) this.onSelect(this.selectedTool);
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
            map.removeInteraction(this.draw);
            // CRITICAL: null the reference so the dblclick / pointermove
            // guards in setMap() know no Draw is active anymore. Without
            // this, hover highlight + double-click stay disabled forever
            // after the first measurement is drawn.
            this.draw = null;
            unByKey(this.pointerMoveListener);
            if (this._contextMenuHandler) {
                map.getViewport().removeEventListener('contextmenu', this._contextMenuHandler, true);
                this._contextMenuHandler = null;
            }

            // Remove keyboard listener
            if (this.keyboardListener) {
                document.removeEventListener('keydown', this.keyboardListener, true);
                this.keyboardListener = null;
            }

            // Hide stop button
            this.btnStop.style.display = 'none';
        };        if (!this.selectedTool || this.selectedTool !== tool) {
            if (this.selectedTool !== tool) removeHandlers();

            const types = {
                'point': 'Point',
                'area': 'Polygon',
                'length': 'LineString',
                'erase': 'Point'
            }
            let type = types[tool];

            this.selectedTool = tool;

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

                let helpMsg = 'Click to start drawing. Press ESC to cancel';
                if (tool === 'point') helpMsg = 'Click on the map to place an annotation. Press ESC to exit';
                else if (tool === 'erase') helpMsg = 'Click a measurement to remove it. Press ESC to exit';
                else if (sketch) {
                    const geom = sketch.getGeometry();
                    if (geom instanceof Polygon) {
                        helpMsg = 'Click to continue drawing the polygon. Double-click to finish. Press ESC to cancel';
                    } else if (geom instanceof LineString) {
                        helpMsg = 'Click to continue drawing the line. Double-click to finish. Press ESC to cancel';
                    }
                }

                this.helpTooltipElement.innerHTML = helpMsg;
                // On the side of the pointer that has the room, so the hint is never cut by the map's edge
                const leftOfPointer = pixel[0] > evt.map.getSize()[0] / 2;
                this.helpTooltip.setPositioning(leftOfPointer ? 'center-right' : 'center-left');
                this.helpTooltip.setOffset(leftOfPointer ? [-15, 0] : [15, 0]);
                this.helpTooltip.setPosition(evt.coordinate);

                this.helpTooltipElement.classList.remove('hidden');
            }

            let self = this;

            this.draw = new Draw({
                source: this.source,
                type: type,
                style: new Style({
                    fill: new Fill({
                        color: 'rgba(255, 255, 255, 0.4)',
                    }),
                    stroke: new Stroke({
                        color: 'rgba(255, 204, 51, 0.7)',
                        lineDash: [10, 10],
                        width: 2,
                    }),
                    image: new CircleStyle({
                        radius: 5,
                        stroke: new Stroke({
                            color: 'rgba(0, 0, 0, 0.9)',
                        }),
                        fill: new Fill({
                            color: 'rgba(255, 255, 255, 0.4)',
                        }),
                    })
                })
            });
            // lifetime: owner (each Draw interaction is created per tool and dropped on stop)
            this.draw.on('drawstart', function (evt) {
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
            });
            // lifetime: owner (each Draw interaction is created per tool and dropped on stop)
            this.draw.on('drawend', function (evt) {
                const feat = evt.feature;
                if (tool === 'point') {
                    // Point annotation: open dialog before confirming the point
                    // lifetime: defer (after OpenLayers adds the feature)
                    setTimeout(() => {
                        feat.set('measurementType', 'point');
                        feat.set('createdAt', new Date().toISOString());

                        self.openPointAnnotationDialog(feat, map, false);
                    }, 10);
                } else if (tool === 'erase') {
                    // lifetime: defer (after OpenLayers adds the feature)
                    setTimeout(() => {
                        // Delete every measurement that contains the click
                        // coordinate. We use direct geometry intersection
                        // instead of pixel-based hit detection because:
                        //   - it is independent of map render order (the
                        //     temporary Point sketch sitting on top of a
                        //     line/polygon would otherwise mask it),
                        //   - line geometries don't have area, so we widen
                        //     the hit-test by buffering the coordinate to a
                        //     small bounding box (~6 pixels worth) and
                        //     checking extent intersection for them,
                        //   - it deterministically targets only the shared
                        //     measurement source, regardless of what other
                        //     overlay layers happen to be at the same pixel.
                        const coords = feat.getGeometry().getCoordinates();
                        const view = map.getView();
                        const resolution = view.getResolution() || 1;
                        const tolerance = resolution * 6; // ~6 CSS pixels at current zoom
                        const hitBox = [
                            coords[0] - tolerance, coords[1] - tolerance,
                            coords[0] + tolerance, coords[1] + tolerance
                        ];
                        const toDelete = [];
                        self.source.forEachFeature((f) => {
                            if (f === feat) return;
                            if (!f.get('measurementType')) return;
                            const g = f.getGeometry();
                            if (!g) return;
                            // Polygons/Points: precise containment test.
                            // Lines: extent test against the buffered click.
                            if (g instanceof Polygon || g instanceof Point) {
                                if (g.intersectsCoordinate(coords)
                                    || g.intersectsExtent(hitBox)) {
                                    toDelete.push(f);
                                }
                            } else if (g instanceof LineString) {
                                if (g.intersectsExtent(hitBox)) {
                                    toDelete.push(f);
                                }
                            } else if (typeof g.intersectsExtent === 'function'
                                && g.intersectsExtent(hitBox)) {
                                toDelete.push(f);
                            }
                        });
                        toDelete.forEach((f) => self.deleteMeasurement(f));

                        // Remove the transient erase-click point itself.
                        try { self.source.removeFeature(feat); } catch { /* noop */ }

                        // Update button visibility after erase
                        self.refreshButtons();
                    }, 100);
                } else {
                    // Validate measurement: discard degenerate geometries (0m lines, 0m² areas)
                    const geom = feat.getGeometry();
                    let isDegenerate = false;
                    if (geom instanceof LineString) {
                        isDegenerate = getLength(geom) < 0.01; // less than 1cm
                    } else if (geom instanceof Polygon) {
                        isDegenerate = getArea(geom) < 0.01; // less than 1cm²
                    }

                    if (isDegenerate) {
                        // Remove degenerate measurement
                        self.source.removeFeature(feat);
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
                    feat.set('tooltipText', self.measureTooltipElement.innerHTML);
                    feat.set('createdAt', new Date().toISOString());
                    feat.set('measurementType', tool);

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
            });

            // Right-click to stop measuring (use native DOM event on map viewport)
            this._contextMenuHandler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.draw) {
                    this.draw.finishDrawing();
                }
                this.deselectCurrent();
            };
            map.getViewport().addEventListener('contextmenu', this._contextMenuHandler, true);

            map.addInteraction(this.draw);
            this.pointerMoveListener = map.on('pointermove', this.pointerMoveHandler.bind(this));

            // Show stop button when a tool is active
            this.btnStop.style.display = 'inline-block';

            // Add ESC key listener to cancel drawing
            this.keyboardListener = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    e.stopPropagation();
                    e.preventDefault();
                    // Finish current drawing if in progress
                    if (this.draw) {
                        this.draw.finishDrawing();
                    }
                    // Deselect tool and go back to normal mode
                    this.deselectCurrent();
                }
            };
            document.addEventListener('keydown', this.keyboardListener, true);

            this.onToolSelected(tool);
        } else {
            removeHandlers();
            this.selectedTool = null;
            this.onToolDeselected();
        }
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

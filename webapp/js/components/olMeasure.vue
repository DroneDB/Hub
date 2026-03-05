<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';
import Overlay from 'ol/Overlay';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Translate from 'ol/interaction/Translate';
import { defaults as defaultInteractions } from 'ol/interaction';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { LineString, Polygon, Point } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import { exportMeasurements, importMeasurements, updateFeatureTooltip } from '../libs/olMeasurementConverter';
import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Lara from '@primevue/themes/lara';
import MeasurementPropertiesDialog from './MeasurementPropertiesDialog.vue';
import PointAnnotationDialog from './PointAnnotationDialog.vue';

class MeasureControls extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const unitPref = localStorage.getItem("measureUnitPref") || "metric";

        const btnPoint = document.createElement('button');
        btnPoint.title = 'Point Annotation — Click on the map to place an annotation.';
        btnPoint.innerHTML = '<img src="' + rootPath("/images/measure-point.svg") + '"/>';
        const btnLength = document.createElement('button');
        btnLength.title = 'Measure Length — Click on the map to place points along a line. Double-click to finish. Press ESC to cancel.';
        btnLength.innerHTML = '<img src="' + rootPath("/images/measure-length.svg") + '"/>';
        const btnArea = document.createElement('button');
        btnArea.title = 'Measure Area — Click on the map to draw a polygon. Double-click to finish and calculate the area. Press ESC to cancel.';
        btnArea.innerHTML = '<img src="' + rootPath("/images/measure-area.svg") + '"/>';
        const btnErase = document.createElement('button');
        btnErase.title = 'Erase Measurement — Click on a measurement to delete it.';
        btnErase.innerHTML = '<img src="' + rootPath("/images/measure-erase.svg") + '"/>';
        const btnEdit = document.createElement('button');
        btnEdit.title = 'Edit/Move Measurements — Click and drag measurement points to reposition them.';
        btnEdit.innerHTML = '<img src="' + rootPath("/images/edit.svg") + '"/>';
        const btnStop = document.createElement('button');
        btnStop.title = 'Stop Measuring — Cancel the current measurement. Shortcut: ESC';
        btnStop.innerHTML = '<img src="' + rootPath("/images/measure-stop.svg") + '"/>';
        btnStop.style.display = 'none'; // Hidden by default, shown when a tool is active

        // Separator
        const separator = document.createElement('div');
        separator.style.display = 'inline-block';
        separator.style.width = 'var(--ddb-border-width)';
        separator.style.height = '1.75rem';
        separator.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        separator.style.margin = '0 0.25rem';
        separator.style.verticalAlign = 'middle';

        // Save/Load/Clear buttons
        const btnSave = document.createElement('button');
        btnSave.title = 'Save Measurements — Save all current measurements to the dataset.';
        btnSave.innerHTML = '<img src="' + rootPath("/images/save.svg") + '"/>';
        btnSave.style.display = 'none';

        const btnClear = document.createElement('button');
        btnClear.title = 'Clear All Measurements — Remove all measurements from the map.';
        btnClear.innerHTML = '<img src="' + rootPath("/images/eraser.svg") + '"/>';
        btnClear.style.display = 'none';

        const btnExport = document.createElement('button');
        btnExport.title = 'Export Measurements — Download measurements as a GeoJSON file.';
        btnExport.innerHTML = '<img src="' + rootPath("/images/download.svg") + '"/>';
        btnExport.style.display = 'none';

        const btnDelete = document.createElement('button');
        btnDelete.title = 'Delete Saved Measurements — Permanently delete saved measurements from the dataset.';
        btnDelete.innerHTML = '<img src="' + rootPath("/images/trash.svg") + '"/>';
        btnDelete.style.display = 'none';

        const element = document.createElement('div');
        element.className = 'ol-measure-control ol-unselectable ol-control';
        element.appendChild(btnPoint);
        element.appendChild(btnLength);
        element.appendChild(btnArea);
        element.appendChild(btnErase);
        element.appendChild(btnEdit);
        element.appendChild(btnStop);
        element.appendChild(separator);
        element.appendChild(btnSave);
        element.appendChild(btnClear);
        element.appendChild(btnExport);
        element.appendChild(btnDelete);

        super({
            element: element,
            target: options.target,
        });

        btnPoint.addEventListener('click', this.handlePointLocation.bind(this), false);
        btnLength.addEventListener('click', this.handleMeasureLength.bind(this), false);
        btnArea.addEventListener('click', this.handleMeasureArea.bind(this), false);
        btnErase.addEventListener('click', this.handleErase.bind(this), false);
        btnEdit.addEventListener('click', this.handleEdit.bind(this), false);
        btnStop.addEventListener('click', this.handleStop.bind(this), false);
        btnSave.addEventListener('click', this.handleSave.bind(this), false);
        btnClear.addEventListener('click', this.handleClearAll.bind(this), false);
        btnExport.addEventListener('click', this.handleExport.bind(this), false);
        btnDelete.addEventListener('click', this.handleDeleteSaved.bind(this), false);

        this.selectedTool = null;
        this.onToolSelected = options.onToolSelected || (() => { });
        this.onToolDeselected = options.onToolDeselected || (() => { });
        this.canWrite = options.canWrite !== undefined ? options.canWrite : true;
        this.canDelete = options.canDelete !== undefined ? options.canDelete : true;
        this.onSave = options.onSave || (() => { });
        this.onClearAll = options.onClearAll || (() => { });
        this.onExport = options.onExport || (() => { });
        this.onDeleteSaved = options.onDeleteSaved || (() => { });
        this.onRequestClearConfirm = options.onRequestClearConfirm || (() => { });
        this.onRequestDeleteConfirm = options.onRequestDeleteConfirm || (() => { });

        this.source = new VectorSource();
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
        this.btnDelete = btnDelete;
        this.separator = separator;

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

        // Undo stack for geometry modifications
        this.undoStack = [];
        this.maxUndoSteps = 50;
    }

    /**
     * Override setMap to initialize button visibility when control is added
     */
    setMap(map) {
        super.setMap(map);

        // Initialize button visibility when control is added to map
        if (map) {
            this.updateButtonsVisibility(this.hasMeasurements(), false);
        }
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
        localStorage.setItem("measureUnitPref", newUnit);
        this.unitPref = newUnit;

        // Recalculate all existing measurement tooltips
        const features = this.source.getFeatures();
        features.forEach(feature => {
            this.updateMeasurementValue(feature);
        });
    }

    /**
     * Get the current unit preference
     * @returns {string} 'metric' or 'imperial'
     */
    getUnitPref() {
        return this.unitPref;
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

    /**
     * Show or hide the management buttons
     */
    updateButtonsVisibility(hasMeasurements, hasSavedMeasurements) {
        // Only show Save button if user has write permission
        const canShowSave = this.canWrite;
        // Only show Delete button if user has delete permission
        const canShowDelete = this.canDelete;
        const displaySave = (hasMeasurements && canShowSave) ? 'block' : 'none';
        this.separator.style.display = hasMeasurements ? 'block' : 'none';
        this.btnSave.style.display = displaySave;
        this.btnClear.style.display = hasMeasurements ? 'block' : 'none';
        this.btnExport.style.display = hasMeasurements ? 'block' : 'none';
        this.btnDelete.style.display = (hasSavedMeasurements && canShowDelete) ? 'block' : 'none';
    }

    /**
     * Set the saved state (shows/hides the saved badge and delete button)
     */
    setSavedState(isSaved) {
        const hasMeasurements = this.hasMeasurements();
        this.updateButtonsVisibility(hasMeasurements, isSaved);
    }

    /**
     * Create a style for a feature based on its properties (GeoJSON styling conventions)
     * @param {ol.Feature} feature - The feature to style
     * @returns {ol.style.Style} The style for the feature
     */
    createFeatureStyle(feature) {
        // Default colors
        const defaultStroke = '#ffcc33';
        const defaultFill = 'rgba(255, 255, 255, 0.2)';
        const defaultStrokeWidth = 2;

        // Read GeoJSON style properties from feature
        const strokeColor = feature.get('stroke') || defaultStroke;
        const strokeWidth = feature.get('stroke-width') || defaultStrokeWidth;
        const strokeOpacity = feature.get('stroke-opacity') !== undefined ? feature.get('stroke-opacity') : 1;
        const fillColor = feature.get('fill') || defaultStroke;
        const fillOpacity = feature.get('fill-opacity') !== undefined ? feature.get('fill-opacity') : 0.2;

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
        const fillRgba = hexToRgba(fillColor, fillOpacity);

        return new Style({
            fill: new Fill({
                color: fillRgba,
            }),
            stroke: new Stroke({
                color: strokeRgba,
                width: strokeWidth,
            }),
            image: new CircleStyle({
                radius: 7,
                fill: new Fill({
                    color: strokeColor,
                }),
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
        this.updateButtonsVisibility(false, false);
    }

    /**
     * Export measurements to GeoJSON
     */
    exportToGeoJSON(orthophotoPath) {
        return exportMeasurements(this.source, orthophotoPath, this.unitPref);
    }

    /**
     * Import measurements from GeoJSON
     */
    importFromGeoJSON(geojson) {
        const map = this.getMap();

        // Create format functions bound to current instance
        const formatArea = (polygon) => {
            const area = getArea(polygon);
            let output;
            if (this.unitPref === 'metric') {
                if (area > 10000) {
                    output = Math.round((area / 1000000) * 100) / 100 + ' ' + 'km<sup>2</sup>';
                } else {
                    output = Math.round(area * 100) / 100 + ' ' + 'm<sup>2</sup>';
                }
            } else {
                const f = 0.00024710538146717;
                output = Math.round((area * f) * 100) / 100 + ' acres';
            }
            return output;
        };

        const formatLength = (line) => {
            const length = getLength(line);
            let output;
            if (this.unitPref === 'metric') {
                if (length > 100) {
                    output = Math.round((length / 1000) * 100) / 100 + ' ' + 'km';
                } else {
                    output = Math.round(length * 100) / 100 + ' ' + 'm';
                }
            } else {
                const f = 3.28084;
                output = Math.round((length * f) * 100) / 100 + ' ft';
            }
            return output;
        };

        const result = importMeasurements(geojson, this.source, formatArea, formatLength, map, (feature, m) => {
            this.openPointAnnotationDialog(feature, m, true);
        });

        // Update button visibility after import
        this.updateButtonsVisibility(this.hasMeasurements(), true);

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

        // Create Modify interaction for vertex editing
        this.modifyInteraction = new Modify({
            source: this.source,
            style: new Style({
                image: new CircleStyle({
                    radius: 6,
                    fill: new Fill({ color: '#ffcc33' }),
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
        this.modifyInteraction.on('modifystart', (evt) => {
            evt.features.forEach(feature => {
                this.saveToUndoStack(feature);
            });
        });

        this.translateInteraction.on('translatestart', (evt) => {
            evt.features.forEach(feature => {
                this.saveToUndoStack(feature);
            });
        });

        // Update tooltip in real-time during modification
        this.modifyInteraction.on('modifyend', (evt) => {
            evt.features.forEach(feature => {
                this.updateMeasurementValue(feature);
                this.updateTooltipPosition(feature);
            });
        });

        this.translateInteraction.on('translateend', (evt) => {
            evt.features.forEach(feature => {
                this.updateTooltipPosition(feature);
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
        this.undoStack = [];
    }

    /**
     * Save feature state to undo stack
     */
    saveToUndoStack(feature) {
        const geometry = feature.getGeometry();
        if (!geometry) return;

        // Clone geometry and save with feature reference
        const state = {
            feature: feature,
            geometry: geometry.clone(),
            tooltipText: feature.get('tooltipText')
        };

        this.undoStack.push(state);

        // Limit stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo last geometry modification
     */
    undo() {
        if (this.undoStack.length === 0) return;

        const state = this.undoStack.pop();
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
    }

    /**
     * Update measurement value and tooltip text after geometry change
     */
    updateMeasurementValue(feature) {
        const geometry = feature.getGeometry();
        const measurementType = feature.get('measurementType');

        if (!geometry || !measurementType) return;

        let output;
        if (geometry instanceof Polygon && measurementType === 'area') {
            const area = getArea(geometry);
            if (this.unitPref === 'metric') {
                if (area > 10000) {
                    output = Math.round((area / 1000000) * 100) / 100 + ' km<sup>2</sup>';
                } else {
                    output = Math.round(area * 100) / 100 + ' m<sup>2</sup>';
                }
            } else {
                const f = 0.00024710538146717;
                output = Math.round((area * f) * 100) / 100 + ' acres';
            }
        } else if (geometry instanceof LineString && measurementType === 'length') {
            const length = getLength(geometry);
            if (this.unitPref === 'metric') {
                if (length > 100) {
                    output = Math.round((length / 1000) * 100) / 100 + ' km';
                } else {
                    output = Math.round(length * 100) / 100 + ' m';
                }
            } else {
                const f = 3.28084;
                output = Math.round((length * f) * 100) / 100 + ' ft';
            }
        }

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

        const currentColor = feature.get('stroke') || '#ffcc33';
        const currentDescription = feature.get('description') || '';

        this._dialogContainer = document.createElement('div');
        document.body.appendChild(this._dialogContainer);
        this.propertiesDialogApp = createApp(PointAnnotationDialog, {
            initialColor: currentColor,
            initialDescription: currentDescription,
            onOnSave: (data) => {
                feature.set('stroke', data.color);
                feature.set('description', data.description);
                feature.changed();

                if (isEdit) {
                    // Re-create the popup to reflect new color/description
                    this.recreatePointPopup(feature, map);
                } else {
                    // First time: create the popup
                    this.createPointPopupElement(feature, map);
                    this.updateButtonsVisibility(this.hasMeasurements(), false);
                }
            },
            onOnDiscard: () => {
                if (!isEdit) {
                    // New point: remove it
                    this.source.removeFeature(feature);
                    this.updateButtonsVisibility(this.hasMeasurements(), false);
                }
            },
            onOnClose: () => {
                this.closePropertiesDialog();
            }
        });
        this.propertiesDialogApp.use(PrimeVue, { theme: { preset: Lara } });
        this.propertiesDialog = this.propertiesDialogApp.mount(this._dialogContainer);
    }

    /**
     * Create the popup overlay for a point annotation feature
     */
    createPointPopupElement(feature, map) {
        const coords = feature.getGeometry().getCoordinates();
        const [lon, lat] = toLonLat(coords);

        const ddToDms = (coordinate, posSymbol, negSymbol) => {
            const dd = Math.abs(coordinate);
            const d = Math.floor(dd);
            const m = Math.floor((dd - d) * 60);
            const s = Math.round((dd - d - m / 60) * 3600 * 100) / 100;
            const dir = coordinate >= 0 ? posSymbol : negSymbol;
            return d + '\u00B0' + (m < 10 ? '0' : '') + m + "'" + (s < 10 ? '0' : '') + s.toFixed(2) + '" ' + dir;
        };

        const dmsLat = ddToDms(lat, 'N', 'S');
        const dmsLon = ddToDms(lon, 'E', 'W');
        const ddLat = lat.toFixed(6);
        const ddLon = lon.toFixed(6);
        const description = feature.get('description') || '';

        const popupEl = document.createElement('div');
        popupEl.className = 'ol-point-popup';
        popupEl.innerHTML = this.buildPointPopupHTML(dmsLat, dmsLon, ddLat, ddLon, description);

        const popupOverlay = new Overlay({
            element: popupEl,
            offset: [0, -12],
            positioning: 'bottom-center',
            stopEvent: true,
            insertFirst: false,
        });
        popupOverlay.setPosition(coords);
        map.addOverlay(popupOverlay);

        feature.set('measureTooltipElement', popupEl);
        feature.set('measureTooltip', popupOverlay);

        this.attachPointPopupHandlers(popupEl, feature, map, ddLat, ddLon);
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
     * Build the inner HTML for a point popup
     */
    buildPointPopupHTML(dmsLat, dmsLon, ddLat, ddLon, description) {
        const descHtml = description
            ? `<div class="ol-point-popup-description">${description}</div>`
            : '';
        return `
            <div class="ol-point-popup-coords">
                <span class="ol-point-popup-dms">${dmsLat} / ${dmsLon}</span>
                <span class="ol-point-popup-dd">${ddLat} / ${ddLon}</span>
                ${descHtml}
            </div>
            <div class="ol-point-popup-actions">
                <button class="image-popup-btn ol-point-popup-edit" title="Edit annotation"><i style="margin: 0" class="fa-solid fa-pencil"></i></button>
                <button class="image-popup-btn ol-point-popup-copy" title="Copy coordinates"><i style="margin: 0" class="fa-regular fa-copy"></i></button>
                <button class="image-popup-btn ol-point-popup-delete" title="Delete point"><i style="margin: 0" class="fa-solid fa-trash"></i></button>
            </div>
        `;
    }

    /**
     * Attach event handlers to a point popup element
     */
    attachPointPopupHandlers(popupEl, feature, map, ddLat, ddLon) {
        const self = this;

        // Edit handler
        popupEl.querySelector('.ol-point-popup-edit').addEventListener('click', (e) => {
            e.preventDefault();
            self.openPointAnnotationDialog(feature, map, true);
        });

        // Copy handler
        popupEl.querySelector('.ol-point-popup-copy').addEventListener('click', (e) => {
            e.preventDefault();
            const text = `${ddLat}, ${ddLon}`;
            navigator.clipboard.writeText(text).then(() => {
                const icon = popupEl.querySelector('.ol-point-popup-copy i');
                if (icon) { icon.className = 'fa-solid fa-check'; }
                setTimeout(() => { if (icon) { icon.className = 'fa-regular fa-copy'; } }, 1500);
            });
        });

        // Delete handler
        popupEl.querySelector('.ol-point-popup-delete').addEventListener('click', (e) => {
            e.preventDefault();
            const overlay = feature.get('measureTooltip');
            if (overlay) map.removeOverlay(overlay);
            if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
            self.source.removeFeature(feature);
            self.updateButtonsVisibility(self.hasMeasurements(), false);
        });
    }

    /**
     * Open properties dialog for a feature
     */
    openPropertiesDialog(feature) {
        // Close any existing dialog
        this.closePropertiesDialog();

        const geometry = feature.getGeometry();
        const geometryType = geometry ? geometry.getType() : 'LineString';

        // Create Vue 3 app instance
        this._dialogContainer = document.createElement('div');
        document.body.appendChild(this._dialogContainer);
        this.propertiesDialogApp = createApp(MeasurementPropertiesDialog, {
            feature: feature,
            geometryType: geometryType,
            onOnSave: (properties) => {
                // Update feature properties
                Object.keys(properties).forEach(key => {
                    feature.set(key, properties[key]);
                });

                // Update tooltip with new name
                updateFeatureTooltip(feature);

                // Trigger re-render for style changes
                feature.changed();
            },
            onOnClose: () => {
                this.closePropertiesDialog();
            }
        });
        this.propertiesDialogApp.use(PrimeVue, { theme: { preset: Lara } });
        this.propertiesDialog = this.propertiesDialogApp.mount(this._dialogContainer);
    }

    /**
     * Close properties dialog
     */
    closePropertiesDialog() {
        if (this.propertiesDialogApp) {
            this.propertiesDialogApp.unmount();
            if (this._dialogContainer && this._dialogContainer.parentNode) {
                this._dialogContainer.parentNode.removeChild(this._dialogContainer);
            }
            this.propertiesDialogApp = null;
            this.propertiesDialog = null;
            this._dialogContainer = null;
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

        const removeHandlers = () => {
            if (!this.loaded) return;

            this.helpTooltipElement.classList.add('hidden');
            map.removeInteraction(this.draw);
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
                this.helpTooltipElement.className = 'ol-tooltip hidden';
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

            const formatArea = function (polygon) {
                const area = getArea(polygon);
                let output;
                if (this.unitPref === 'metric') {
                    if (area > 10000) {
                        output = Math.round((area / 1000000) * 100) / 100 + ' ' + 'km<sup>2</sup>';
                    } else {
                        output = Math.round(area * 100) / 100 + ' ' + 'm<sup>2</sup>';
                    }
                } else {
                    const f = 0.00024710538146717; // m2 to acres
                    output = Math.round((area * f) * 100) / 100 + ' acres';
                }
                return output;
            };

            const formatLength = function (line) {
                const length = getLength(line);
                let output;
                if (this.unitPref === 'metric') {
                    if (length > 100) {
                        output = Math.round((length / 1000) * 100) / 100 + ' ' + 'km';
                    } else {
                        output = Math.round(length * 100) / 100 + ' ' + 'm';
                    }
                } else {
                    const f = 3.28084; // meters to feet
                    output = Math.round((length * f) * 100) / 100 + ' ft';
                }
                return output;
            };

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
            this.draw.on('drawstart', function (evt) {
                sketch = evt.feature;
                let tooltipCoord = evt.coordinate;

                listener = sketch.getGeometry().on('change', function (evt) {
                    const geom = evt.target;
                    let output;
                    if (geom instanceof Polygon) {
                        output = formatArea.call(self, geom);
                        tooltipCoord = geom.getInteriorPoint().getCoordinates();
                    } else if (geom instanceof LineString) {
                        output = formatLength.call(self, geom);
                        tooltipCoord = geom.getLastCoordinate();
                    }
                    self.measureTooltipElement.innerHTML = output;
                    self.measureTooltip.setPosition(tooltipCoord);
                });
            });
            this.draw.on('drawend', function (evt) {
                const feat = evt.feature;
                if (tool === 'point') {
                    // Point annotation: open dialog before confirming the point
                    setTimeout(() => {
                        feat.set('measurementType', 'point');
                        feat.set('createdAt', new Date().toISOString());

                        self.openPointAnnotationDialog(feat, map, false);
                    }, 10);
                } else if (tool === 'erase') {
                    setTimeout(() => {
                        // Delete the feature and everything it touches
                        const coords = feat.getGeometry().getCoordinates();
                        map.forEachFeatureAtPixel(map.getPixelFromCoordinate(coords, {
                            layerFilter: l => l === self.source,
                            hitTolerance: 4
                        }), f => {
                            if (f.get('measureTooltipElement') !== undefined) {
                                const tooltipElem = f.get('measureTooltipElement');
                                if (tooltipElem && tooltipElem.parentNode) {
                                    tooltipElem.parentNode.removeChild(tooltipElem);
                                }
                                self.source.removeFeature(f);
                            }
                        });

                        self.source.removeFeature(feat);

                        // Update button visibility after erase
                        self.updateButtonsVisibility(self.hasMeasurements(), false);
                    }, 100);
                } else {
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
                    setTimeout(() => {
                        const hasMeasurements = self.hasMeasurements();
                        self.updateButtonsVisibility(hasMeasurements, false);
                    }, 10);
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

export default {
    Controls: MeasureControls
};
</script>
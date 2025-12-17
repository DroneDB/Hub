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
import { exportMeasurements, importMeasurements, updateFeatureTooltip } from '../libs/olMeasurementConverter';
import Vue from 'vue';
import MeasurementPropertiesDialog from './MeasurementPropertiesDialog.vue';

class MeasureControls extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const unitPref = localStorage.getItem("measureUnitPref") || "metric";

        const btnLength = document.createElement('button');
        btnLength.innerHTML = '<img title="Measure Length" src="' + rootPath("/images/measure-length.svg") + '"/>';
        const btnArea = document.createElement('button');
        btnArea.innerHTML = '<img title="Measure Area" src="' + rootPath("/images/measure-area.svg") + '"/>';
        const btnErase = document.createElement('button');
        btnErase.innerHTML = '<img title="Erase Measurement" src="' + rootPath("/images/measure-erase.svg") + '"/>';
        const btnEdit = document.createElement('button');
        btnEdit.innerHTML = '<img title="Edit/Move Measurements" src="' + rootPath("/images/edit.svg") + '"/>';
        const btnStop = document.createElement('button');
        btnStop.innerHTML = '<img title="Stop Measuring (ESC)" src="' + rootPath("/images/measure-stop.svg") + '"/>';
        btnStop.style.display = 'none'; // Hidden by default, shown when a tool is active
        const btnUnits = document.createElement('button');
        btnUnits.innerHTML = '<img title="Change Units" src="' + rootPath("/images/measure-units.svg") + '"/>';

        const unitDiv = document.createElement('div');
        unitDiv.style.display = 'none';
        unitDiv.style.float = 'right';
        const unitSelect = document.createElement('select');
        unitSelect.style.marginRight = '2px';
        unitSelect.innerHTML = '<option value="metric" ' + (unitPref === 'metric' ? 'selected' : '') + '>Metric</option>' +
            '<option value="imperial" ' + (unitPref === 'imperial' ? 'selected' : '') + '>Imperial</option>';
        unitDiv.appendChild(unitSelect);

        // Separator
        const separator = document.createElement('div');
        separator.style.display = 'inline-block';
        separator.style.width = '1px';
        separator.style.height = '26px';
        separator.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        separator.style.margin = '0 4px';
        separator.style.verticalAlign = 'middle';

        // Save/Load/Clear buttons
        const btnSave = document.createElement('button');
        btnSave.innerHTML = '<img title="Save Measurements" src="' + rootPath("/images/save.svg") + '"/>';
        btnSave.style.display = 'none';

        const btnClear = document.createElement('button');
        btnClear.innerHTML = '<img title="Clear All Measurements" src="' + rootPath("/images/eraser.svg") + '"/>';
        btnClear.style.display = 'none';

        const btnExport = document.createElement('button');
        btnExport.innerHTML = '<img title="Export Measurements" src="' + rootPath("/images/download.svg") + '"/>';
        btnExport.style.display = 'none';

        const btnDelete = document.createElement('button');
        btnDelete.innerHTML = '<img title="Delete Saved Measurements" src="' + rootPath("/images/trash.svg") + '"/>';
        btnDelete.style.display = 'none';

        const element = document.createElement('div');
        element.className = 'ol-measure-control ol-unselectable ol-control';
        element.appendChild(btnLength);
        element.appendChild(btnArea);
        element.appendChild(btnErase);
        element.appendChild(btnEdit);
        element.appendChild(btnStop);
        element.appendChild(unitDiv);
        element.appendChild(btnUnits);
        element.appendChild(separator);
        element.appendChild(btnSave);
        element.appendChild(btnClear);
        element.appendChild(btnExport);
        element.appendChild(btnDelete);

        super({
            element: element,
            target: options.target,
        });

        btnLength.addEventListener('click', this.handleMeasureLength.bind(this), false);
        btnArea.addEventListener('click', this.handleMeasureArea.bind(this), false);
        btnErase.addEventListener('click', this.handleErase.bind(this), false);
        btnEdit.addEventListener('click', this.handleEdit.bind(this), false);
        btnStop.addEventListener('click', this.handleStop.bind(this), false);
        btnUnits.addEventListener('click', this.handleToggleUnits.bind(this), false);
        unitSelect.addEventListener('change', this.handleChangeUnits.bind(this), false);
        btnSave.addEventListener('click', this.handleSave.bind(this), false);
        btnClear.addEventListener('click', this.handleClearAll.bind(this), false);
        btnExport.addEventListener('click', this.handleExport.bind(this), false);
        btnDelete.addEventListener('click', this.handleDeleteSaved.bind(this), false);

        this.selectedTool = null;
        this.onToolSelected = options.onToolSelected || (() => { });
        this.onToolDeselected = options.onToolDeselected || (() => { });
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

        this.unitDiv = unitDiv;
        this.unitSelect = unitSelect;
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

    handleChangeUnits() {
        localStorage.setItem("measureUnitPref", this.unitSelect.value);
        this.unitPref = this.unitSelect.value;
    }

    handleToggleUnits() {
        this.unitDiv.style.display = this.unitDiv.style.display === 'none' ? 'inline-block' : 'none';
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
        const display = hasMeasurements ? 'block' : 'none';
        this.separator.style.display = display;
        this.btnSave.style.display = display;
        this.btnClear.style.display = display;
        this.btnExport.style.display = display;
        this.btnDelete.style.display = hasSavedMeasurements ? 'block' : 'none';
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

        const result = importMeasurements(geojson, this.source, formatArea, formatLength, map);

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
                this.disableEditMode();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
        };
        document.addEventListener('keydown', this.keyboardListener);
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
            document.removeEventListener('keydown', this.keyboardListener);
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
     * Open properties dialog for a feature
     */
    openPropertiesDialog(feature) {
        // Close any existing dialog
        this.closePropertiesDialog();

        const geometry = feature.getGeometry();
        const geometryType = geometry ? geometry.getType() : 'LineString';

        // Create Vue component instance
        const DialogComponent = Vue.extend(MeasurementPropertiesDialog);
        this.propertiesDialog = new DialogComponent({
            propsData: {
                feature: feature,
                geometryType: geometryType
            }
        });

        this.propertiesDialog.$mount();
        document.body.appendChild(this.propertiesDialog.$el);

        // Handle save
        this.propertiesDialog.$on('onSave', (properties) => {
            // Update feature properties
            Object.keys(properties).forEach(key => {
                feature.set(key, properties[key]);
            });

            // Update tooltip with new name
            updateFeatureTooltip(feature);

            // Trigger re-render for style changes
            feature.changed();
        });

        // Handle close
        this.propertiesDialog.$on('onClose', () => {
            this.closePropertiesDialog();
        });
    }

    /**
     * Close properties dialog
     */
    closePropertiesDialog() {
        if (this.propertiesDialog) {
            if (this.propertiesDialog.$el && this.propertiesDialog.$el.parentNode) {
                this.propertiesDialog.$el.parentNode.removeChild(this.propertiesDialog.$el);
            }
            this.propertiesDialog.$destroy();
            this.propertiesDialog = null;
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

            // Remove keyboard listener
            if (this.keyboardListener) {
                document.removeEventListener('keydown', this.keyboardListener);
                this.keyboardListener = null;
            }

            // Hide stop button
            this.btnStop.style.display = 'none';
        };        if (!this.selectedTool || this.selectedTool !== tool) {
            if (this.selectedTool !== tool) removeHandlers();

            const types = {
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
                if (tool === 'erase') helpMsg = 'Click a measurement to remove it. Press ESC to exit';
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
                if (tool === 'erase') {
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

            map.addInteraction(this.draw);
            this.pointerMoveListener = map.on('pointermove', this.pointerMoveHandler.bind(this));

            // Show stop button when a tool is active
            this.btnStop.style.display = 'inline-block';

            // Add ESC key listener to cancel drawing
            this.keyboardListener = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    // Finish current drawing if in progress
                    if (this.draw) {
                        this.draw.finishDrawing();
                    }
                    // Deselect tool and go back to normal mode
                    this.deselectCurrent();
                }
            };
            document.addEventListener('keydown', this.keyboardListener);

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
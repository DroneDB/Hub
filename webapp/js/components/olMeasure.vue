<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';
import Overlay from 'ol/Overlay';
import Draw from 'ol/interaction/Draw';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { LineString, Polygon, Point } from 'ol/geom';
import { exportMeasurements, importMeasurements } from '../libs/olMeasurementConverter';

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
            style: new Style({
                fill: new Fill({
                    color: 'rgba(255, 255, 255, 0.2)',
                }),
                stroke: new Stroke({
                    color: '#ffcc33',
                    width: 2,
                }),
                image: new CircleStyle({
                    radius: 7,
                    fill: new Fill({
                        color: '#ffcc33',
                    }),
                }),
            }),
        });

        this.unitDiv = unitDiv;
        this.unitSelect = unitSelect;
        this.unitPref = unitPref;

        // Store button references
        this.btnStop = btnStop;
        this.btnSave = btnSave;
        this.btnClear = btnClear;
        this.btnExport = btnExport;
        this.btnDelete = btnDelete;
        this.separator = separator;

        // Store keyboard listener reference
        this.keyboardListener = null;
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
     * Clear all measurements from the map
     */
    clearAllMeasurements() {
        const features = this.source.getFeatures();

        // Remove tooltip overlays
        features.forEach(feature => {
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

    deselectCurrent() {
        if (this.selectedTool) this.onSelect(this.selectedTool);
    }

    getLayer() {
        return this.vector;
    }

    onSelect(tool) {
        const map = this.getMap();
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
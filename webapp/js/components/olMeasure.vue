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

        const element = document.createElement('div');
        element.className = 'ol-measure-control ol-unselectable ol-control';
        element.appendChild(btnLength);
        element.appendChild(btnArea);
        element.appendChild(btnErase);
        element.appendChild(unitDiv);
        element.appendChild(btnUnits);

        super({
            element: element,
            target: options.target,
        });

        btnLength.addEventListener('click', this.handleMeasureLength.bind(this), false);
        btnArea.addEventListener('click', this.handleMeasureArea.bind(this), false);
        btnErase.addEventListener('click', this.handleErase.bind(this), false);
        btnUnits.addEventListener('click', this.handleToggleUnits.bind(this), false);
        unitSelect.addEventListener('change', this.handleChangeUnits.bind(this), false);

        this.selectedTool = null;
        this.onToolSelected = options.onToolSelected || (() => { });
        this.onToolDelesected = options.onToolDelesected || (() => { });

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

    handleChangeUnits() {
        localStorage.setItem("measureUnitPref", this.unitSelect.value);
        this.unitPref = this.unitSelect.value;
    }

    handleToggleUnits() {
        this.unitDiv.style.display = this.unitDiv.style.display === 'none' ? 'inline-block' : 'none';
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
        };

        if (!this.selectedTool || this.selectedTool !== tool) {
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

                let helpMsg = 'Click to start drawing';
                if (tool === 'erase') helpMsg = 'Click a measurement to remove it';
                else if (sketch) {
                    const geom = sketch.getGeometry();
                    if (geom instanceof Polygon) {
                        helpMsg = 'Click to continue drawing the polygon';
                    } else if (geom instanceof LineString) {
                        helpMsg = 'Click to continue drawing the line';
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
                            if (f.measureTooltipElement !== undefined) {
                                f.measureTooltipElement.parentNode.removeChild(f.measureTooltipElement);
                                f.measureTooltipElement = null;
                                self.source.removeFeature(f);
                            }
                        });

                        self.source.removeFeature(feat);
                    }, 100);
                } else {
                    // Create new meaasurement tooltip, save ref to existing one
                    self.measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
                    self.measureTooltip.setOffset([0, -7]);
                    feat.measureTooltipElement = self.measureTooltipElement;
                    self.measureTooltipElement = null;
                    self.createMeasureTooltipElement(map);
                }

                sketch = null;
                unByKey(listener);
            });

            map.addInteraction(this.draw);
            this.pointerMoveListener = map.on('pointermove', this.pointerMoveHandler.bind(this));
            this.onToolSelected(tool);
        } else {
            removeHandlers();
            this.selectedTool = null;
            this.onToolDelesected();
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
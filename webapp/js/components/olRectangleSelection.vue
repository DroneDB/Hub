<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';
import Draw, { createBox } from 'ol/interaction/Draw';
import { Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';

class RectangleSelectionControl extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     * @param {Function} opt_options.onSelectionComplete - Called with the drawn rectangle geometry when drawing finishes.
     * @param {Function} opt_options.onActivated - Called when the control is activated.
     * @param {Function} opt_options.onDeactivated - Called when the control is deactivated.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const btn = document.createElement('button');
        btn.title = 'Rectangle Selection — Click to activate, then click and drag on the map to draw a rectangle. All features inside will be selected. Press ESC or click this button again to cancel.';
        btn.innerHTML = '<img src="' + rootPath("/images/rectangle-selection.svg") + '"/>';

        const element = document.createElement('div');
        element.className = 'ol-rectangle-selection ol-unselectable ol-control';
        element.appendChild(btn);

        super({
            element: element,
            target: options.target,
        });

        this.btn = btn;
        this.active = false;
        this.draw = null;
        this.selectionLayer = null;
        this.selectionSource = null;
        this.onSelectionComplete = options.onSelectionComplete || (() => {});
        this.onActivated = options.onActivated || (() => {});
        this.onDeactivated = options.onDeactivated || (() => {});

        // Dashed rectangle style (same as polygon selection)
        this.drawingStyle = new Style({
            fill: new Fill({
                color: 'rgba(255, 255, 255, 0.2)'
            }),
            stroke: new Stroke({
                color: 'rgba(255, 255, 255, 0.9)',
                lineDash: [10, 10],
                width: 2
            })
        });

        btn.addEventListener('click', () => {
            if (this.active) {
                this.deactivate();
            } else {
                this.activate();
            }
        });
    }

    /**
     * Activate the rectangle selection mode.
     */
    activate() {
        if (this.active) return;

        const map = this.getMap();
        if (!map) return;

        this.active = true;
        this.btn.classList.add('active');

        // Notify caller that rectangle selection is being activated
        this.onActivated();

        // Create selection layer for drawn rectangle
        this.selectionSource = new VectorSource();
        this.selectionLayer = new VectorLayer({
            source: this.selectionSource,
            style: this.drawingStyle
        });
        map.addLayer(this.selectionLayer);

        // Create draw interaction with box geometry function
        this.draw = new Draw({
            source: this.selectionSource,
            type: 'Circle',
            geometryFunction: createBox(),
            style: this.drawingStyle
        });

        this.draw.on('drawend', (e) => {
            const polygon = e.feature.getGeometry();

            // Remove draw interaction after drawing completes
            map.removeInteraction(this.draw);
            this.draw = null;

            // Notify caller about the completed selection
            this.onSelectionComplete(polygon);
        });

        map.addInteraction(this.draw);
    }

    /**
     * Deactivate the rectangle selection mode and clean up.
     */
    deactivate() {
        if (!this.active) return;

        const map = this.getMap();
        this.active = false;
        this.btn.classList.remove('active');

        if (map) {
            // Remove draw interaction
            if (this.draw) {
                map.removeInteraction(this.draw);
                this.draw = null;
            }

            // Remove selection layer with drawn rectangle
            if (this.selectionLayer) {
                map.removeLayer(this.selectionLayer);
                this.selectionLayer = null;
                this.selectionSource = null;
            }
        }

        this.onDeactivated();
    }

    /**
     * Check if the control is currently active.
     * @returns {boolean}
     */
    isActive() {
        return this.active;
    }
}

export default { Control: RectangleSelectionControl };
</script>

<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';
import Draw from 'ol/interaction/Draw';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';

class PolygonSelectionControl extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     * @param {Function} opt_options.onSelectionComplete - Called with the drawn polygon geometry when drawing finishes.
     * @param {Function} opt_options.onDeactivated - Called when the control is deactivated.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const btn = document.createElement('button');
        btn.title = 'Polygon Selection — Click to activate, then click on the map to draw a polygon. Close the polygon by clicking the first point or right-click to finish. All features inside will be selected. Press ESC or click this button again to cancel.';
        btn.innerHTML = '<img src="' + rootPath("/images/polygon-selection.svg") + '"/>';

        const element = document.createElement('div');
        element.className = 'ol-polygon-selection ol-unselectable ol-control';
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
        this.contextMenuHandler = null;

        // Dashed polygon style
        this.drawingStyle = new Style({
            fill: new Fill({
                color: 'rgba(255, 255, 255, 0.2)'
            }),
            stroke: new Stroke({
                color: 'rgba(255, 255, 255, 0.9)',
                lineDash: [10, 10],
                width: 2
            }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: 'rgba(255, 255, 255, 0.9)' }),
                stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.5)', width: 1.5 })
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
     * Activate the polygon selection mode.
     */
    activate() {
        if (this.active) return;

        const map = this.getMap();
        if (!map) return;

        this.active = true;
        this.btn.classList.add('active');

        // Notify caller that polygon selection is being activated
        this.onActivated();

        // Create selection layer for drawn polygon
        this.selectionSource = new VectorSource();
        this.selectionLayer = new VectorLayer({
            source: this.selectionSource,
            style: this.drawingStyle
        });
        map.addLayer(this.selectionLayer);

        // Create draw interaction
        this.draw = new Draw({
            source: this.selectionSource,
            type: 'Polygon',
            style: this.drawingStyle
        });

        // Handle right-click to finish drawing
        this.contextMenuHandler = (e) => {
            if (this.active && this.draw) {
                e.preventDefault();
                e.stopPropagation();
                // finishDrawing only works if there are at least 3 points (to form a valid polygon)
                try {
                    this.draw.finishDrawing();
                } catch (err) {
                    // Not enough points to finish, ignore
                }
            }
        };
        map.getTargetElement().addEventListener('contextmenu', this.contextMenuHandler);

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
     * Deactivate the polygon selection mode and clean up.
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

            // Remove selection layer with drawn polygon
            if (this.selectionLayer) {
                map.removeLayer(this.selectionLayer);
                this.selectionLayer = null;
                this.selectionSource = null;
            }

            // Remove contextmenu handler
            if (this.contextMenuHandler) {
                map.getTargetElement().removeEventListener('contextmenu', this.contextMenuHandler);
                this.contextMenuHandler = null;
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

export default { Control: PolygonSelectionControl };
</script>

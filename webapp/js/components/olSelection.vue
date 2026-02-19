<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';
import Draw, { createBox } from 'ol/interaction/Draw';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Vector as VectorSource } from 'ol/source';
import { Vector as VectorLayer } from 'ol/layer';

/**
 * Unified selection control that groups rectangle and polygon selection
 * into a single OpenLayers control container.
 */
class SelectionControl extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     * @param {Function} opt_options.onSelectionComplete - Called with the drawn geometry when drawing finishes.
     * @param {Function} opt_options.onActivated - Called when any selection mode is activated.
     * @param {Function} opt_options.onDeactivated - Called when the active selection mode is deactivated.
     * @param {Function} opt_options.onClearSelection - Called when the clear selection button is clicked.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        // Rectangle selection button
        const btnRectangle = document.createElement('button');
        btnRectangle.title = 'Rectangle Selection — Click to activate, then click and drag on the map to draw a rectangle. All features inside will be selected. Press ESC or click this button again to cancel.';
        btnRectangle.innerHTML = '<img src="' + rootPath("/images/rectangle-selection.svg") + '"/>';

        // Polygon selection button
        const btnPolygon = document.createElement('button');
        btnPolygon.title = 'Polygon Selection — Click to activate, then click on the map to draw a polygon. Close the polygon by clicking the first point. Right-click to cancel the current drawing. Press ESC or click this button again to deactivate.';
        btnPolygon.innerHTML = '<img src="' + rootPath("/images/polygon-selection.svg") + '"/>';

        // Clear selection button (hidden by default, shown when there's an active selection)
        const btnClear = document.createElement('button');
        btnClear.title = 'Clear Selection — Deselect all selected features.';
        btnClear.innerHTML = '<img src="' + rootPath("/images/clear-selection.svg") + '"/>';
        btnClear.style.display = 'none';

        // Single container for all buttons
        const element = document.createElement('div');
        element.className = 'ol-selection ol-unselectable ol-control';
        element.appendChild(btnRectangle);
        element.appendChild(btnPolygon);
        element.appendChild(btnClear);

        super({
            element: element,
            target: options.target,
        });

        this.btnRectangle = btnRectangle;
        this.btnPolygon = btnPolygon;
        this.btnClear = btnClear;
        this.activeMode = null; // null | 'rectangle' | 'polygon'
        this.draw = null;
        this.selectionLayer = null;
        this.selectionSource = null;
        this.contextMenuHandler = null;
        this.onSelectionComplete = options.onSelectionComplete || (() => {});
        this.onActivated = options.onActivated || (() => {});
        this.onDeactivated = options.onDeactivated || (() => {});
        this.onClearSelection = options.onClearSelection || (() => {});

        // Shared dashed drawing style
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

        btnRectangle.addEventListener('click', () => {
            if (this.activeMode === 'rectangle') {
                this.deactivate();
            } else {
                this._activateMode('rectangle');
            }
        });

        btnPolygon.addEventListener('click', () => {
            if (this.activeMode === 'polygon') {
                this.deactivate();
            } else {
                this._activateMode('polygon');
            }
        });

        btnClear.addEventListener('click', () => {
            this.deactivate();
            this.onClearSelection();
        });
    }

    /**
     * Activate a specific selection mode.
     * @param {'rectangle'|'polygon'} mode
     * @private
     */
    _activateMode(mode) {
        // Deactivate current mode without firing onDeactivated callback
        if (this.activeMode) {
            this._cleanupDraw();
            this._updateButtonStates(null);
        }

        const map = this.getMap();
        if (!map) return;

        this.activeMode = mode;
        this._updateButtonStates(mode);

        // Notify caller that selection is being activated
        this.onActivated();

        // Create selection layer (used for visual feedback during drawing)
        this.selectionSource = new VectorSource();
        this.selectionLayer = new VectorLayer({
            source: this.selectionSource,
            style: this.drawingStyle
        });
        map.addLayer(this.selectionLayer);

        // Set up the draw interaction
        this._setupDrawInteraction(map, mode);
    }

    /**
     * Create and attach the draw interaction for the given mode.
     * @param {import('ol/Map').default} map
     * @param {'rectangle'|'polygon'} mode
     * @private
     */
    _setupDrawInteraction(map, mode) {
        // Create draw interaction based on mode
        if (mode === 'rectangle') {
            this.draw = new Draw({
                source: this.selectionSource,
                type: 'Circle',
                geometryFunction: createBox(),
                style: this.drawingStyle
            });
        } else {
            this.draw = new Draw({
                source: this.selectionSource,
                type: 'Polygon',
                style: this.drawingStyle
            });
        }

        // Right-click cancels the current drawing and restarts the interaction
        this.contextMenuHandler = (e) => {
            if (this.activeMode && this.draw) {
                e.preventDefault();
                e.stopPropagation();

                // Abort current drawing
                this.draw.abortDrawing();

                // Clear any partial geometry
                if (this.selectionSource) this.selectionSource.clear();

                // Re-create draw interaction for a fresh start
                const currentMode = this.activeMode;
                map.removeInteraction(this.draw);
                this.draw = null;

                map.getTargetElement().removeEventListener('contextmenu', this.contextMenuHandler);
                this.contextMenuHandler = null;

                if (currentMode) {
                    this._setupDrawInteraction(map, currentMode);
                }
            }
        };
        map.getTargetElement().addEventListener('contextmenu', this.contextMenuHandler);

        this.draw.on('drawend', (e) => {
            const polygon = e.feature.getGeometry();

            // Notify caller about the completed selection (additive — no clear)
            this.onSelectionComplete(polygon);

            // Clear the drawn geometry after a tick (feature is added to source after drawend)
            setTimeout(() => {
                if (this.selectionSource) this.selectionSource.clear();
            }, 0);

            // Re-create draw interaction to allow successive selections
            const currentMode = this.activeMode;
            map.removeInteraction(this.draw);
            this.draw = null;

            // Clean up contextmenu handler before re-setup (polygon mode)
            if (this.contextMenuHandler) {
                map.getTargetElement().removeEventListener('contextmenu', this.contextMenuHandler);
                this.contextMenuHandler = null;
            }

            // Only re-setup if still active (user might have clicked deactivate)
            if (currentMode) {
                this._setupDrawInteraction(map, currentMode);
            }
        });

        map.addInteraction(this.draw);
    }

    /**
     * Update button active states.
     * @param {string|null} activeMode
     * @private
     */
    _updateButtonStates(activeMode) {
        this.btnRectangle.classList.toggle('active', activeMode === 'rectangle');
        this.btnPolygon.classList.toggle('active', activeMode === 'polygon');
    }

    /**
     * Clean up draw interaction and selection layer.
     * @private
     */
    _cleanupDraw() {
        const map = this.getMap();

        if (map) {
            if (this.draw) {
                map.removeInteraction(this.draw);
                this.draw = null;
            }

            if (this.selectionLayer) {
                map.removeLayer(this.selectionLayer);
                this.selectionLayer = null;
                this.selectionSource = null;
            }

            if (this.contextMenuHandler) {
                map.getTargetElement().removeEventListener('contextmenu', this.contextMenuHandler);
                this.contextMenuHandler = null;
            }
        }
    }

    /**
     * Deactivate the current selection mode and clean up.
     */
    deactivate() {
        if (!this.activeMode) return;

        this.activeMode = null;
        this._updateButtonStates(null);
        this._cleanupDraw();
        this.onDeactivated();
    }

    /**
     * Check if any selection mode is currently active.
     * @returns {boolean}
     */
    isActive() {
        return this.activeMode !== null;
    }

    /**
     * Get the currently active mode.
     * @returns {string|null} 'rectangle', 'polygon', or null
     */
    getActiveMode() {
        return this.activeMode;
    }

    /**
     * Show or hide the clear selection button.
     * @param {boolean} visible
     */
    setClearButtonVisible(visible) {
        this.btnClear.style.display = visible ? '' : 'none';
    }
}

export default { Control: SelectionControl };
</script>

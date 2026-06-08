/**
 * Reusable on-map analysis buttons (Plant Health, Raster Analysis,
 * Stockpile Volume) shared by Map.vue and SingleMap.vue.
 *
 * Both views render an OL custom Control with the same family of buttons.
 * The host wires the click handlers to its own panel-toggling methods so
 * the composable stays unaware of which Vuex/refs back the panels.
 *
 * Host requirements:
 *  - this.map (OL Map instance) - the control will be added to it
 *  - this.files (Map.vue) OR this.entry (SingleMap.vue) - resolved via
 *    `getAnalysisEntry(predicate)` so this composable does not have to
 *    know which view is hosting it.
 *  - methods: openPlantHealth, closePlantHealth, openRasterAnalysis,
 *    closeRasterAnalysis, openStockpileVolume, closeStockpileVolume
 *  - state flags: plantHealthVisible, rasterPanelVisible,
 *    stockpilePanelVisible
 */
import { Control } from 'ol/control';
import { isPlantHealthCapable, isRasterAnalysisCapable } from '@/libs/entryTypes';

function makeButton(title, iconClass, onClick, testId = null) {
    const btn = document.createElement('button');
    btn.title = title;
    btn.innerHTML = `<i class="${iconClass}"></i>`;
    if (testId) btn.setAttribute('data-testid', testId);
    btn.addEventListener('click', onClick);
    return btn;
}

export default {
    methods: {
        /**
         * Creates the left/right toolbar zone containers inside the map's
         * stop-event overlay container and stores references on the instance
         * (`_zoneTopLeft`, `_zoneTopRight`, `_zoneBottomLeft`). Controls are
         * re-parented into these flex columns so they stack without ever
         * overlapping. Safe to call once after the OL Map has been created.
         */
        createControlZones() {
            if (!this.map) return;
            const stop = this.map.getOverlayContainerStopEvent();
            const make = (cls) => {
                const el = document.createElement('div');
                el.className = 'ol-zone ' + cls;
                stop.appendChild(el);
                return el;
            };
            this._zoneTopLeft = make('ol-zone-top-left');
            this._zoneTopRight = make('ol-zone-top-right');
            this._zoneBottomLeft = make('ol-zone-bottom-left');
        },

        /**
         * Moves an already-added OL control's root element into a toolbar
         * zone. Used for controls constructed before the zones exist.
         */
        moveControlToZone(control, zone) {
            if (control && control.element && zone) zone.appendChild(control.element);
        },

        /**
         * Append the analysis buttons (Plant Health / Raster Analysis /
         * Stockpile Volume) to an existing OL controls container. Use this
         * when the host already builds a container with other buttons (e.g.
         * SingleMap's "Back / Reset / Fullscreen" cluster).
         *
         * @param {HTMLElement} container - DOM element receiving the buttons
         * @param {Function} getEntry - (predicate) => entry|null. Returns the
         *   entry the panel should open for, or null if no capable entry
         *   exists in the current view.
         */
        appendAnalysisButtonsToContainer(container, getEntry) {
            const phEntry = getEntry(isPlantHealthCapable);
            if (phEntry) {
                container.appendChild(makeButton(
                    'Plant Health',
                    'fa-solid fa-leaf',
                    () => this._toggleAnalysisPanel('plantHealth', phEntry),
                    'plant-health-toolbar-btn'));
            }

            const raEntry = getEntry(isRasterAnalysisCapable);
            if (raEntry) {
                container.appendChild(makeButton(
                    'Raster Analysis',
                    'fa-solid fa-chart-area',
                    () => this._toggleAnalysisPanel('rasterAnalysis', raEntry),
                    'raster-analysis-toolbar-btn'));

                container.appendChild(makeButton(
                    'Stockpile Volume',
                    'fa-solid fa-layer-group',
                    () => this._toggleAnalysisPanel('stockpile', raEntry),
                    'stockpile-toolbar-btn'));
            }
        },

        /**
         * Build a standalone OL Control with the analysis buttons and add it
         * to the map. Used by Map.vue, which does not have a pre-existing
         * top-right cluster.
         *
         * @param {Function} getEntry - see appendAnalysisButtonsToContainer
         * @param {HTMLElement} [target] - optional zone container the control
         *   should render into (left/right toolbar zone). When omitted the
         *   control falls back to OpenLayers' default overlay container.
         * @returns {Control|null} The created control, or null if no buttons
         *   apply (in which case the container is not added to the map).
         */
        addAnalysisButtonsControl(getEntry, target = null) {
            if (!this.map) return null;
            const container = document.createElement('div');
            container.className = 'ol-map-analysis-buttons ol-unselectable ol-control';
            this.appendAnalysisButtonsToContainer(container, getEntry);
            if (!container.children.length) return null;
            const ctrl = new Control(target ? { element: container, target } : { element: container });
            this.map.addControl(ctrl);
            this._analysisButtonsControl = ctrl;
            return ctrl;
        },

        /**
         * Generic open/close router. Centralized here so the open-this /
         * close-that behaviour stays consistent across both viewers.
         */
        _toggleAnalysisPanel(kind, entry) {
            if (kind === 'plantHealth') {
                if (this.plantHealthVisible) {
                    this.closePlantHealth();
                } else {
                    if (this.rasterPanelVisible) this.closeRasterAnalysis();
                    this.openPlantHealth(entry);
                }
            } else if (kind === 'rasterAnalysis') {
                if (this.rasterPanelVisible) {
                    this.closeRasterAnalysis();
                } else {
                    if (this.plantHealthVisible) this.closePlantHealth();
                    this.openRasterAnalysis(entry);
                }
            } else if (kind === 'stockpile') {
                if (this.stockpilePanelVisible) {
                    this.closeStockpileVolume();
                } else {
                    this.openStockpileVolume(entry);
                }
            }
        }
    }
};

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
            this._zoneTopCenter = make('ol-zone-top-center');
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
        appendAnalysisButtonsToContainer(container, getEntry, options = {}) {
            // Plant Health is skipped here when the host view renders per-layer
            // buttons in the opacity panel instead (Map.vue passes skipPlantHealth:true).
            // SingleMap.vue does NOT pass this option, so the button appears there.
            if (!options.skipPlantHealth) {
                const phEntry = getEntry(isPlantHealthCapable);
                if (phEntry) {
                    container.appendChild(makeButton(
                        'Plant Health',
                        'fa-solid fa-leaf',
                        () => this._toggleAnalysisPanel('plantHealth', phEntry),
                        'plant-health-toolbar-btn'));
                }
            }

            const raEntry = getEntry(isRasterAnalysisCapable);
            if (raEntry) {
                this._raBtn = makeButton(
                    'Raster Analysis',
                    'fa-solid fa-chart-area',
                    () => this._toggleAnalysisPanel('rasterAnalysis', this._raEntry),
                    'raster-analysis-toolbar-btn');
                this._raEntry = raEntry;
                container.appendChild(this._raBtn);

                this._stockpileBtn = makeButton(
                    'Stockpile Volume',
                    'fa-solid fa-layer-group',
                    () => this._toggleAnalysisPanel('stockpile', this._raEntry),
                    'stockpile-toolbar-btn');
                container.appendChild(this._stockpileBtn);
            }
        },

        /**
         * Enable/disable Raster Analysis and Stockpile Volume toolbar buttons
         * based on the number of active georaster layers.  Both tools require
         * exactly one raster to be meaningful.  Called from syncRasterLayers().
         */
        updateAnalysisButtonsForRasterCount(count) {
            const multiMsg = 'Requires a single georaster layer. Remove other layers or open the file individually.';
            if (this._raBtn) {
                this._raBtn.disabled = count > 1;
                this._raBtn.title = count > 1
                    ? `Raster Analysis - ${multiMsg}`
                    : 'Raster Analysis';
            }
            if (this._stockpileBtn) {
                this._stockpileBtn.disabled = count > 1;
                this._stockpileBtn.title = count > 1
                    ? `Stockpile Volume - ${multiMsg}`
                    : 'Stockpile Volume';
            }
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

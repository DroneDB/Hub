import Draw from 'ol/interaction/Draw';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { transform } from 'ol/proj';
import { unByKey } from 'ol/Observable';

/**
 * Mixin for Raster Analysis panel (thermal + DEM + generic value rasters).
 * Shared between Map.vue and SingleMap.vue.
 *
 * Requirements:
 * - Component must have `this.dataset` (Dataset instance)
 * - Component must have `this.map` (OpenLayers Map instance)
 * - Component must have a rasterLayer (LayerGroup) with tile layers
 * - Component must import and register RasterAnalysisControls component
 * - Component must call `this.refreshRasterLayers()` when vizParams change
 */
export default {
    data() {
        return {
            rasterPanelVisible: false,
            rasterFilePath: null,
            rasterInitialParams: null,
            rasterSpotInfo: null,
            rasterAreaStats: null,
            rasterProfile: null,
            rasterProfileLoading: false,
            rasterProfileError: null,
            // True while an OL Draw interaction for the profile polyline is active.
            rasterProfileDrawing: false,
            // True while the inspect-value tool is active (hover-over-raster tooltip).
            rasterInspectActive: false,
            rasterInspectValue: null,
            // Internal handles for the profile drawing overlay (non-reactive
            // refs are tolerated here because OL objects mutate frequently).
            _rasterProfileDraw: null,
            _rasterProfileLayer: null,
            _rasterProfileSource: null,
            _rasterProfileHoverFeature: null,
            _rasterInspectMoveKey: null,
            _rasterInspectKeyHandler: null,
            _rasterInspectTooltipEl: null,
            _rasterInspectAbort: null,
            _rasterInspectThrottle: null
        };
    },
    methods: {
        openRasterAnalysis(file, options) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path) return;
            // Mutually-exclusive analysis panels.
            if (typeof this.closeStockpileVolume === 'function') this.closeStockpileVolume();
            if (typeof this.closePlantHealth === 'function') this.closePlantHealth();
            this.rasterFilePath = path;
            this.rasterPanelVisible = true;
            if (options) {
                this.rasterInitialParams = options;
            }
        },

        closeRasterAnalysis() {
            this.rasterPanelVisible = false;
            this.rasterFilePath = null;
            this.rasterInitialParams = null;
            this.rasterSpotInfo = null;
            this.rasterAreaStats = null;
            this.rasterProfile = null;
            this.rasterProfileLoading = false;
            this.rasterProfileError = null;
            this._stopRasterProfileDrawing();
            this._clearRasterProfileLine();
            this._stopRasterInspect();
            // Reset vizParams on raster layers
            this.refreshRasterLayers();
        },

        handleRasterVizParamsChanged(params) {
            this.currentVizParams = params;
            this.refreshRasterLayers();
        },

        async queryRasterPoint(x, y) {
            if (!this.rasterFilePath || !this.dataset) return;
            try {
                this.rasterSpotInfo = await this.dataset.getRasterPointValue(this.rasterFilePath, x, y);
            } catch (e) {
                console.error('Failed to query raster point:', e);
            }
        },

        async queryRasterArea(x0, y0, x1, y1) {
            if (!this.rasterFilePath || !this.dataset) return;
            try {
                this.rasterAreaStats = await this.dataset.getRasterAreaStats(this.rasterFilePath, x0, y0, x1, y1);
            } catch (e) {
                console.error('Failed to query raster area:', e);
            }
        },

        /**
         * Sample raster values along a polyline (WGS84 coordinates).
         * @param {Array<[number, number]>|Object} line - Either an array of [lon,lat] pairs
         *   or a GeoJSON LineString geometry.
         * @param {number} samples - Requested sample count (server clamps 2..4096).
         */
        async queryRasterProfile(line, samples = 256) {
            if (!this.rasterFilePath || !this.dataset) return;
            let lineGeoJson = line;
            if (Array.isArray(line)) {
                lineGeoJson = { type: 'LineString', coordinates: line };
            }
            if (!lineGeoJson || lineGeoJson.type !== 'LineString'
                || !Array.isArray(lineGeoJson.coordinates) || lineGeoJson.coordinates.length < 2) {
                this.rasterProfileError = 'A polyline with at least two vertices is required';
                return;
            }
            this.rasterProfileLoading = true;
            this.rasterProfileError = null;
            try {
                this.rasterProfile = await this.dataset.getRasterProfile(
                    this.rasterFilePath, lineGeoJson, samples);
            } catch (e) {
                console.error('Failed to query raster profile:', e);
                this.rasterProfileError = (e && e.message) ? e.message : 'Failed to compute profile';
                this.rasterProfile = null;
            } finally {
                this.rasterProfileLoading = false;
            }
        },

        /**
         * Triggered when the user clicks "Draw profile" in the panel.
         * Engages an OpenLayers polyline Draw interaction on `this.map`,
         * draws the line in an overlay layer, and on completion samples
         * the raster along the polyline via `queryRasterProfile`.
         */
        handlePickProfile() {
            this.startRasterProfileDrawing();
        },

        startRasterProfileDrawing() {
            if (!this.map) {
                console.warn('[RasterAnalysis] No map instance; cannot start profile drawing.');
                return;
            }
            // Toggle: a second click cancels the in-progress draw cleanly.
            if (this.rasterProfileDrawing) {
                this._stopRasterProfileDrawing();
                this._clearRasterProfileLine();
                return;
            }
            // Profile drawing is mutually exclusive with the inspect tool.
            if (this.rasterInspectActive) this._stopRasterInspect();

            // Cancel any ongoing draw + clear previous line
            this._stopRasterProfileDrawing();
            this._ensureRasterProfileLayer();
            this._rasterProfileSource.clear();

            const profileStyle = new Style({
                stroke: new Stroke({
                    color: '#ff9800',
                    width: 3,
                    lineDash: [8, 6]
                }),
                image: new CircleStyle({
                    radius: 4,
                    fill: new Fill({ color: '#ff9800' }),
                    stroke: new Stroke({ color: '#ffffff', width: 1.5 })
                })
            });

            const draw = new Draw({
                source: this._rasterProfileSource,
                type: 'LineString',
                style: profileStyle
            });
            this._rasterProfileDraw = draw;
            this.rasterProfileDrawing = true;
            this.map.addInteraction(draw);

            const onKey = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    this._stopRasterProfileDrawing();
                    this._clearRasterProfileLine();
                }
            };
            this._rasterProfileKeyHandler = onKey;
            window.addEventListener('keydown', onKey);

            draw.on('drawend', (evt) => {
                // Persist a static style on the finished feature so the line
                // remains visible while the chart is shown.
                evt.feature.setStyle(new Style({
                    stroke: new Stroke({ color: '#ff9800', width: 3 }),
                    image: new CircleStyle({
                        radius: 4,
                        fill: new Fill({ color: '#ff9800' }),
                        stroke: new Stroke({ color: '#ffffff', width: 1.5 })
                    })
                }));

                const geom = evt.feature.getGeometry();
                const mapProj = this.map.getView().getProjection();
                const lineGeo = geom.clone().transform(mapProj, 'EPSG:4326');
                const coords = lineGeo.getCoordinates();

                // Stop the interaction; keep the drawn line visible until cleared.
                this._stopRasterProfileDrawing();

                if (Array.isArray(coords) && coords.length >= 2) {
                    this.queryRasterProfile(coords);
                }
            });
        },

        _ensureRasterProfileLayer() {
            if (this._rasterProfileLayer) return;
            this._rasterProfileSource = new VectorSource();
            this._rasterProfileLayer = new VectorLayer({
                source: this._rasterProfileSource,
                style: new Style({
                    stroke: new Stroke({ color: '#ff9800', width: 3 }),
                    image: new CircleStyle({
                        radius: 4,
                        fill: new Fill({ color: '#ff9800' }),
                        stroke: new Stroke({ color: '#ffffff', width: 1.5 })
                    })
                })
            });
            this._rasterProfileLayer.setZIndex(2000);
            this.map.addLayer(this._rasterProfileLayer);
        },

        _stopRasterProfileDrawing() {
            if (this._rasterProfileDraw && this.map) {
                try { this._rasterProfileDraw.abortDrawing(); } catch (e) { /* noop */ }
                try { this.map.removeInteraction(this._rasterProfileDraw); } catch (e) { /* noop */ }
            }
            this._rasterProfileDraw = null;
            this.rasterProfileDrawing = false;
            if (this._rasterProfileKeyHandler) {
                window.removeEventListener('keydown', this._rasterProfileKeyHandler);
                this._rasterProfileKeyHandler = null;
            }
        },

        _clearRasterProfileLine() {
            if (this._rasterProfileSource) this._rasterProfileSource.clear();
            this._rasterProfileHoverFeature = null;
        },

        handleClearProfile() {
            this.rasterProfile = null;
            this.rasterProfileError = null;
            this._clearRasterProfileLine();
        },

        /**
         * Cancel an in-progress draw and remove any partial line.
         * Wired to the panel's "Stop drawing" button + ESC key.
         */
        cancelRasterProfileDrawing() {
            this._stopRasterProfileDrawing();
            this._clearRasterProfileLine();
        },

        /**
         * Receive hover events from the profile chart and place a small marker
         * on the drawn polyline at the corresponding [lon, lat] sample.
         * Pass `null` to remove the marker.
         */
        handleProfileHover(sample) {
            this._renderRasterProfileHoverMarker(sample);
            // Allow hosts to extend behaviour without overriding the default marker.
            if (typeof this.onRasterProfileHover === 'function') {
                this.onRasterProfileHover(sample);
            }
        },

        _renderRasterProfileHoverMarker(sample) {
            if (!this.map || !this._rasterProfileSource) return;
            const valid = sample && typeof sample.lon === 'number' && typeof sample.lat === 'number';
            if (!valid) {
                if (this._rasterProfileHoverFeature) {
                    try { this._rasterProfileSource.removeFeature(this._rasterProfileHoverFeature); }
                    catch (e) { /* noop */ }
                    this._rasterProfileHoverFeature = null;
                }
                return;
            }
            const mapProj = this.map.getView().getProjection();
            const coord = transform([sample.lon, sample.lat], 'EPSG:4326', mapProj);
            if (!this._rasterProfileHoverFeature) {
                this._rasterProfileHoverFeature = new Feature({ geometry: new Point(coord) });
                this._rasterProfileHoverFeature.setStyle(new Style({
                    image: new CircleStyle({
                        radius: 6,
                        fill: new Fill({ color: '#ff5722' }),
                        stroke: new Stroke({ color: '#ffffff', width: 2 })
                    })
                }));
                this._rasterProfileSource.addFeature(this._rasterProfileHoverFeature);
            } else {
                this._rasterProfileHoverFeature.getGeometry().setCoordinates(coord);
            }
        },

        // ----- Inspect-value tool (hover-over-raster tooltip) -----

        toggleRasterInspect() {
            if (this.rasterInspectActive) this._stopRasterInspect();
            else this._startRasterInspect();
        },

        _startRasterInspect() {
            if (!this.map || !this.rasterFilePath || !this.dataset) return;
            // Mutually exclusive with profile drawing.
            if (this.rasterProfileDrawing) this.cancelRasterProfileDrawing();
            this.rasterInspectActive = true;
            this.rasterInspectValue = null;

            const target = this.map.getTargetElement();
            if (target) target.style.cursor = 'crosshair';

            this._rasterInspectTooltipEl = document.createElement('div');
            this._rasterInspectTooltipEl.className = 'raster-inspect-tooltip';
            Object.assign(this._rasterInspectTooltipEl.style, {
                position: 'fixed', zIndex: 10000, pointerEvents: 'none',
                background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '4px 8px',
                borderRadius: '4px', font: '12px/1.2 sans-serif',
                whiteSpace: 'nowrap', display: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
            });
            document.body.appendChild(this._rasterInspectTooltipEl);

            const mapProj = this.map.getView().getProjection();
            const onMove = (evt) => {
                if (!this._rasterInspectTooltipEl) return;
                const px = evt.originalEvent;
                this._rasterInspectTooltipEl.style.left = (px.clientX + 12) + 'px';
                this._rasterInspectTooltipEl.style.top = (px.clientY + 12) + 'px';
                if (this._rasterInspectThrottle) return;
                const [lon, lat] = transform(evt.coordinate, mapProj, 'EPSG:4326');
                this._rasterInspectThrottle = setTimeout(() => {
                    this._rasterInspectThrottle = null;
                }, 120);
                this._fetchInspectValue(lon, lat);
            };
            this._rasterInspectMoveKey = this.map.on('pointermove', onMove);

            this._rasterInspectKeyHandler = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) this._stopRasterInspect();
            };
            window.addEventListener('keydown', this._rasterInspectKeyHandler);
        },

        async _fetchInspectValue(lon, lat) {
            if (!this.rasterFilePath || !this.dataset) return;
            try {
                const info = await this.dataset.getRasterPointValue(this.rasterFilePath, lon, lat);
                if (!this.rasterInspectActive || !this._rasterInspectTooltipEl) return;
                this.rasterInspectValue = info;
                const txt = this._formatInspectValue(info);
                if (txt) {
                    this._rasterInspectTooltipEl.textContent = txt;
                    this._rasterInspectTooltipEl.style.display = 'block';
                } else {
                    this._rasterInspectTooltipEl.style.display = 'none';
                }
            } catch (e) {
                if (this._rasterInspectTooltipEl) this._rasterInspectTooltipEl.style.display = 'none';
            }
        },

        _formatInspectValue(info) {
            if (!info) return '';
            const v = (info.value != null) ? info.value
                : (Array.isArray(info.values) ? info.values.join(', ') : null);
            if (v == null) return '';
            const unit = info.unit || info.units || '';
            const num = (typeof v === 'number') ? v.toLocaleString(undefined,
                { maximumFractionDigits: 3 }) : v;
            return unit ? `${num} ${unit}` : `${num}`;
        },

        _stopRasterInspect() {
            this.rasterInspectActive = false;
            this.rasterInspectValue = null;
            if (this._rasterInspectMoveKey) {
                try { unByKey(this._rasterInspectMoveKey); } catch (e) { /* noop */ }
            }
            this._rasterInspectMoveKey = null;
            if (this._rasterInspectKeyHandler) {
                window.removeEventListener('keydown', this._rasterInspectKeyHandler);
                this._rasterInspectKeyHandler = null;
            }
            if (this._rasterInspectTooltipEl) {
                this._rasterInspectTooltipEl.remove();
                this._rasterInspectTooltipEl = null;
            }
            if (this._rasterInspectThrottle) {
                clearTimeout(this._rasterInspectThrottle);
                this._rasterInspectThrottle = null;
            }
            const target = this.map && this.map.getTargetElement();
            if (target) target.style.cursor = '';
        }
    }
};

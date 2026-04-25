import Draw from 'ol/interaction/Draw';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

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
            // Internal handles for the profile drawing overlay (non-reactive
            // refs are tolerated here because OL objects mutate frequently).
            _rasterProfileDraw: null,
            _rasterProfileLayer: null,
            _rasterProfileSource: null
        };
    },
    methods: {
        openRasterAnalysis(file, options) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path) return;
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
            if (this._rasterProfileKeyHandler) {
                window.removeEventListener('keydown', this._rasterProfileKeyHandler);
                this._rasterProfileKeyHandler = null;
            }
        },

        _clearRasterProfileLine() {
            if (this._rasterProfileSource) this._rasterProfileSource.clear();
        },

        handleClearProfile() {
            this.rasterProfile = null;
            this.rasterProfileError = null;
            this._clearRasterProfileLine();
        },

        handleProfileHover(sample) {
            // Forward to host if it wants to render a marker on the map.
            if (typeof this.onRasterProfileHover === 'function') {
                this.onRasterProfileHover(sample);
            }
        }
    }
};

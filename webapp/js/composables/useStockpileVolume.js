/**
 * Stockpile volume composable. Provides auto-detection (click-based) and
 * polygon-based volume calculation for DEM/DTM/DSM rasters.
 *
 * Host requirements:
 *  - this.dataset (Dataset instance exposing detectStockpile/calculateStockpileVolume)
 *  - this.rasterFilePath (shared with useRasterAnalysis)
 *  - this.map (OpenLayers Map instance) for interactive drawing/click flows.
 *  - optional: this.getMapCenterLatLon() → [lon, lat] for "detect at center" flow
 */
import Draw from 'ol/interaction/Draw';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Fill, Stroke, Style } from 'ol/style';
import { transform } from 'ol/proj';
import { unByKey } from 'ol/Observable';

const STOCKPILE_FILL = 'rgba(255, 152, 0, 0.20)';
const STOCKPILE_STROKE = '#ff9800';

function stockpileStyle() {
    return new Style({
        fill: new Fill({ color: STOCKPILE_FILL }),
        stroke: new Stroke({ color: STOCKPILE_STROKE, width: 2 })
    });
}

// Convert known technical/native error messages into something a user can act on.
function friendlyStockpileError(raw, fallback) {
    if (!raw) return fallback;
    const msg = String(raw);
    if (/no stockpile/i.test(msg) || /cannot detect stockpile/i.test(msg)) {
        return 'No pile detected here. Try clicking closer to the top of a clearly elevated area, increase the search radius, or lower the sensitivity.';
    }
    if (/click point is outside/i.test(msg) || /outside raster bounds/i.test(msg)) {
        return 'The clicked point is outside the raster. Click within the dataset area.';
    }
    if (/no valid data/i.test(msg)) {
        return 'The selected area contains no elevation data. Try a different location.';
    }
    if (/cannot calculate volume/i.test(msg)) {
        return 'Cannot calculate volume for this area. Make sure the polygon falls inside the raster and contains valid elevation data.';
    }
    if (/radius must be positive/i.test(msg)) {
        return 'The search radius must be greater than zero.';
    }
    if (/at least two|at least 2|polyline with at least/i.test(msg)) {
        return 'A polygon with at least three vertices is required.';
    }
    return fallback;
}

// Reserved slug for inline-custom material entries (density+cost typed in the panel).
export const CUSTOM_MATERIAL_SLUG = '__custom__';

export default {
    data() {
        return {
            stockpilePanelVisible: false,
            stockpileBaseMethod: 'lowest_perimeter',
            stockpileSensitivity: 0.5,
            stockpileRadius: 50,
            stockpileMaterial: null,
            stockpileMaterials: [],
            stockpileCustomDensity: 1.5,    // t/m³
            stockpileCustomCostPerTon: 0,   // currency unit per ton
            stockpileLoading: false,
            stockpileError: null,
            stockpileResult: null,
            stockpileDetectedPolygon: null,
            stockpileMode: null, // 'click' | 'draw' | null
            // Non-reactive OL refs (mutated directly).
            _stockpileLayer: null,
            _stockpileSource: null,
            _stockpileDraw: null,
            _stockpileClickKey: null,
            _stockpileEscKey: null,
            _stockpilePrevCursor: ''
        };
    },
    methods: {
        async openStockpileVolume(file) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path || !this.dataset) return;
            this.rasterFilePath = path;
            this.stockpilePanelVisible = true;
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            if (this.stockpileMaterials.length === 0) {
                try {
                    this.stockpileMaterials = await this.dataset.getStockpileMaterials();
                } catch (e) {
                    console.warn('Could not load stockpile materials', e);
                    this.stockpileMaterials = [];
                }
            }
        },

        closeStockpileVolume() {
            this.stockpilePanelVisible = false;
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
        },

        clearStockpileOverlay() {
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
        },

        /**
         * Auto-detect the stockpile under a given WGS84 [lon,lat].
         * After detection, immediately run volume calculation on the detected polygon.
         */
        async autoDetectAndCalculate(lon, lat) {
            if (!this.rasterFilePath || !this.dataset) return;
            if (!isFinite(lon) || !isFinite(lat)) {
                this.stockpileError = 'Invalid click coordinates';
                return;
            }
            this.stockpileLoading = true;
            this.stockpileError = null;
            try {
                const detection = await this.dataset.detectStockpile(this.rasterFilePath, lat, lon, {
                    radius: this.stockpileRadius,
                    sensitivity: this.stockpileSensitivity
                });
                this.stockpileDetectedPolygon = detection.polygon;

                const volume = await this.dataset.calculateStockpileVolume(
                    this.rasterFilePath,
                    detection.polygon,
                    {
                        baseMethod: this.stockpileBaseMethod,
                        flatElevation: 0,
                        material: this.stockpileMaterial
                    }
                );
                this.stockpileResult = {
                    ...volume,
                    confidence: detection.confidence,
                    estimatedFromDetection: detection.estimatedVolume
                };
                this._renderStockpilePolygon(detection.polygon);
            } catch (e) {
                console.error('Stockpile detection/calculation failed:', e);
                this.stockpileError = friendlyStockpileError(e && e.message,
                    'Stockpile detection failed. Please try a different point or adjust the parameters.');
                this.stockpileResult = null;
            } finally {
                this.stockpileLoading = false;
            }
        },

        /**
         * Calculate the stockpile volume for a user-drawn polygon (GeoJSON WGS84).
         */
        async calculateStockpileVolume(polygonGeoJson) {
            if (!this.rasterFilePath || !this.dataset) return;
            if (!polygonGeoJson) {
                this.stockpileError = 'A polygon is required';
                return;
            }
            this.stockpileLoading = true;
            this.stockpileError = null;
            try {
                const volume = await this.dataset.calculateStockpileVolume(
                    this.rasterFilePath,
                    polygonGeoJson,
                    {
                        baseMethod: this.stockpileBaseMethod,
                        flatElevation: 0,
                        material: this.stockpileMaterial
                    }
                );
                this.stockpileResult = volume;
                this.stockpileDetectedPolygon = polygonGeoJson;
                this._renderStockpilePolygon(polygonGeoJson);
            } catch (e) {
                console.error('Stockpile calculation failed:', e);
                this.stockpileError = friendlyStockpileError(e && e.message,
                    'Cannot calculate volume for this polygon. Make sure it covers a valid elevated area inside the raster.');
                this.stockpileResult = null;
            } finally {
                this.stockpileLoading = false;
            }
        },

        /** Triggers auto-detect at the current map view center (if available). */
        async detectAtMapCenter() {
            if (typeof this.getMapCenterLatLon !== 'function') {
                this.stockpileError = 'Map center not available';
                return;
            }
            const lonLat = this.getMapCenterLatLon();
            if (!lonLat) return;
            return this.autoDetectAndCalculate(lonLat[0], lonLat[1]);
        },

        /**
         * Engage "single click on map" capture: the next map click triggers
         * `autoDetectAndCalculate` at the clicked coordinate.
         */
        startStockpileClickMode() {
            if (!this.map) {
                this.stockpileError = 'Map not available';
                return;
            }
            this._stopStockpileInteractions();
            this.stockpileMode = 'click';
            this.stockpileError = null;
            this._setStockpileCursor('crosshair');
            const mapProj = this.map.getView().getProjection();
            this._stockpileClickKey = this.map.once('singleclick', (evt) => {
                this._stockpileClickKey = null;
                this._setStockpileCursor('');
                this.stockpileMode = null;
                this.stockpileError = null;
                const [lon, lat] = transform(evt.coordinate, mapProj, 'EPSG:4326');
                this.autoDetectAndCalculate(lon, lat);
            });
            this._stockpileEscKey = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    this._stopStockpileInteractions();
                    this.stockpileError = null;
                }
            };
            window.addEventListener('keydown', this._stockpileEscKey);
        },

        /**
         * Activate an OpenLayers Polygon Draw interaction. On drawend the polygon
         * is converted to WGS84 GeoJSON and passed to `calculateStockpileVolume`.
         */
        startStockpilePolygonDrawing() {
            if (!this.map) {
                this.stockpileError = 'Map not available';
                return;
            }
            this._stopStockpileInteractions();
            this._ensureStockpileLayer();
            this._stockpileSource.clear();
            this.stockpileMode = 'draw';
            this.stockpileError = null;
            this._setStockpileCursor('crosshair');

            const mapProj = this.map.getView().getProjection();
            const draw = new Draw({
                source: this._stockpileSource,
                type: 'Polygon',
                style: stockpileStyle()
            });
            this._stockpileDraw = draw;
            this.map.addInteraction(draw);

            draw.on('drawend', (evt) => {
                this.stockpileError = null;
                // Don't call _stopStockpileInteractions here: drawend already finalised
                // the sketch into a real feature; calling abortDrawing afterwards would
                // re-clear the source. Just remove the interaction + listeners.
                this._teardownStockpileDraw();
                this.stockpileMode = null;
                this._setStockpileCursor('');
                const geom = evt.feature.getGeometry().clone().transform(mapProj, 'EPSG:4326');
                const coords = geom.getCoordinates();
                if (!coords || !coords[0] || coords[0].length < 3) {
                    this.stockpileError = 'A polygon with at least 3 vertices is required.';
                    return;
                }
                const polygonGeoJson = { type: 'Polygon', coordinates: coords };
                this.calculateStockpileVolume(polygonGeoJson);
            });

            this._stockpileEscKey = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    this._stopStockpileInteractions();
                    this._stockpileSource && this._stockpileSource.clear();
                    this.stockpileError = null;
                }
            };
            window.addEventListener('keydown', this._stockpileEscKey);
        },

        _ensureStockpileLayer() {
            if (!this.map) return;
            if (this._stockpileLayer) return;
            this._stockpileSource = new VectorSource();
            this._stockpileLayer = new VectorLayer({
                source: this._stockpileSource,
                style: stockpileStyle(),
                zIndex: 2000
            });
            this.map.addLayer(this._stockpileLayer);
        },

        _renderStockpilePolygon(polygonGeoJson) {
            if (!this.map || !polygonGeoJson || polygonGeoJson.type !== 'Polygon') return;
            this._ensureStockpileLayer();
            this._stockpileSource.clear();
            const mapProj = this.map.getView().getProjection();
            const coords = polygonGeoJson.coordinates.map(ring =>
                ring.map(c => transform(c, 'EPSG:4326', mapProj))
            );
            const feature = new Feature({ geometry: new Polygon(coords) });
            feature.setStyle(stockpileStyle());
            this._stockpileSource.addFeature(feature);
        },

        _clearStockpileOverlay() {
            if (this._stockpileSource) this._stockpileSource.clear();
        },

        _stopStockpileInteractions() {
            this._teardownStockpileDraw();
            if (this._stockpileClickKey) {
                try { unByKey(this._stockpileClickKey); } catch (e) { /* noop */ }
                this._stockpileClickKey = null;
            }
            this.stockpileMode = null;
            this._setStockpileCursor('');
        },

        _teardownStockpileDraw() {
            if (this._stockpileDraw && this.map) {
                try { this._stockpileDraw.abortDrawing(); } catch (e) { /* noop */ }
                try { this.map.removeInteraction(this._stockpileDraw); } catch (e) { /* noop */ }
            }
            this._stockpileDraw = null;
            if (this._stockpileEscKey) {
                window.removeEventListener('keydown', this._stockpileEscKey);
                this._stockpileEscKey = null;
            }
        },

        _setStockpileCursor(cursor) {
            if (!this.map || typeof this.map.getViewport !== 'function') return;
            const vp = this.map.getViewport();
            if (!vp || !vp.style) return;
            if (cursor) {
                if (this._stockpilePrevCursor === '') {
                    this._stockpilePrevCursor = vp.style.cursor || '';
                }
                vp.style.cursor = cursor;
            } else {
                vp.style.cursor = this._stockpilePrevCursor || '';
                this._stockpilePrevCursor = '';
            }
        },

        /**
         * Export the currently displayed pile contour as a GeoJSON Feature
         * (downloaded as a file). Only available when a polygon has been computed.
         */
        exportStockpileGeoJson() {
            if (!this.stockpileDetectedPolygon) {
                this.stockpileError = 'No polygon to export. Detect or draw a stockpile first.';
                return;
            }
            const props = {};
            if (this.stockpileResult) {
                if (typeof this.stockpileResult.netVolume === 'number') props.netVolume = this.stockpileResult.netVolume;
                if (typeof this.stockpileResult.cutVolume === 'number') props.cutVolume = this.stockpileResult.cutVolume;
                if (typeof this.stockpileResult.fillVolume === 'number') props.fillVolume = this.stockpileResult.fillVolume;
                if (typeof this.stockpileResult.area2d === 'number') props.area2d = this.stockpileResult.area2d;
                if (typeof this.stockpileResult.area3d === 'number') props.area3d = this.stockpileResult.area3d;
                if (typeof this.stockpileResult.baseElevation === 'number') props.baseElevation = this.stockpileResult.baseElevation;
                if (typeof this.stockpileResult.confidence === 'number') props.confidence = this.stockpileResult.confidence;
            }
            props.material = this.stockpileMaterial || null;
            props.exportedAt = new Date().toISOString();

            const feature = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: this.stockpileDetectedPolygon,
                    properties: props
                }]
            };
            const json = JSON.stringify(feature, null, 2);
            const blob = new Blob([json], { type: 'application/geo+json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = (this.rasterFilePath || 'stockpile').split('/').pop().replace(/\.[^.]+$/, '');
            a.href = url;
            a.download = `${baseName}-stockpile.geojson`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        }
    }
};

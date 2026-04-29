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
import { buildStockpileFeature, loadStockpile } from '@/libs/map/stockpileStorage';
import {
    STOCKPILE_MATERIALS,
    CUSTOM_MATERIAL_SLUG as SHARED_CUSTOM_MATERIAL_SLUG,
    findStockpileMaterialBySlug,
    computeMaterialEstimate
} from '@/libs/stockpileMaterials';

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

// Re-exported here so existing imports of `CUSTOM_MATERIAL_SLUG` from this
// composable keep working. The single source of truth lives in
// `@/libs/stockpileMaterials`.
export const CUSTOM_MATERIAL_SLUG = SHARED_CUSTOM_MATERIAL_SLUG;

// Resolve the active material descriptor for the current panel state.
// Returns null when no material is selected, or when the inline custom
// entry has invalid density.
function resolveSelectedMaterial(slug, customDensity, customCostPerTon) {
    if (!slug) return null;
    if (slug === CUSTOM_MATERIAL_SLUG) {
        const d = Number(customDensity);
        if (!isFinite(d) || d <= 0) return null;
        return {
            slug: CUSTOM_MATERIAL_SLUG,
            densityTonPerM3: d,
            costPerTon: Math.max(0, Number(customCostPerTon) || 0),
            currency: 'USD'
        };
    }
    return findStockpileMaterialBySlug(slug);
}

export default {
    data() {
        return {
            stockpilePanelVisible: false,
            stockpileBaseMethod: 'lowest_perimeter',
            stockpileSensitivity: 0.5,
            stockpileRadius: 50,
            stockpileMaterial: null,
            // Materials catalog is bundled with the SPA; no network call.
            stockpileMaterials: STOCKPILE_MATERIALS,
            stockpileCustomDensity: 1.5,    // t/m³
            stockpileCustomCostPerTon: 0,   // currency unit per ton
            stockpileLoading: false,
            stockpileError: null,
            stockpileResult: null,
            stockpileDetectedPolygon: null,
            stockpileMode: null, // 'click' | 'draw' | null
            // User-editable identification of the saved pile.
            stockpileTitle: '',
            stockpileDescription: '',
            // Non-reactive OL refs (mutated directly).
            _stockpileLayer: null,
            _stockpileSource: null,
            _stockpileDraw: null,
            _stockpileClickKey: null,
            _stockpileEscKey: null,
            _stockpilePrevCursor: '',
            // Id of the current draft stockpile feature in the shared
            // measurement layer. Tracks the polygon that has been auto-adopted
            // as a regular measurement so it can be re-styled / replaced when
            // the user re-detects, and removed when leaving the panel without
            // ever saving via the toolbar.
            _draftStockpileFeatureId: null
        };
    },
    watch: {
        // Keep the in-memory draft feature's properties in sync with what the
        // user types in the panel so the toolbar Save button captures the
        // latest title / notes / material without an extra "Apply" click.
        stockpileTitle() { this._patchDraftStockpileProps && this._patchDraftStockpileProps(); },
        stockpileDescription() { this._patchDraftStockpileProps && this._patchDraftStockpileProps(); },
        stockpileMaterial() { this._patchDraftStockpileProps && this._patchDraftStockpileProps(); },
        stockpileCustomDensity() { this._patchDraftStockpileProps && this._patchDraftStockpileProps(); }
    },
    methods: {
        async openStockpileVolume(file) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path || !this.dataset) return;
            // Mutually-exclusive panels: ensure other analysis panels are closed.
            if (typeof this.closeRasterAnalysis === 'function') this.closeRasterAnalysis();
            if (typeof this.closePlantHealth === 'function') this.closePlantHealth();

            this.rasterFilePath = path;
            this.stockpilePanelVisible = true;
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
            // Restore a previously saved stockpile (if any) so the user sees it on the map.
            this._loadSavedStockpile();
        },

        async _loadSavedStockpile() {
            if (!this.rasterFilePath || !this.dataset) return;
            try {
                // Skip stockpiles the user has just removed via the Measurement
                // List dialog (deletion is in-memory until the next save).
                const saved = await loadStockpile(this.dataset, this.rasterFilePath,
                    this.deletedMeasurementIds);
                if (!saved) return;
                this.stockpileDetectedPolygon = saved.polygon;
                // The polygon may already be rendered by the regular measurements
                // layer (when persisted with measurementType==='stockpile' it is
                // imported via measureControls.importFromGeoJSON at dataset load).
                // Render in our dedicated overlay only as a fallback.
                if (!this._isStockpileInMeasureSource(saved.properties && saved.properties.id)) {
                    this._renderStockpilePolygon(saved.polygon);
                }
                // Re-hydrate the result panel from saved properties so volumes/area
                // are visible without recomputing.
                const p = saved.properties || {};
                if (p.netVolume != null || p.cutVolume != null || p.area2d != null) {
                    this.stockpileResult = {
                        netVolume: p.netVolume,
                        cutVolume: p.cutVolume,
                        fillVolume: p.fillVolume,
                        area2d: p.area2d,
                        area3d: p.area3d,
                        baseElevation: p.baseElevation,
                        confidence: p.confidence,
                        weightEstimate: p.weightEstimate,
                        costEstimate: p.costEstimate,
                        _restored: true
                    };
                }
                if (p.material) this.stockpileMaterial = p.material;
                if (p.title) this.stockpileTitle = p.title;
                // `description` is the canonical key; `notes` is read for
                // backwards compatibility with stockpiles saved before the
                // rename and migrated into `description` on next save.
                if (p.description) {
                    this.stockpileDescription = p.description;
                } else if (p.notes) {
                    this.stockpileDescription = p.notes;
                }
            } catch (e) {
                console.warn('Could not restore saved stockpile:', e);
            }
        },

        /**
         * Returns true if a feature with the given id is already present in the
         * shared measurements OL source - in which case our dedicated overlay
         * does not need to render the polygon a second time.
         */
        _isStockpileInMeasureSource(id) {
            if (!id || !this.measureControls || !this.measureControls.source) return false;
            const features = this.measureControls.source.getFeatures();
            return features.some(f => f.get('measurementType') === 'stockpile' && f.get('id') === id);
        },

        /**
         * Hook invoked by olMeasure (via Map.vue / SingleMap.vue) whenever a
         * feature is removed from the shared measurement source. When the
         * removed feature is the current stockpile draft (eraser tool, edit
         * dialog Delete button, list-dialog delete, ...), reset the panel so
         * the result fields, polygon reference and identification inputs no
         * longer point to a feature that is gone from the map.
         */
        _onStockpileFeatureRemoved(feature) {
            if (!feature || !feature.get) return;
            if (feature.get('measurementType') !== 'stockpile') return;
            const id = feature.get('id');
            if (!id || id !== this._draftStockpileFeatureId) return;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this.stockpileError = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
            this._draftStockpileFeatureId = null;
            this._clearStockpileOverlay();
        },

        closeStockpileVolume() {
            this.stockpilePanelVisible = false;
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
            // Forget the draft id so the next session can adopt a fresh
            // polygon. The feature itself stays in the measurements layer
            // until the user persists or removes it via the toolbar.
            this._draftStockpileFeatureId = null;
        },

        clearStockpileOverlay() {
            this.stockpileError = null;
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            // Reset the loading flag so an in-flight detection that is taking
            // too long no longer blocks the panel - the request itself will
            // still complete in the background but its result will be ignored
            // because _draftStockpileFeatureId is cleared below.
            this.stockpileLoading = false;
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
            // Also remove the draft polygon (and its floating label/tooltip)
            // from the shared measurement layer if it was already adopted,
            // otherwise the label stays orphaned on the map.
            this._removeDraftStockpileFromMeasureSource();
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
            // Each new detection is an independent pile - detach from the
            // previous draft and reset the identification fields so the
            // previously-typed title/description don't bleed into the next adopted
            // feature (and the watcher doesn't overwrite the previous pile).
            this._draftStockpileFeatureId = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
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
                        flatElevation: 0
                    }
                );
                const material = resolveSelectedMaterial(
                    this.stockpileMaterial,
                    this.stockpileCustomDensity,
                    this.stockpileCustomCostPerTon
                );
                const estimate = computeMaterialEstimate(volume, material);
                this.stockpileResult = {
                    ...volume,
                    ...(estimate || {}),
                    confidence: detection.confidence,
                    estimatedFromDetection: detection.estimatedVolume
                };
                this._adoptDraftStockpile(detection.polygon);
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
            // Each new polygon is an independent pile - detach from the
            // previous draft and reset the identification fields so the
            // previously-typed title/description don't bleed into the next adopted
            // feature (and the watcher doesn't overwrite the previous pile).
            this._draftStockpileFeatureId = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
            try {
                const volume = await this.dataset.calculateStockpileVolume(
                    this.rasterFilePath,
                    polygonGeoJson,
                    {
                        baseMethod: this.stockpileBaseMethod,
                        flatElevation: 0
                    }
                );
                const material = resolveSelectedMaterial(
                    this.stockpileMaterial,
                    this.stockpileCustomDensity,
                    this.stockpileCustomCostPerTon
                );
                const estimate = computeMaterialEstimate(volume, material);
                this.stockpileResult = { ...volume, ...(estimate || {}) };
                this.stockpileDetectedPolygon = polygonGeoJson;
                this._adoptDraftStockpile(polygonGeoJson);
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
         * Acts as a toggle: a second invocation while already in click-mode cancels.
         */
        startStockpileClickMode() {
            if (!this.map) {
                this.stockpileError = 'Map not available';
                return;
            }
            if (this.stockpileMode === 'click') { this._stopStockpileInteractions(); return; }
            this._stopStockpileInteractions();
            this.stockpileMode = 'click';
            this.stockpileError = null;
            this._setStockpileCursor('crosshair');
            this._acquireStockpileToolLock();
            const mapProj = this.map.getView().getProjection();
            this._stockpileClickKey = this.map.once('singleclick', (evt) => {
                const [lon, lat] = transform(evt.coordinate, mapProj, 'EPSG:4326');
                // Tear everything down (cursor, ESC handler, mode flag) BEFORE running
                // detection so no interactions/listeners linger after the click.
                this._stockpileClickKey = null;
                this._stopStockpileInteractions();
                this.stockpileError = null;
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
            // Toggle behaviour: re-clicking while already drawing cancels.
            if (this.stockpileMode === 'draw') { this._stopStockpileInteractions(); return; }
            this._stopStockpileInteractions();
            this._ensureStockpileLayer();
            this._stockpileSource.clear();
            this.stockpileMode = 'draw';
            this.stockpileError = null;
            this._setStockpileCursor('crosshair');
            this._acquireStockpileToolLock();

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
                // Update UI state synchronously so the panel button highlight
                // and tool lock release immediately, but defer interaction
                // removal: OL Draw is still in the middle of finalising the
                // sketch when drawend fires, and removing the interaction
                // synchronously can leave the next pointer event (e.g. the
                // user clicking the "Click on map" button) routed back to a
                // half-alive Draw that starts a new polygon.
                this.stockpileMode = null;
                const mapProjForEnd = this.map.getView().getProjection();
                const geom = evt.feature.getGeometry().clone().transform(mapProjForEnd, 'EPSG:4326');
                const coords = geom.getCoordinates();
                // Detach the live reference synchronously so a quick
                // user re-click on Draw / Click does not get clobbered by
                // the deferred teardown below, and capture the specific
                // interaction locally so we only remove THIS one.
                const finishedDraw = draw;
                if (this._stockpileDraw === finishedDraw) {
                    this._stockpileDraw = null;
                }
                if (this._stockpileDrawTeardownTimer) {
                    clearTimeout(this._stockpileDrawTeardownTimer);
                    this._stockpileDrawTeardownTimer = null;
                }
                this._stockpileDrawTeardownTimer = setTimeout(() => {
                    this._stockpileDrawTeardownTimer = null;
                    if (this.map) {
                        try { finishedDraw.abortDrawing(); } catch (e) { /* noop */ }
                        try { this.map.removeInteraction(finishedDraw); } catch (e) { /* noop */ }
                    }
                    if (this._stockpileEscKey) {
                        window.removeEventListener('keydown', this._stockpileEscKey);
                        this._stockpileEscKey = null;
                    }
                    this._setStockpileCursor('');
                    this._releaseStockpileToolLock();
                }, 0);
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
            // Cancel any pending deferred Draw teardown so it cannot fire
            // later and remove a freshly-installed interaction.
            if (this._stockpileDrawTeardownTimer) {
                clearTimeout(this._stockpileDrawTeardownTimer);
                this._stockpileDrawTeardownTimer = null;
            }
            this._teardownStockpileDraw();
            if (this._stockpileClickKey) {
                try { unByKey(this._stockpileClickKey); } catch (e) { /* noop */ }
                this._stockpileClickKey = null;
            }
            this.stockpileMode = null;
            this._setStockpileCursor('');
            this._releaseStockpileToolLock();
        },

        /**
         * Acquire / release a single lock on the measurement toolbar so the
         * user can't start a regular measurement while a stockpile click or
         * polygon draw is active. The flag prevents accidental double-locking
         * when the same panel triggers both click and draw modes back to back.
         */
        _acquireStockpileToolLock() {
            if (this._stockpileToolLockHeld) return;
            if (this.measureControls && typeof this.measureControls.setToolsDisabled === 'function') {
                try { this.measureControls.setToolsDisabled(true); } catch (e) { /* noop */ }
                this._stockpileToolLockHeld = true;
            }
        },
        _releaseStockpileToolLock() {
            if (!this._stockpileToolLockHeld) return;
            if (this.measureControls && typeof this.measureControls.setToolsDisabled === 'function') {
                try { this.measureControls.setToolsDisabled(false); } catch (e) { /* noop */ }
            }
            this._stockpileToolLockHeld = false;
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
         * Build the property bag persisted alongside the polygon (used by both
         * Save and Export so the two outputs stay consistent).
         */
        _buildStockpileProperties() {
            const props = { material: this.stockpileMaterial || null };
            const title = (this.stockpileTitle || '').trim();
            const description = (this.stockpileDescription || '').trim();
            if (title) props.title = title;
            if (description) props.description = description;
            // Resolve material density (preferred sources: predefined entry,
            // custom inline density, or backend-supplied weightEstimate).
            const mat = (this.stockpileMaterials || []).find(m => m && m.slug === this.stockpileMaterial);
            if (mat && isFinite(mat.densityTonPerM3)) {
                props.materialDensity = Number(mat.densityTonPerM3);
            } else if (this.stockpileMaterial === CUSTOM_MATERIAL_SLUG
                && isFinite(this.stockpileCustomDensity) && this.stockpileCustomDensity > 0) {
                props.materialDensity = Number(this.stockpileCustomDensity);
            }
            if (this.currentUnitPref) props.unitSystem = this.currentUnitPref;
            const r = this.stockpileResult;
            if (r) {
                if (typeof r.netVolume === 'number') props.netVolume = r.netVolume;
                if (typeof r.cutVolume === 'number') props.cutVolume = r.cutVolume;
                if (typeof r.fillVolume === 'number') props.fillVolume = r.fillVolume;
                if (typeof r.area2d === 'number') props.area2d = r.area2d;
                if (typeof r.area3d === 'number') props.area3d = r.area3d;
                if (typeof r.baseElevation === 'number') props.baseElevation = r.baseElevation;
                if (typeof r.confidence === 'number') props.confidence = r.confidence;
                if (r.weightEstimate) props.weightEstimate = r.weightEstimate;
                if (r.costEstimate) props.costEstimate = r.costEstimate;
            }
            // tooltipText is what the Measurement List dialog shows in the
            // "Value" column; build a compact human description here so the
            // saved feature looks meaningful when re-imported.
            props.tooltipText = this._formatStockpileTooltip(props);
            // The user-visible name in the list (preferred over a generic label).
            if (title) props.name = title;
            return props;
        },

        _formatStockpileTooltip(p) {
            const parts = [];
            if (p.title) parts.push(p.title);
            if (typeof p.netVolume === 'number') parts.push(`${p.netVolume.toFixed(1)} m³`);
            if (p.material && p.material !== CUSTOM_MATERIAL_SLUG) parts.push(p.material);
            if (p.materialDensity) parts.push(`${p.materialDensity} t/m³`);
            return parts.join(' - ') || 'Stockpile';
        },

        /**
         * Adopt the just-computed stockpile polygon into the shared OL
         * measurements layer as if it had been drawn with the regular tools.
         * The user can then persist it using the toolbar Save button (the
         * dedicated "Save GeoJSON" panel button has been removed).
         *
         * Each detection produces an independent feature so the user can mark
         * multiple stockpiles one after another within the same session. The
         * id of the latest adopted feature is tracked so the "Clear" button
         * can undo just the most recent one.
         */
        _adoptDraftStockpile(polygon) {
            if (!polygon || polygon.type !== 'Polygon') return;
            if (!this.measureControls
                || typeof this.measureControls.importFromGeoJSON !== 'function') return;

            const props = this._buildStockpileProperties();
            const feature = buildStockpileFeature(polygon, props);
            const fc = {
                type: 'FeatureCollection',
                metadata: { application: 'DroneDB Registry', kind: 'measurements' },
                features: [feature]
            };
            try {
                this.measureControls.importFromGeoJSON(fc);
                this._draftStockpileFeatureId = feature.properties.id;
                // Drop our temporary draw overlay - the polygon now lives in
                // the regular measurements layer.
                this._clearStockpileOverlay();
                if (typeof this.measureControls.updateButtonsVisibility === 'function') {
                    this.measureControls.updateButtonsVisibility(
                        this.measureControls.hasMeasurements(),
                        !!this.hasSavedMeasurements);
                }
            } catch (e) {
                console.warn('Could not adopt stockpile into measurement layer:', e);
            }
        },

        /**
         * Remove the draft stockpile feature (if previously adopted) from the
         * shared measurement layer. Uses deleteMeasurement so the floating
         * volume label (OL Overlay + DOM) is cleaned up too.
         */
        _removeDraftStockpileFromMeasureSource() {
            const id = this._draftStockpileFeatureId;
            if (!id || !this.measureControls || !this.measureControls.source) return;
            const feature = this.measureControls.source.getFeatures().find(
                f => f.get('measurementType') === 'stockpile' && f.get('id') === id);
            if (!feature) return;
            try {
                this.measureControls.deleteMeasurement(feature);
            } catch (e) {
                try { this.measureControls.source.removeFeature(feature); } catch (_) { /* noop */ }
            }
            this._draftStockpileFeatureId = null;
        },

        /**
         * Patch the in-place properties of the current draft feature when the
         * user edits title / notes / material in the panel. Avoids rebuilding
         * the geometry and keeps the same feature id so the toolbar Save
         * captures the latest values.
         */
        _patchDraftStockpileProps() {
            const id = this._draftStockpileFeatureId;
            if (!id || !this.measureControls || !this.measureControls.source) return;
            const feature = this.measureControls.source.getFeatures().find(
                f => f.get('measurementType') === 'stockpile' && f.get('id') === id);
            if (!feature) return;
            const props = this._buildStockpileProperties();
            // Don't touch geometry/style props that were set at build time.
            const updatable = ['name', 'title', 'description', 'material', 'materialDensity',
                'tooltipText', 'unitSystem', 'netVolume', 'cutVolume', 'fillVolume',
                'area2d', 'area3d', 'baseElevation', 'confidence', 'weightEstimate', 'costEstimate'];
            updatable.forEach(k => {
                if (props[k] !== undefined) feature.set(k, props[k]);
                else feature.unset && feature.unset(k);
            });
            feature.changed();
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
            const props = { ...this._buildStockpileProperties(), exportedAt: new Date().toISOString() };

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

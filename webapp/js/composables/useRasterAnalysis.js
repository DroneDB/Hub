import Draw from 'ol/interaction/Draw';
import Overlay from 'ol/Overlay';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { transform } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import { getLength as olGetLength } from 'ol/sphere';

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
            // Internal handles for the profile drawing flow (non-reactive
            // refs are tolerated here because OL objects mutate frequently).
            // The drawn profile line itself lives in `measureControls.source`
            // (the shared measurement layer) so it inherits hover, edit,
            // erase, save, export, and import for free. Only the ephemeral
            // chart-hover dot keeps its own dedicated overlay layer.
            _rasterProfileDraw: null,
            _rasterProfileHoverLayer: null,
            _rasterProfileHoverSource: null,
            _rasterProfileHoverFeature: null,
            // The currently-active profile feature inside measureControls.source.
            // When this feature is removed (eraser tool, list-dialog delete,
            // clear-all, panel "Clear" button, etc.) the chart and hover dot
            // are reset by the `removefeature` watcher set up below.
            _currentProfileFeature: null,
            _rasterProfileSourceRemoveKey: null,
            _rasterProfileKeyHandler: null,
            _rasterProfileToolLockHeld: false,
            _rasterInspectMoveKey: null,
            _rasterInspectKeyHandler: null,
            _rasterInspectTooltipEl: null,
            _rasterInspectAbort: null,
            _rasterInspectThrottle: null,
            _rasterInspectClickKey: null,
            // VectorLayer / VectorSource that hold the click marker (red dot)
            // for the inspect-value tool. The dot is anchored to the map
            // coordinate so it pans/zooms with the map.
            _rasterInspectLayer: null,
            _rasterInspectSource: null,
            // OL Overlay anchoring the value tooltip next to the click marker.
            _rasterInspectTooltipOverlay: null,
            _rasterDimsCache: null
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
            // Restore previously-applied viz params for this file so the
            // panel UI (colormap / rescale) reflects the live styling of
            // the layer instead of resetting to defaults when switching
            // back from another analysis panel.
            const cached = this.vizParamsByPath && this.vizParamsByPath[path];
            if (options) {
                this.rasterInitialParams = options;
            } else if (cached && Object.keys(cached).length) {
                this.rasterInitialParams = { ...cached };
            } else {
                this.rasterInitialParams = null;
            }
            if (cached && Object.keys(cached).length) {
                this.currentVizParams = { ...cached };
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
            this._removeRasterProfileHoverMarker();
            this._tearDownRasterProfileMeasurementWatcher();
            // Note: we intentionally do NOT delete previously-drawn profile
            // features from `measureControls.source` here. They are regular
            // measurements now and must persist across panel open/close
            // (just like length/area/point measurements would).
            this._currentProfileFeature = null;
            this._stopRasterInspect();
            // Reset transient "active panel emitting" state. The per-file
            // cache (`vizParamsByPath`, defined in usePlantHealth) is kept
            // so reopening this file later reuses the colormap/rescale.
            this.currentVizParams = {};
            this.refreshRasterLayers();
        },

        handleRasterVizParamsChanged(params) {
            this.currentVizParams = params;
            const path = this.rasterFilePath;
            if (path) {
                if (params && Object.keys(params).length) {
                    this.vizParamsByPath = { ...this.vizParamsByPath, [path]: { ...params } };
                } else if (this.vizParamsByPath && this.vizParamsByPath[path]) {
                    const next = { ...this.vizParamsByPath };
                    delete next[path];
                    this.vizParamsByPath = next;
                }
            }
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
         * Engages an OpenLayers polyline Draw interaction wired directly to
         * the shared measurement source, so the resulting line is a regular
         * measurement (visible in the Measurement List dialog, eraseable
         * with the toolbar eraser, savable, exportable, editable). On
         * completion the polyline is sampled against the raster via
         * `queryRasterProfile` to populate the chart in the panel.
         */
        handlePickProfile() {
            this.startRasterProfileDrawing();
        },

        startRasterProfileDrawing() {
            if (!this.map) {
                console.warn('[RasterAnalysis] No map instance; cannot start profile drawing.');
                return;
            }
            if (!this.measureControls || !this.measureControls.source) {
                console.warn('[RasterAnalysis] measureControls is required for profile drawing.');
                return;
            }
            // Toggle: a second click cancels the in-progress draw cleanly.
            if (this.rasterProfileDrawing) {
                this.cancelRasterProfileDrawing();
                return;
            }
            // Profile drawing is mutually exclusive with the inspect tool.
            if (this.rasterInspectActive) this._stopRasterInspect();

            // Replace any previously-drawn profile so the panel always
            // reflects exactly one active profile/chart pair. Past profiles
            // can still be re-created via "Redraw"; if the user wants to
            // keep both, they can persist them via the measurements toolbar.
            this._removeCurrentProfileFeature();
            this.rasterProfile = null;
            this.rasterProfileError = null;
            this._removeRasterProfileHoverMarker();

            // The dashed orange style is applied only to the in-progress
            // sketch by OL design: once `drawend` fires, the persisted
            // feature is rendered by the measurement layer's style function
            // (which respects the `stroke` / `stroke-width` properties we
            // set below and inherits hover highlight automatically).
            const sketchStyle = new Style({
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
                source: this.measureControls.source,
                type: 'LineString',
                style: sketchStyle
            });
            this._rasterProfileDraw = draw;
            this.rasterProfileDrawing = true;
            this.map.addInteraction(draw);

            // Suspend the measurement toolbar while the user is drawing the
            // profile line so they can't start a different measurement on top.
            // Tracked by a flag so _stopRasterProfileDrawing() releases at
            // most one lock no matter how many times it gets called.
            if (!this._rasterProfileToolLockHeld
                && typeof this.measureControls.setToolsDisabled === 'function') {
                this.measureControls.setToolsDisabled(true);
                this._rasterProfileToolLockHeld = true;
            }

            const onKey = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    // ESC must abort the in-progress geometry AND fully exit
                    // drawing mode. The sketch is not yet committed to the
                    // source so there is nothing to clean up there.
                    this.cancelRasterProfileDrawing();
                }
            };
            this._rasterProfileKeyHandler = onKey;
            window.addEventListener('keydown', onKey);

            draw.on('drawend', (evt) => {
                const feature = evt.feature;
                const geom = feature.getGeometry();
                const mapProj = this.map.getView().getProjection();
                const lineGeo = geom.clone().transform(mapProj, 'EPSG:4326');
                const coords = lineGeo.getCoordinates();

                // Drop degenerate profiles (the user double-clicked without
                // placing real vertices). The feature is in the measurement
                // source already, so we have to remove it explicitly here.
                if (!Array.isArray(coords) || coords.length < 2) {
                    try { this.measureControls.source.removeFeature(feature); }
                    catch (e) { /* noop */ }
                    this.cancelRasterProfileDrawing();
                    return;
                }

                // Persist measurement metadata so the shared list, save/load,
                // export, edit, and erase tools all treat the profile like a
                // first-class measurement.
                let lengthM = 0;
                try { lengthM = olGetLength(geom); } catch (e) { /* noop */ }
                const lengthLabel = lengthM >= 1000
                    ? `${(lengthM / 1000).toFixed(2)} km`
                    : `${lengthM.toFixed(1)} m`;
                feature.set('measurementType', 'profile');
                feature.set('createdAt', new Date().toISOString());
                feature.set('stroke', '#ff9800');
                feature.set('stroke-width', 3);
                feature.set('tooltipText', `Profile: ${lengthLabel}`);
                if (this.rasterFilePath) feature.set('rasterFilePath', this.rasterFilePath);

                this._currentProfileFeature = feature;
                this._setupRasterProfileMeasurementWatcher();

                // Floating tooltip on the line (matches length/area). Hidden
                // by default; revealed on hover by olMeasure's hover handler.
                this._createProfileStaticTooltip(feature);

                if (typeof this.measureControls.updateButtonsVisibility === 'function') {
                    this.measureControls.updateButtonsVisibility(
                        typeof this.measureControls.hasMeasurements === 'function'
                            ? this.measureControls.hasMeasurements()
                            : true,
                        false);
                }

                // Synchronously suspend the Draw interaction so the upcoming
                // pointer events can NOT start a new feature, and flip the UI
                // flag right away so the panel button immediately shows
                // "Redraw" instead of staying in "Stop drawing" mode.
                if (this._rasterProfileDraw) {
                    try { this._rasterProfileDraw.setActive(false); } catch (e) { /* noop */ }
                }
                this.rasterProfileDrawing = false;

                // Defer the actual interaction removal to the next tick so OL
                // finishes processing the drawend event before we mutate the
                // interaction stack.
                setTimeout(() => { this._stopRasterProfileDrawing(); }, 0);

                this.queryRasterProfile(coords);
            });
        },

        _ensureRasterProfileHoverLayer() {
            if (this._rasterProfileHoverLayer) return;
            this._rasterProfileHoverSource = new VectorSource();
            this._rasterProfileHoverLayer = new VectorLayer({
                source: this._rasterProfileHoverSource,
                style: new Style({
                    image: new CircleStyle({
                        radius: 6,
                        fill: new Fill({ color: '#ff5722' }),
                        stroke: new Stroke({ color: '#ffffff', width: 2 })
                    })
                })
            });
            // Above the measurement layer so the hover dot is always visible.
            this._rasterProfileHoverLayer.setZIndex(2100);
            this.map.addLayer(this._rasterProfileHoverLayer);
        },

        _stopRasterProfileDrawing() {
            if (this._rasterProfileDraw && this.map) {
                try { this._rasterProfileDraw.setActive(false); } catch (e) { /* noop */ }
                try { this._rasterProfileDraw.abortDrawing(); } catch (e) { /* noop */ }
                try { this.map.removeInteraction(this._rasterProfileDraw); } catch (e) { /* noop */ }
            }
            this._rasterProfileDraw = null;
            this.rasterProfileDrawing = false;
            if (this._rasterProfileKeyHandler) {
                window.removeEventListener('keydown', this._rasterProfileKeyHandler);
                this._rasterProfileKeyHandler = null;
            }
            if (this._rasterProfileToolLockHeld
                && this.measureControls && typeof this.measureControls.setToolsDisabled === 'function') {
                try { this.measureControls.setToolsDisabled(false); } catch (e) { /* noop */ }
                this._rasterProfileToolLockHeld = false;
            }
        },

        /**
         * Build a static, hover-revealed tooltip overlay for a finalized
         * profile feature. Mirrors the format used by length/area
         * measurements in olMeasure.vue and `createStaticTooltip` in
         * olMeasurementConverter.js so the visual style stays consistent.
         */
        _createProfileStaticTooltip(feature) {
            if (!this.map || !feature) return;
            const geom = feature.getGeometry();
            if (!geom) return;
            const tooltipText = feature.get('tooltipText') || '';
            const name = feature.get('name');
            const el = document.createElement('div');
            el.className = 'ol-tooltip ol-tooltip-static ol-tooltip-hidden';
            let content = '';
            if (name) content += `<div class="ol-tooltip-name">${name}</div>`;
            content += `<div class="ol-tooltip-value">${tooltipText}</div>`;
            el.innerHTML = content;
            const overlay = new Overlay({
                element: el,
                offset: [0, -7],
                positioning: 'bottom-center',
                stopEvent: false,
                insertFirst: false
            });
            overlay.setPosition(geom.getLastCoordinate());
            this.map.addOverlay(overlay);
            feature.set('measureTooltipElement', el);
            feature.set('measureTooltip', overlay);
        },

        /**
         * Listen for `removefeature` on the shared measurement source so the
         * chart, hover dot, and tracked feature reference are cleared
         * whenever the profile is removed externally - eraser tool,
         * Measurement List "delete", "Clear All", or our own "Clear" button.
         * Single source of truth, no double-bookkeeping.
         */
        _setupRasterProfileMeasurementWatcher() {
            if (this._rasterProfileSourceRemoveKey) return;
            if (!this.measureControls || !this.measureControls.source) return;
            this._rasterProfileSourceRemoveKey = this.measureControls.source.on(
                'removefeature',
                (evt) => {
                    if (evt.feature && evt.feature === this._currentProfileFeature) {
                        this._currentProfileFeature = null;
                        this.rasterProfile = null;
                        this.rasterProfileError = null;
                        this._removeRasterProfileHoverMarker();
                    }
                }
            );
        },

        _tearDownRasterProfileMeasurementWatcher() {
            if (this._rasterProfileSourceRemoveKey) {
                try { unByKey(this._rasterProfileSourceRemoveKey); } catch (e) { /* noop */ }
                this._rasterProfileSourceRemoveKey = null;
            }
        },

        _removeCurrentProfileFeature() {
            if (!this._currentProfileFeature) return;
            try {
                if (this.measureControls && typeof this.measureControls.deleteMeasurement === 'function') {
                    this.measureControls.deleteMeasurement(this._currentProfileFeature);
                }
            } catch (e) { /* noop */ }
            // The removefeature watcher (if installed) will null out
            // _currentProfileFeature; null defensively in case it isn't.
            this._currentProfileFeature = null;
        },

        handleClearProfile() {
            // Single path: removing the feature from the measurement source
            // triggers _setupRasterProfileMeasurementWatcher which resets
            // the chart, error, and hover dot. We only need the side-effect
            // here for the case when no profile feature exists yet.
            this._removeCurrentProfileFeature();
            this.rasterProfile = null;
            this.rasterProfileError = null;
            this._removeRasterProfileHoverMarker();
        },

        /**
         * Cancel an in-progress draw. Wired to the panel's "Stop drawing"
         * button + ESC key. The sketch feature is not yet committed to the
         * measurement source by OL when we abort, so there is no measurement
         * cleanup to do here.
         */
        cancelRasterProfileDrawing() {
            this._stopRasterProfileDrawing();
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

        _removeRasterProfileHoverMarker() {
            if (this._rasterProfileHoverFeature && this._rasterProfileHoverSource) {
                try { this._rasterProfileHoverSource.removeFeature(this._rasterProfileHoverFeature); }
                catch (e) { /* noop */ }
            }
            this._rasterProfileHoverFeature = null;
        },

        _renderRasterProfileHoverMarker(sample) {
            if (!this.map) return;
            const valid = sample && typeof sample.lon === 'number' && typeof sample.lat === 'number';
            if (!valid) {
                this._removeRasterProfileHoverMarker();
                return;
            }
            this._ensureRasterProfileHoverLayer();
            const mapProj = this.map.getView().getProjection();
            const coord = transform([sample.lon, sample.lat], 'EPSG:4326', mapProj);
            if (!this._rasterProfileHoverFeature) {
                this._rasterProfileHoverFeature = new Feature({ geometry: new Point(coord) });
                this._rasterProfileHoverSource.addFeature(this._rasterProfileHoverFeature);
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

            // Vector layer that holds the click marker (red dot). Anchored to
            // map coordinate so it pans/zooms with the map (unlike the prior
            // clientX/Y tooltip).
            this._rasterInspectSource = new VectorSource();
            this._rasterInspectLayer = new VectorLayer({
                source: this._rasterInspectSource,
                style: new Style({
                    image: new CircleStyle({
                        radius: 6,
                        fill: new Fill({ color: 'rgba(255, 50, 50, 0.85)' }),
                        stroke: new Stroke({ color: '#ffffff', width: 2 })
                    })
                }),
                zIndex: 2100
            });
            this.map.addLayer(this._rasterInspectLayer);

            this._rasterInspectTooltipEl = document.createElement('div');
            this._rasterInspectTooltipEl.className = 'raster-inspect-tooltip';
            Object.assign(this._rasterInspectTooltipEl.style, {
                background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '4px 8px',
                borderRadius: '4px', font: '12px/1.2 sans-serif',
                whiteSpace: 'nowrap', display: 'none', pointerEvents: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
            });
            this._rasterInspectTooltipOverlay = new Overlay({
                element: this._rasterInspectTooltipEl,
                offset: [10, -10],
                positioning: 'bottom-left',
                stopEvent: false
            });
            this.map.addOverlay(this._rasterInspectTooltipOverlay);

            // Single-click handler: place/move the marker at the clicked map
            // coordinate, then fetch the value from the server.
            const onClick = (evt) => {
                if (!this.rasterInspectActive) return;
                this._placeInspectMarker(evt.coordinate);
                this._fetchInspectValueAtMapCoord(evt.coordinate);
            };
            this._rasterInspectClickKey = this.map.on('singleclick', onClick);

            this._rasterInspectKeyHandler = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) this._stopRasterInspect();
            };
            window.addEventListener('keydown', this._rasterInspectKeyHandler);
        },

        /**
         * Place (or move) the red click marker on the inspect overlay and
         * anchor the value tooltip to the same map coordinate.
         */
        _placeInspectMarker(mapCoord) {
            if (!this._rasterInspectSource) return;
            this._rasterInspectSource.clear();
            this._rasterInspectSource.addFeature(new Feature({
                geometry: new Point(mapCoord)
            }));
            if (this._rasterInspectTooltipOverlay) {
                this._rasterInspectTooltipOverlay.setPosition(mapCoord);
            }
        },

        /**
         * Locate the OpenLayers tile layer that renders `this.rasterFilePath`.
         * Falls back to scanning all map layers because Map.vue / SingleMap.vue
         * may store the raster layers either directly on the map or grouped
         * under `this.rasterLayer` (a LayerGroup).
         */
        _findRasterTileLayer() {
            if (!this.map || !this.rasterFilePath) return null;
            let found = null;
            const visit = (layer) => {
                if (found) return;
                if (!layer) return;
                if (typeof layer.getLayers === 'function') {
                    layer.getLayers().forEach(visit);
                    return;
                }
                if (layer.entryPath === this.rasterFilePath) found = layer;
            };
            this.map.getLayers().forEach(visit);
            return found;
        },

        async _ensureRasterDimsCache() {
            if (this._rasterDimsCache && this._rasterDimsCache.path === this.rasterFilePath) {
                return this._rasterDimsCache;
            }
            try {
                const info = await this.dataset.getRasterValueInfo(this.rasterFilePath);
                if (!info || !info.width || !info.height) return null;
                this._rasterDimsCache = {
                    path: this.rasterFilePath,
                    width: Number(info.width),
                    height: Number(info.height),
                    unit: info.unit || '',
                    isThermal: !!info.isThermal
                };
                return this._rasterDimsCache;
            } catch (e) {
                console.warn('[RasterAnalysis] Failed to load raster dimensions:', e);
                return null;
            }
        },

        async _fetchInspectValueAtMapCoord(mapCoord) {
            if (!this.rasterFilePath || !this.dataset) return;
            try {
                const tileLayer = this._findRasterTileLayer();
                const extent = tileLayer && tileLayer.getExtent ? tileLayer.getExtent() : null;
                if (!extent) {
                    if (this._rasterInspectTooltipEl) this._rasterInspectTooltipEl.style.display = 'none';
                    return;
                }
                const dims = await this._ensureRasterDimsCache();
                if (!dims) {
                    if (this._rasterInspectTooltipEl) this._rasterInspectTooltipEl.style.display = 'none';
                    return;
                }
                const [mx, my] = mapCoord;
                const [x0, y0, x1, y1] = extent;
                if (mx < x0 || mx > x1 || my < y0 || my > y1) {
                    if (this._rasterInspectTooltipEl) this._rasterInspectTooltipEl.style.display = 'none';
                    return;
                }
                // Pixel index: linear in extent. Y axis inverted (image origin
                // is top-left, map origin is bottom-left).
                const px = Math.max(0, Math.min(dims.width - 1,
                    Math.floor((mx - x0) / (x1 - x0) * dims.width)));
                const py = Math.max(0, Math.min(dims.height - 1,
                    Math.floor((y1 - my) / (y1 - y0) * dims.height)));

                const result = await this.dataset.getRasterPointValue(
                    this.rasterFilePath, px, py);
                if (!this.rasterInspectActive || !this._rasterInspectTooltipEl) return;
                if (!result || result.value == null || !isFinite(result.value)) {
                    this._rasterInspectTooltipEl.style.display = 'none';
                    return;
                }
                const info = {
                    value: result.value,
                    unit: result.unit || dims.unit || '',
                    isThermal: !!(result.isThermal || dims.isThermal)
                };
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
                if (!this._rasterInspectErrorLogged) {
                    this._rasterInspectErrorLogged = true;
                    console.warn('[RasterAnalysis] inspect-value query failed:', e);
                }
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
            this._rasterInspectErrorLogged = false;
            if (this._rasterInspectMoveKey) {
                try { unByKey(this._rasterInspectMoveKey); } catch (e) { /* noop */ }
            }
            this._rasterInspectMoveKey = null;
            if (this._rasterInspectClickKey) {
                try { unByKey(this._rasterInspectClickKey); } catch (e) { /* noop */ }
            }
            this._rasterInspectClickKey = null;
            if (this._rasterInspectKeyHandler) {
                window.removeEventListener('keydown', this._rasterInspectKeyHandler);
                this._rasterInspectKeyHandler = null;
            }
            if (this._rasterInspectTooltipOverlay && this.map) {
                try { this.map.removeOverlay(this._rasterInspectTooltipOverlay); } catch (e) { /* noop */ }
            }
            this._rasterInspectTooltipOverlay = null;
            this._rasterInspectTooltipEl = null;
            if (this._rasterInspectLayer && this.map) {
                try { this.map.removeLayer(this._rasterInspectLayer); } catch (e) { /* noop */ }
            }
            this._rasterInspectLayer = null;
            this._rasterInspectSource = null;
            if (this._rasterInspectThrottle) {
                clearTimeout(this._rasterInspectThrottle);
                this._rasterInspectThrottle = null;
            }
            const target = this.map && this.map.getTargetElement();
            if (target) target.style.cursor = '';
        }
    }
};

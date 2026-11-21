/**
 * Stockpile volume composable. Provides auto-detection (click-based) and
 * polygon-based volume calculation for DEM/DTM/DSM rasters.
 *
 * Host requirements:
 *  - this.dataset (Dataset instance exposing detectStockpile/calculateStockpileVolume)
 *  - this.rasterFilePath (shared with useRasterAnalysis)
 *  - this.map (OpenLayers Map instance) for interactive drawing/click flows.
 *  - optional: this.getMapCenterLatLon() → [lon, lat] for "detect at center" flow
 *  - optional: this.measurementsPath, the measurements file the map shows (where the saved piles are read)
 *  - optional: this.showFlash(message, kind), to say that a pile could not be measured again
 *
 * The panel works on one pile at a time, the chosen pile: a pile found by a click or drawn (it is added to the
 * measurements at once), a pile of the list that "Find all piles" found (shown in the Result; added to the
 * measurements with Add), or a pile already on the map, saved or not (chosen with a click on it). The base, the
 * material, the title and the description in the panel are those of the chosen pile and nothing else.
 *
 * The materials are the user's (PREF.STOCKPILE_MATERIALS), priced in the user's currency
 * (PREF.CURRENCY): the weight and the cost follow a change of the material, of the values typed
 * for a custom one, of the user's materials or currency, and the pile on the map is updated
 * with them.
 *
 * The base the volume is measured from is the one the user picks in the panel; until they pick
 * one, a pile found by a click is measured on the best-fit plane and a drawn polygon on the
 * lowest perimeter (libs/stockpileBase). The panel shows the base of the pile, and picking
 * another one measures the chosen pile again, on the elevation model it was measured on. The base, the flat
 * elevation and that elevation model are saved with the pile, so a pile is measured again wherever it was made:
 * with another base, or when the user changes its outline on the map (remeasureStockpileFeature).
 */
import { nextTick, toRaw } from 'vue';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { transform } from 'ol/proj';
import {
    buildStockpileFeature, loadStockpile, propertiesOfResult, resultOfProperties, stockpilePolygonOf, STOCKPILE_PROPERTIES
} from '@/libs/map/stockpileStorage';
import { friendlyStockpileError } from '@/libs/stockpileErrors';
import { pileListMethods, pileListState } from '@/composables/stockpilePileList';
import { onMapMethods, onMapState } from '@/composables/stockpileOnMap';
import {
    CUSTOM_MATERIAL_SLUG,
    computeMaterialEstimate,
    isValidCost,
    isValidDensity,
    materialOfSavedPile,
    normalizeStockpileSettings,
    resolveStockpileCatalog,
    samePricing
} from '@/libs/stockpileMaterials';
import { usePreference } from '@/composables/usePreference';
import { normalizeCurrency, stockpileLabel } from '@/libs/format';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { downloadText } from '@/libs/download';
import { pathutils } from 'ddb';
import { ANALYSIS_FILL, analysisStyles } from '@/libs/map/analysisStyles';
import { EPSG } from '@/libs/constants';
import { BASE_METHOD, PILE_OUTLINE, baseMethodFor, isBaseMethod } from '@/libs/stockpileBase';
import { createFeatureScope } from '@/composables/featureScope';
import { startDrawingSession } from '@/libs/map/drawingSession';

function stockpileStyle() {
    return analysisStyles({ width: 2, fill: ANALYSIS_FILL });
}

// The material of a restored pile whose values are not those of any of the user's materials
const SAVED_MATERIAL_SLUG = '__saved__';

// What the pile on the map takes from the panel when it changes (its id, its save time and the key of the outline it
// was found with stay)
const CHOSEN_PILE_PROPERTIES = ['name', 'description', 'tooltipText',
    ...STOCKPILE_PROPERTIES.filter(k => k !== 'id' && k !== 'savedAt' && k !== 'detectionKey')];

const definition = {
    data() {
        return {
            ...pileListState(),
            ...onMapState(),
            stockpilePanelVisible: false,
            // The base of the pile shown (or of the next one); see chooseStockpileBaseMethod
            stockpileBaseMethod: BASE_METHOD.LOWEST_PERIMETER,
            // The base the user picked in the panel for the piles to come, null until they pick one
            _chosenStockpileBaseMethod: null,
            // The elevation of the flat base (metres), of the pile shown or of the next one
            stockpileFlatElevation: 0,
            stockpileSensitivity: 0.5,
            stockpileRadius: 50,
            stockpileMaterial: null,
            stockpileCustomDensity: 1.5,    // t/m³
            stockpileCustomCostPerTon: 0,   // currency unit per ton
            // A restored pile's material when it is not one of the user's (see _restoreStockpileMaterial)
            _savedStockpileMaterial: null,
            stockpileLoading: false,
            stockpileError: null,
            stockpileResult: null,
            stockpileDetectedPolygon: null,
            stockpileMode: null, // 'click' | 'draw' | null
            // User-editable identification of the chosen pile.
            stockpileTitle: '',
            stockpileDescription: '',
            // Non-reactive OL refs (mutated directly).
            _stockpileLayer: null,
            _stockpileSource: null,
            // The drawing session of the Click map or the Draw mode (libs/map/drawingSession): it owns
            // the interaction, the keys, the crosshair and the measurement toolbar's lock
            _stockpileSession: null,
            _stockpilePrevCursor: '',
            // Id of the chosen pile's feature in the shared measurement layer, saved or not: what the panel's
            // title, material and base are applied to. None while the panel shows a pile of the list that is
            // not added yet, or a pile that has no feature on the map.
            _chosenStockpileFeatureId: null,
            // Id of the pile just found by a click or drawn, which Clear removes while it is not saved
            _draftStockpileFeatureId: null,
            // The elevation model of the piles saved before it was recorded (see loadStockpile)
            _legacyStockpileRaster: null,
            // The panel is putting a pile into its fields: the watchers of the fields leave the pile alone
            _applyingPile: false,
            // Counts the opens and closes of the panel and the piles measured in it: a saved pile
            // read for an earlier one is not shown (the panel may be open on another raster by
            // the time it is read, or show a pile the user measured meanwhile)
            _stockpileRestoreTurn: 0
        };
    },
    computed: {
        /** The currency of the user's prices (a general setting) */
        stockpileCurrency() {
            return normalizeCurrency(this.userCurrency);
        },
        /** The user's materials, hidden ones included */
        stockpileCatalog() {
            return resolveStockpileCatalog(normalizeStockpileSettings(this.stockpileSettings), this.stockpileCurrency);
        },
        /** The materials the panel offers: a restored pile's own one first, then the shown ones */
        stockpileMaterials() {
            const shown = this.stockpileCatalog.filter(m => !m.hidden);
            return this._savedStockpileMaterial ? [this._savedStockpileMaterial, ...shown] : shown;
        },
        /** The elevation model the chosen pile was measured on, when it is not the one the panel is on; else null */
        stockpileMeasuredOn() {
            const raster = this.stockpileResult?.sourceRaster;
            return raster && raster !== this.rasterFilePath ? raster : null;
        },
        /** The name of the chosen pile: its title, or its row of the list; '' when the panel shows none */
        stockpileChosenName() {
            if (this._chosenStockpileFeatureId) return this.stockpileTitle.trim() || 'Untitled pile';
            const rank = (this.stockpilePiles ?? []).findIndex(p => p.id === this.stockpileChosenPile);
            return rank >= 0 && this.stockpileResult ? `Pile ${rank + 1}` : '';
        },
        /** Whether the outline of the chosen pile can be edited: it is a measurement on the map */
        stockpileCanEditOutline() {
            return !!this._chosenStockpileFeatureId;
        }
    },
    watch: {
        // Keep the in-memory feature's properties in sync with what the
        // user types in the panel so the toolbar Save button captures the
        // latest title / notes / material without an extra "Apply" click.
        stockpileTitle() { this._patchChosenStockpileProps(); },
        stockpileDescription() { this._patchChosenStockpileProps(); },
        // The weight and the cost follow the material and its values
        stockpileMaterial() { this._refreshStockpileEstimate(); },
        stockpileCustomDensity() { this._refreshStockpileEstimate(); },
        stockpileCustomCostPerTon() { this._refreshStockpileEstimate(); },
        // The user's materials changed (here, in the Preferences, on another device)
        stockpileMaterials(materials) {
            const slug = this.stockpileMaterial;
            if (slug && slug !== CUSTOM_MATERIAL_SLUG && !materials.some(m => m.slug === slug)) {
                // Removed or hidden: nothing to weigh the pile with (the watcher above refreshes)
                this.stockpileMaterial = null;
            } else {
                this._refreshStockpileEstimate();
            }
        }
    },
    // The drawing session of Click map and Draw ends with the map, and so do the click on the map and the pauses
    beforeUnmount() {
        this._stopStockpileInteractions();
        this._endStockpileEdit();
        this._unbindStockpileMapClick();
        this._dropAllRemeasures();
    },
    methods: {
        ...pileListMethods,
        ...onMapMethods,
        async openStockpileVolume(file) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path || !this.dataset) return;

            this.rasterFilePath = path;
            this.stockpilePanelVisible = true;
            // A measurement of the raster the panel was on is over for it (its answer is dropped)
            this.stockpileLoading = false;
            this.stockpileError = null;
            this._legacyStockpileRaster = null;
            this._resetStockpilePiles();
            this._forgetChosenStockpile();
            // The pile drawn for the raster the panel was open on is not this raster's
            this._clearStockpileOverlay();
            this._bindStockpileMapClick();
            // Restore a previously saved stockpile (if any) so the user sees it on the map.
            this._loadSavedStockpile();
        },

        async _loadSavedStockpile() {
            if (!this.rasterFilePath || !this.dataset || !this.measurementsPath) return;
            const turn = ++this._stockpileRestoreTurn;
            const path = this.rasterFilePath;
            try {
                // Skip stockpiles the user has just removed via the Measurement
                // List dialog (deletion is in-memory until the next save).
                const saved = await loadStockpile(this.dataset, this.measurementsPath, path, this.deletedMeasurementIds);
                // The panel closed, opened again (on another raster) or measured a pile while the file was read
                if (!saved || turn !== this._stockpileRestoreTurn || path !== this.rasterFilePath) return;
                this._legacyStockpileRaster = saved.defaultRaster;
                // The pile is on the map as a measurement (the file was imported when it was shown): that is the
                // one the panel works on. Otherwise (no map, a pile that is not shown) the panel only shows it,
                // with its polygon in the overlay.
                const feature = this._stockpileFeatureById(saved.properties.id);
                if (feature) {
                    this.selectStockpileFeature(feature);
                } else {
                    this._renderStockpilePolygon(saved.polygon);
                    this._showStockpile(saved.polygon, saved.properties, null);
                }
            } catch (e) {
                console.warn('Could not restore saved stockpile:', e);
            }
        },

        /**
         * Put a pile into the panel: its volumes, its base, its material and its identification, as they are
         * saved. Nothing is written to the pile, whatever the watchers of the fields do with the values.
         * @param {object} polygon  the outline, a WGS84 GeoJSON polygon
         * @param {Record<string, any>} p  the properties of the pile
         * @param {string|null} featureId  the id of its feature on the map, null when it has none
         */
        _showStockpile(polygon, p, featureId) {
            this._applyingPile = true;
            this._chosenStockpileFeatureId = featureId;
            this.stockpileDetectedPolygon = polygon;
            this.stockpileError = null;
            this.stockpileResult = resultOfProperties(p);
            this.stockpileFlatElevation = typeof p.flatElevation === 'number' ? p.flatElevation : 0;
            // The panel shows the base the pile was measured from (piles saved before the
            // base was saved with them leave the panel's as it is)
            if (isBaseMethod(p.basePlaneMethod)) this.stockpileBaseMethod = p.basePlaneMethod;
            this._savedStockpileMaterial = null;
            this._restoreStockpileMaterial(p);
            this.stockpileTitle = p.title || '';
            // `description` is the canonical key; `notes` is read for
            // backwards compatibility with stockpiles saved before the
            // rename and migrated into `description` on next save.
            this.stockpileDescription = p.description || p.notes || '';
            // The watchers of the fields run before this
            nextTick(() => { this._applyingPile = false; });
        },

        /**
         * Choose a pile that is on the map, saved or not: the panel shows it and works on it from now on (the
         * base, the material, the title and the description are its own, and Edit outline edits it).
         * @param {import('ol/Feature').default} feature  a feature of `measurementType` 'stockpile'
         */
        selectStockpileFeature(feature) {
            if (!feature || !feature.get || feature.get('measurementType') !== 'stockpile') return;
            const polygon = stockpilePolygonOf(feature, this._mapProjection());
            if (!polygon) return;
            const p = { ...feature.getProperties() };
            if (this._chosenStockpileFeatureId !== p.id) this._endStockpileEdit();
            this._stopStockpileInteractions();
            // A pile being measured, or a saved one being read, is not the chosen one any more
            this._stockpileRestoreTurn++;
            this.stockpileLoading = false;
            // A pile saved before the model was recorded was measured on the one of its file
            const sourceRaster = p.sourceRaster ?? this._legacyStockpileRaster;
            if (sourceRaster) p.sourceRaster = sourceRaster;
            this._showStockpile(polygon, p, p.id ?? null);
            this._setChosenPileRow(this._pileRowOf(p.id));
        },

        /**
         * Select the material a restored pile was weighed and priced with. When it is one of the
         * user's materials with the same values it is selected as such; otherwise (another
         * user's material, a hidden one, prices changed since) the panel offers it as it was
         * saved, so the saved weight and cost stay what they were. A pile with no material
         * leaves the panel with none.
         * @param {Record<string, any>} p  the saved feature's properties
         */
        _restoreStockpileMaterial(p) {
            const slug = p.material;
            if (!slug) {
                this.stockpileMaterial = null;
                return;
            }
            const saved = materialOfSavedPile(p);
            if (slug === CUSTOM_MATERIAL_SLUG) {
                if (saved) {
                    this.stockpileCustomDensity = saved.densityTonPerM3;
                    this.stockpileCustomCostPerTon = saved.costPerTon;
                }
                this.stockpileMaterial = slug;
                return;
            }
            const current = this.stockpileCatalog.find(m => m.slug === slug && !m.hidden);
            if (current && (!saved || samePricing(current, saved))) {
                this.stockpileMaterial = slug;
            } else if (saved) {
                this._savedStockpileMaterial = {
                    ...saved, slug: SAVED_MATERIAL_SLUG, sourceSlug: slug, category: '',
                    builtIn: false, edited: false, hidden: false, saved: true
                };
                this.stockpileMaterial = SAVED_MATERIAL_SLUG;
            } else {
                this.stockpileMaterial = null;
            }
        },

        /**
         * The material the pile is weighed with: one of the offered materials, or the values
         * typed for a custom one; null without a material or with an invalid custom density.
         * `sourceSlug` is the slug saved with the pile when it differs from `slug`.
         */
        _selectedStockpileMaterial() {
            const slug = this.stockpileMaterial;
            if (!slug) return null;
            if (slug === CUSTOM_MATERIAL_SLUG) {
                const density = Number(this.stockpileCustomDensity);
                if (!isValidDensity(density)) return null;
                const cost = Number(this.stockpileCustomCostPerTon);
                return {
                    slug, name: 'Custom material', densityTonPerM3: density,
                    costPerTon: isValidCost(cost) ? cost : 0, currency: this.stockpileCurrency
                };
            }
            return this.stockpileMaterials.find(m => m.slug === slug) ?? null;
        },

        /** `result` with the weight and the cost of the selected material (none without one). */
        _withStockpileEstimate(result) {
            const rest = { ...result };
            delete rest.weightEstimate;
            delete rest.costEstimate;
            const estimate = computeMaterialEstimate(rest, this._selectedStockpileMaterial());
            return estimate ? { ...rest, ...estimate } : rest;
        },

        /** Weigh the current result again, and update the pile on the map with it. */
        _refreshStockpileEstimate() {
            if (this._applyingPile) return;
            if (this.stockpileResult) this.stockpileResult = this._withStockpileEstimate(this.stockpileResult);
            this._patchChosenStockpileProps();
        },

        /** The stockpile feature of the measurement layer with this id (the raw OpenLayers feature), or null. */
        _stockpileFeatureById(id) {
            const mc = this.measureControls;
            if (!id || !mc || !mc.source) return null;
            const feature = mc.source.getFeatures().find(f => f.get('measurementType') === 'stockpile' && f.get('id') === id);
            return feature ? toRaw(feature) : null;
        },

        /** The projection of the map (the one the outlines of the features are in). */
        _mapProjection() {
            return (this.map && this.map.getView && this.map.getView().getProjection()) || EPSG.WEB_MERCATOR;
        },

        /**
         * Hook invoked by the measure control (through MapCore) whenever a
         * feature is removed from the shared measurement source. The row of the pile
         * loses its check mark, a measuring of the pile in wait is dropped and, when the removed
         * feature is the chosen pile (eraser tool, edit dialog Delete button, list-dialog delete, ...),
         * reset the panel so the result fields, polygon reference and identification inputs no
         * longer point to a feature that is gone from the map.
         */
        _onStockpileFeatureRemoved(feature) {
            if (!feature || !feature.get) return;
            if (feature.get('measurementType') !== 'stockpile') return;
            const id = feature.get('id');
            if (!id) return;
            this._dropRemeasure(id);
            const row = this._pileRowOf(id);
            if (row !== null) this._releasePileRow(row);
            if (id === this._draftStockpileFeatureId) this._draftStockpileFeatureId = null;
            if (id !== this._chosenStockpileFeatureId) return;
            this.stockpileError = null;
            this._forgetChosenStockpile();
            this._clearStockpileOverlay();
        },

        /**
         * The panel shows no pile any more: no result, outline, title or description, and no feature it works on.
         * The feature itself stays on the map.
         */
        _forgetChosenStockpile() {
            this._chosenStockpileFeatureId = null;
            this._endStockpileEdit();
            this._setChosenPileRow(null);
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
            this._savedStockpileMaterial = null;
        },

        closeStockpileVolume() {
            this._stockpileRestoreTurn++;
            this.stockpileLoading = false;
            this._resetStockpilePiles();
            this._unbindStockpileMapClick();
            this.stockpilePanelVisible = false;
            this.stockpileError = null;
            this._forgetChosenStockpile();
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
            // Forget the draft id so the next session can adopt a fresh
            // polygon. The feature itself stays in the measurements layer
            // until the user persists or removes it via the toolbar.
            this._draftStockpileFeatureId = null;
        },

        clearStockpileOverlay() {
            // A measurement in flight is over for the panel: its answer is dropped (see _stockpileCall)
            this._stockpileRestoreTurn++;
            this.stockpileError = null;
            this._resetStockpilePiles();
            // Reset the loading flag so an in-flight detection that is taking
            // too long no longer blocks the panel: the request itself still
            // completes in the background, and its answer is dropped because
            // the turn moved on above.
            this.stockpileLoading = false;
            this._stopStockpileInteractions();
            this._clearStockpileOverlay();
            // The pile just found, not saved yet, is removed from the shared measurement layer (with its floating
            // label), otherwise the label stays orphaned on the map. A pile that is in the saved
            // file stays: Clear resets the panel and the overlay only, and removing it from the
            // map would delete it from the dataset with the next Save. A pile the user added from the list or
            // chose on the map is theirs: it stays, saved or not.
            const id = this._draftStockpileFeatureId;
            const mc = this.measureControls;
            if (id && id === this._chosenStockpileFeatureId && !(mc && mc.isSaved(id))) {
                this._removeDraftStockpileFromMeasureSource();
            }
            // The panel no longer tracks the pile, so a pile found next is a new one
            this._forgetChosenStockpile();
            this._draftStockpileFeatureId = null;
        },

        /**
         * A new pile is measured (found by a click or drawn): an independent pile, so it is
         * detached from the previous one and the identification fields are reset, otherwise
         * the previously-typed title/description would bleed into the next adopted feature (and
         * the watcher would overwrite the previous pile). It takes the turn of a saved pile still
         * being read, so that pile does not replace this one when it arrives. No pile of the list
         * is the chosen one.
         */
        _startNewStockpile() {
            this._stockpileRestoreTurn++;
            this.stockpileLoading = true;
            this.stockpileError = null;
            this._chosenStockpileFeatureId = null;
            this._endStockpileEdit();
            this._setChosenPileRow(null);
            this._draftStockpileFeatureId = null;
            this.stockpileTitle = '';
            this.stockpileDescription = '';
        },

        /**
         * What a call that measures a pile holds on to while it waits for the server: the turn of the panel
         * and the raster it was made for. Clear, Close, another raster, another pile or a saved pile read
         * each move the turn on, and the answer of the call that waited is then not this panel's.
         * @returns {{ turn: number, path: string }}
         */
        _stockpileCall() {
            return { turn: this._stockpileRestoreTurn, path: this.rasterFilePath };
        },

        /** Whether the panel is still where the call (see _stockpileCall) left it. */
        _isCurrentStockpileCall(call) {
            return call.turn === this._stockpileRestoreTurn && call.path === this.rasterFilePath;
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
            this._startNewStockpile();
            const call = this._stockpileCall();
            try {
                const detection = await this.dataset.detectStockpile(call.path, lat, lon, {
                    radius: this.stockpileRadius,
                    sensitivity: this.stockpileSensitivity
                });
                await this._measureDetectedStockpile(detection, call);
            } catch (e) {
                console.error('Stockpile detection/calculation failed:', e);
                if (!this._isCurrentStockpileCall(call)) return;
                this.stockpileError = friendlyStockpileError(e && e.message,
                    'Stockpile detection failed. Please try a different point or adjust the parameters.');
                this.stockpileResult = null;
            } finally {
                if (this._isCurrentStockpileCall(call)) this.stockpileLoading = false;
            }
        },

        /**
         * Measure a pile a click found (one `detect` answer: `polygon`, `confidence`) from the base of the panel, show
         * it and adopt it as the draft pile on the map. Nothing is shown or adopted when the panel moved on (Clear,
         * Close, another raster or pile) while it was measured.
         * @param {object} detection
         * @param {{ turn: number, path: string }} call  the call that asked (see _stockpileCall)
         */
        async _measureDetectedStockpile(detection, call) {
            if (!this._isCurrentStockpileCall(call)) return;
            this.stockpileDetectedPolygon = detection.polygon;
            this.stockpileBaseMethod = baseMethodFor(PILE_OUTLINE.DETECTED, this._chosenStockpileBaseMethod);
            const volume = await this._measureStockpile(detection.polygon, call.path);
            if (!this._isCurrentStockpileCall(call)) return;
            this.stockpileResult = this._withStockpileEstimate({ ...volume, confidence: detection.confidence });
            this._adoptDraftStockpile(detection.polygon);
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
            this._startNewStockpile();
            const call = this._stockpileCall();
            try {
                this.stockpileBaseMethod = baseMethodFor(PILE_OUTLINE.DRAWN, this._chosenStockpileBaseMethod);
                const volume = await this._measureStockpile(polygonGeoJson, call.path);
                if (!this._isCurrentStockpileCall(call)) return;
                this.stockpileResult = this._withStockpileEstimate(volume);
                this.stockpileDetectedPolygon = polygonGeoJson;
                this._adoptDraftStockpile(polygonGeoJson);
            } catch (e) {
                console.error('Stockpile calculation failed:', e);
                if (!this._isCurrentStockpileCall(call)) return;
                this.stockpileError = friendlyStockpileError(e && e.message,
                    'Cannot calculate volume for this polygon. Make sure it covers a valid elevated area inside the raster.');
                this.stockpileResult = null;
            } finally {
                if (this._isCurrentStockpileCall(call)) this.stockpileLoading = false;
            }
        },

        /**
         * The volume of `polygon` above a base, with the base it was measured from and the raster it was
         * measured on: what is saved with the pile, so that it can be measured again.
         * @param {object} polygon  GeoJSON polygon, WGS84
         * @param {string} path  the raster to measure on (the panel may be on another one by the answer)
         * @param {string} [baseMethod]  default: the base of the panel
         * @param {number} [flatElevation]  default: the flat elevation of the panel
         */
        async _measureStockpile(polygon, path, baseMethod = this.stockpileBaseMethod, flatElevation = this.stockpileFlatElevation) {
            const volume = await this.dataset.calculateStockpileVolume(path, polygon, { baseMethod, flatElevation });
            return { ...volume, basePlaneMethod: volume.basePlaneMethod ?? baseMethod, sourceRaster: path, flatElevation };
        },

        /**
         * The user picks the base in the panel. It is the base of the chosen pile and of that pile only: the pile
         * is measured again from it, on the elevation model it was measured on. With no pile on the map chosen (the
         * panel shows a pile of the list, or none) it is the base of the piles to come: those found by a click, drawn
         * or listed, and the list is measured again from it.
         * @param {string} method
         */
        async chooseStockpileBaseMethod(method) {
            if (!isBaseMethod(method)) return;
            if (!this._chosenStockpileFeatureId) this._chosenStockpileBaseMethod = method;
            if (method === this.stockpileBaseMethod) return;
            this.stockpileBaseMethod = method;
            await this._remeasureWorkingStockpile();
        },

        /**
         * The user types the elevation of the flat base: as for the base, the chosen pile (or the list) is
         * measured again from it when the base is flat; else it is kept for when it is.
         * @param {number} elevation  metres
         */
        async chooseStockpileFlatElevation(elevation) {
            const flat = Number(elevation);
            if (!Number.isFinite(flat) || flat === this.stockpileFlatElevation) return;
            this.stockpileFlatElevation = flat;
            if (this.stockpileBaseMethod === BASE_METHOD.FLAT) await this._remeasureWorkingStockpile();
        },

        /** Measure what the panel shows again from the base and the flat elevation of the panel. */
        async _remeasureWorkingStockpile() {
            const feature = this._stockpileFeatureById(this._chosenStockpileFeatureId);
            if (feature) {
                await this._remeasureChosenStockpile(feature);
            } else if (this.stockpilePiles) {
                await this._measureStockpilePiles();
            }
        },

        /**
         * Measure the chosen pile again from the base of the panel, with the panel waiting. When it cannot be
         * measured the pile keeps the volumes (and the base) it had, and the panel says why.
         */
        async _remeasureChosenStockpile(feature) {
            if (this.stockpileLoading) return;
            const baseMethod = this.stockpileBaseMethod;
            const flatElevation = this.stockpileFlatElevation;
            this.stockpileLoading = true;
            this.stockpileError = null;
            const call = this._stockpileCall();
            const id = feature.get('id');
            const outcome = await this._recalculateStockpile(feature, { baseMethod, flatElevation });
            // Cleared, or another pile or raster chosen, meanwhile
            if (!this._isCurrentStockpileCall(call) || this._chosenStockpileFeatureId !== id) return;
            this.stockpileLoading = false;
            if (outcome.status !== 'failed') return;
            // The panel keeps the volumes of the pile, so it shows the base they are from
            const previous = feature.getProperties();
            if (isBaseMethod(previous.basePlaneMethod)) this.stockpileBaseMethod = previous.basePlaneMethod;
            this.stockpileFlatElevation = typeof previous.flatElevation === 'number' ? previous.flatElevation : 0;
            this.stockpileError = friendlyStockpileError(outcome.error && outcome.error.message,
                'Cannot calculate the volume of this pile from the selected base.');
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
         * Engage "single click on map" capture: the next map click (or Space / Enter at the crosshair) triggers
         * `autoDetectAndCalculate` at that coordinate. A drawing session of one point (FR-XC-17, D-027).
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
            const mapProj = this.map.getView().getProjection();
            this._stockpileSession = this._startStockpileSession({
                type: 'Point',
                hintKind: 'pick',
                onDrawEnd: (evt) => {
                    const [lon, lat] = transform(evt.feature.getGeometry().getCoordinates(), mapProj, EPSG.WGS84);
                    // The mode is over before the detection runs; the session leaves with this click
                    this.stockpileMode = null;
                    this.stockpileError = null;
                    this.autoDetectAndCalculate(lon, lat);
                }
            });
        },

        /**
         * Activate a Polygon drawing session (FR-XC-17, D-027): click (or Space at the crosshair) adds a corner, a
         * double click, Enter or a right click finishes, Esc cancels. When the polygon is finished it is converted to
         * WGS84 GeoJSON and passed to `calculateStockpileVolume`.
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

            this._stockpileSession = this._startStockpileSession({
                type: 'Polygon',
                source: this._stockpileSource,
                style: stockpileStyle(),
                onDrawEnd: (evt) => {
                    this.stockpileError = null;
                    // The panel button shows the mode is over at once; the session leaves with this shape
                    this.stockpileMode = null;
                    const mapProjForEnd = this.map.getView().getProjection();
                    const geom = evt.feature.getGeometry().clone().transform(mapProjForEnd, EPSG.WGS84);
                    const coords = geom.getCoordinates();
                    if (!coords || !coords[0] || coords[0].length < 4) {
                        this.stockpileError = 'A polygon with at least 3 vertices is required.';
                        return;
                    }
                    this.calculateStockpileVolume({ type: 'Polygon', coordinates: coords });
                }
            });
        },

        /**
         * The drawing session of a stockpile mode. It locks the measurement toolbar while it runs, so a regular
         * measurement cannot start on top, and ends by itself with the first shape. Esc ends the mode; what the
         * mode showed goes with it.
         */
        _startStockpileSession(options) {
            // A new pile is drawn or picked: the edit of an outline is over
            this._endStockpileEdit();
            let session = null;
            session = startDrawingSession({
                map: this.map,
                toolbar: () => this.measureControls,
                once: true,
                ...options,
                onEnd: (reason) => {
                    // Stopped from here (_stopStockpileInteractions): nothing more to do
                    if (this._stockpileSession !== session) return;
                    this._stockpileSession = null;
                    this.stockpileMode = null;
                    this._setStockpileCursor('');
                    if (reason === 'abort') {
                        // Esc: the polygon being drawn and the earlier overlay go, and so does the message
                        if (this._stockpileSource) this._stockpileSource.clear();
                        this.stockpileError = null;
                    }
                }
            });
            return session;
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
                ring.map(c => transform(c, EPSG.WGS84, mapProj))
            );
            const feature = new Feature({ geometry: new Polygon(coords) });
            feature.setStyle(stockpileStyle());
            this._stockpileSource.addFeature(feature);
        },

        _clearStockpileOverlay() {
            if (this._stockpileSource) this._stockpileSource.clear();
        },

        _stopStockpileInteractions() {
            const session = this._stockpileSession;
            this._stockpileSession = null;
            // Drops the shape being drawn, the interaction, the keys, the crosshair and the toolbar lock
            if (session) session.end('abort');
            this.stockpileMode = null;
            this._setStockpileCursor('');
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
         * @param {Record<string, any>|null} [result]  what was measured (default: the result of the panel)
         * @param {{ identify?: boolean }} [options]  `identify`: the title and the description of the panel are the pile's
         *   (not for a pile of the list that is not the chosen one)
         */
        _buildStockpileProperties(result = this.stockpileResult, { identify = true } = {}) {
            const material = this._selectedStockpileMaterial();
            const props = { material: material?.sourceSlug ?? (this.stockpileMaterial || null) };
            const title = identify ? (this.stockpileTitle || '').trim() : '';
            const description = identify ? (this.stockpileDescription || '').trim() : '';
            if (title) props.title = title;
            if (description) props.description = description;
            // What the pile is weighed and priced with, so it reads the same for every user
            if (material) {
                props.materialName = material.name;
                props.materialDensity = material.densityTonPerM3;
                props.costPerTon = material.costPerTon;
                props.currency = material.currency;
            }
            if (this.currentUnitPref) props.unitSystem = this.currentUnitPref;
            Object.assign(props, propertiesOfResult(result));
            // tooltipText is what the Measurement List dialog shows in the
            // "Value" column; build a compact human description here so the
            // saved feature looks meaningful when re-imported.
            props.tooltipText = stockpileLabel(props, this.currentUnitPref);
            // The user-visible name in the list (preferred over a generic label).
            if (title) props.name = title;
            return props;
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
            try {
                const [id] = this._importStockpiles([{ polygon, properties: this._buildStockpileProperties() }]);
                if (!id) return;
                this._chosenStockpileFeatureId = id;
                this._draftStockpileFeatureId = id;
                // Drop our temporary draw overlay - the polygon now lives in
                // the regular measurements layer.
                this._clearStockpileOverlay();
            } catch (e) {
                console.warn('Could not adopt stockpile into measurement layer:', e);
            }
        },

        /**
         * Put piles into the shared measurements layer, in one import.
         * @param {Array<{ polygon: object, properties: Record<string, any> }>} piles
         * @returns {string[]}  the id of the feature of each pile, none when there is no measure control to take them
         */
        _importStockpiles(piles) {
            const mc = this.measureControls;
            if (!mc || typeof mc.importFromGeoJSON !== 'function') return [];
            const features = piles.map(({ polygon, properties }) => buildStockpileFeature(polygon, properties));
            mc.importFromGeoJSON({
                type: 'FeatureCollection',
                metadata: { application: 'DroneDB Registry', kind: 'measurements' },
                features
            });
            mc.refreshButtons();
            return features.map(f => f.properties.id);
        },

        /**
         * Remove the draft stockpile feature (if previously adopted) from the
         * shared measurement layer. Uses deleteMeasurement so the floating
         * volume label (OL Overlay + DOM) is cleaned up too.
         */
        _removeDraftStockpileFromMeasureSource() {
            const feature = this._stockpileFeatureById(this._draftStockpileFeatureId);
            if (!feature) return;
            try {
                this.measureControls.deleteMeasurement(feature);
            } catch {
                try { this.measureControls.source.removeFeature(feature); } catch { /* noop */ }
            }
            this._draftStockpileFeatureId = null;
        },

        /**
         * Patch the in-place properties of the chosen pile's feature when the
         * user edits title / notes / material in the panel. Avoids rebuilding
         * the geometry and keeps the same feature id so the toolbar Save
         * captures the latest values. Not while the panel is putting a pile into its fields.
         */
        _patchChosenStockpileProps() {
            if (this._applyingPile) return;
            const feature = this._stockpileFeatureById(this._chosenStockpileFeatureId);
            if (!feature) return;
            const props = this._buildStockpileProperties();
            // Don't touch geometry/style props that were set at build time.
            CHOSEN_PILE_PROPERTIES.forEach(k => {
                if (props[k] !== undefined) feature.set(k, props[k]);
                else feature.unset && feature.unset(k);
            });
            feature.changed();
        },

        /**
         * Export the currently displayed pile contour as a GeoJSON Feature
         * (downloaded as a file). Only available when a polygon has been computed.
         */
        // Public names for the map view (template and measure control)
        stopStockpileInteractions() { this._stopStockpileInteractions(); },
        onStockpileFeatureRemoved(feature) { this._onStockpileFeatureRemoved(feature); },

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
            const baseName = pathutils.stem(this.rasterFilePath || 'stockpile');
            downloadText(JSON.stringify(feature, null, 2), `${baseName}-stockpile.geojson`, 'application/geo+json');
        }
    }
};

/**
 * The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function useStockpileVolume(externals) {
    const stockpileSettings = usePreference(PREF.STOCKPILE_MATERIALS, PREF_DEFAULTS[PREF.STOCKPILE_MATERIALS]);
    const userCurrency = usePreference(PREF.CURRENCY, PREF_DEFAULTS[PREF.CURRENCY]);
    return createFeatureScope({ ...definition, externals: { ...externals, stockpileSettings, userCurrency } });
}

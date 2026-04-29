/**
 * Mixin for Plant Health (multispectral visualization) functionality.
 * Shared between Map.vue and SingleMap.vue.
 *
 * Requirements:
 * - Component must have `this.dataset` (Dataset instance)
 * - Component must have a rasterLayer (LayerGroup) with tile layers
 * - Component must import and register PlantHealthPanel component
 * - Component must call `this.refreshRasterLayers()` when vizParams change
 */
import HybridXYZ from '@/libs/map/olHybridXYZ';

export default {
    data() {
        return {
            plantHealthVisible: false,
            plantHealthFilePath: null,
            plantHealthInitialParams: null,
            // Latest viz params emitted by the currently-open analysis panel.
            // Kept for backwards compatibility with consumers that still read
            // it directly; the canonical store is `vizParamsByPath` below.
            currentVizParams: {},
            // Per-file viz-params cache. Each Plant Health / Raster Analysis
            // panel writes its current params here when the user changes the
            // colormap, formula, or rescale, and reads them back on reopen so
            // switching between mutually-exclusive analysis panels doesn't
            // drop styling. The cache is also consulted by
            // `refreshRasterLayers` so any layer with a remembered viz state
            // stays styled even when no panel is currently open.
            vizParamsByPath: {}
        };
    },
    methods: {
        openPlantHealth(file, options) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path) return;
            // Mutually-exclusive analysis panels.
            if (typeof this.closeRasterAnalysis === 'function') this.closeRasterAnalysis();
            if (typeof this.closeStockpileVolume === 'function') this.closeStockpileVolume();
            this.plantHealthFilePath = path;
            this.plantHealthVisible = true;
            // Restore previously-applied viz params for this file so the
            // panel UI (formula / colormap / rescale) reflects the live
            // styling of the layer instead of resetting to defaults.
            const cached = this.vizParamsByPath && this.vizParamsByPath[path];
            if (options) {
                this.plantHealthInitialParams = options;
            } else if (cached && Object.keys(cached).length) {
                this.plantHealthInitialParams = { ...cached };
            } else {
                this.plantHealthInitialParams = null;
            }
            if (cached && Object.keys(cached).length) {
                this.currentVizParams = { ...cached };
            }
        },

        closePlantHealth() {
            this.plantHealthVisible = false;
            this.plantHealthFilePath = null;
            this.plantHealthInitialParams = null;
            // Note: `vizParamsByPath` is intentionally preserved so the next
            // panel that opens (or the next refreshRasterLayers tick) can
            // restore the styling. `currentVizParams` is reset only because
            // it represents the "active panel emitting" state, which no
            // longer applies once the panel is closed.
            this.currentVizParams = {};
            this.refreshRasterLayers();
        },

        handleVizParamsChanged(params) {
            this.currentVizParams = params;
            const path = this.plantHealthFilePath;
            if (path) {
                if (params && Object.keys(params).length) {
                    this.vizParamsByPath = { ...this.vizParamsByPath, [path]: { ...params } };
                } else if (this.vizParamsByPath[path]) {
                    const next = { ...this.vizParamsByPath };
                    delete next[path];
                    this.vizParamsByPath = next;
                }
            }
            this.refreshRasterLayers();
        },

        refreshRasterLayers() {
            if (!this.rasterLayer) return;

            this.rasterLayer.getLayers().forEach(layer => {
                const layerPath = this._getLayerPath(layer);
                if (!layerPath) return;

                const source = layer.getSource();
                if (!source) return;

                // Apply viz params from the per-file cache so layers stay
                // styled across panel switches and panel close. The active
                // panel's `currentVizParams` is mirrored into the cache by
                // its `handle*VizParamsChanged` hook, so reading the cache
                // is sufficient.
                const cached = this.vizParamsByPath && this.vizParamsByPath[layerPath];
                const vizParams = cached && Object.keys(cached).length ? cached : {};

                const url = this._getLayerUrl(layer);
                if (!url) return;

                const newSource = new HybridXYZ({
                    url,
                    tileSize: 256,
                    transition: 200,
                    minZoom: 14,
                    maxZoom: 22,
                    vizParams: Object.keys(vizParams).length > 0 ? vizParams : undefined
                });
                layer.setSource(newSource);
            });
        },

        /**
         * Restore Plant Health state from URL hash parameters.
         * Call this after raster layers are loaded.
         */
        restorePlantHealthFromHash(files) {
            if (this._phHashRestored) return;
            const hash = window.location.hash;
            if (!hash || hash.length <= 1) return;

            try {
                const params = new URLSearchParams(hash.substring(1));
                const path = params.get('path');
                if (!path) return;

                // Check if file exists in list (Map.vue) or matches entry (SingleMap.vue)
                if (files) {
                    const file = files.find(f => f.entry && f.entry.path === path);
                    if (!file) return;
                } else if (this.entry) {
                    if (this.entry.path !== path) return;
                } else {
                    return;
                }

                this._phHashRestored = true;

                const vizParams = {};
                if (params.get('preset')) vizParams.preset = params.get('preset');
                if (params.get('formula')) vizParams.formula = params.get('formula');
                if (params.get('bands')) vizParams.bands = params.get('bands');
                if (params.get('colormap')) vizParams.colormap = params.get('colormap');
                if (params.get('rescale')) vizParams.rescale = params.get('rescale');
                if (params.get('stretch')) vizParams.stretch = params.get('stretch');

                if (Object.keys(vizParams).length > 0) {
                    this.plantHealthInitialParams = vizParams;
                    this.currentVizParams = vizParams;
                }

                this.openPlantHealth(path);
            } catch (e) {
                console.error('Failed to restore plant health from URL hash:', e);
            }
        },

        /**
         * Get the file path from a raster tile layer.
         * Override in consuming component if layer structure differs.
         */
        _getLayerPath(layer) {
            if (layer.file && layer.file.entry) return layer.file.entry.path;
            if (layer.entryPath) return layer.entryPath;
            return null;
        },

        /**
         * Get the DDB URI or file URL from a raster tile layer.
         * Override in consuming component if layer structure differs.
         */
        _getLayerUrl(layer) {
            if (layer.file && layer.file.path) return layer.file.path;
            if (layer.ddbUrl) return layer.ddbUrl;
            return null;
        }
    }
};

/**
 * Feature scope for Plant Health (multispectral visualization) functionality.
 * Shared by the dataset map and the single-file map (MapCore).
 *
 * Requirements:
 * - Component must have `this.dataset` (Dataset instance)
 * - Component must have a rasterLayer (LayerGroup) with tile layers
 * - Component must import and register PlantHealthPanel component
 * - Component must call `this.refreshRasterLayers()` when vizParams change
 */
import { createRasterSource, sameVizParams, rasterLayerPath } from '@/libs/map/rasterLayers';
import { FALLBACK_NATIVE_ZOOM } from '@/libs/map/rasterZoom';
import { createFeatureScope } from '@/composables/featureScope';

const definition = {
    data() {
        return {
            plantHealthVisible: false,
            plantHealthFilePath: null,
            plantHealthInitialParams: null,
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
        },

        closePlantHealth() {
            this.plantHealthVisible = false;
            this.plantHealthFilePath = null;
            this.plantHealthInitialParams = null;
            // Note: `vizParamsByPath` is intentionally preserved so the next
            // panel that opens (or the next refreshRasterLayers tick) can
            // restore the styling.
            this.refreshRasterLayers();
        },

        handleVizParamsChanged(params) {
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

        /**
         * Gives each raster layer the tiles of its remembered viz params (the per-file cache).
         * Only a layer whose params changed gets a new source: the others keep their loaded
         * tiles (another layer's plant health, a closed panel, a rebuilt file list).
         */
        refreshRasterLayers() {
            if (!this.rasterLayer) return;

            this.rasterLayer.getLayers().forEach(layer => {
                const layerPath = this._getLayerPath(layer);
                const source = layer.getSource();
                const url = this._getLayerUrl(layer);
                if (!layerPath || !source || !url) return;

                const vizParams = this.vizParamsByPath && this.vizParamsByPath[layerPath];
                if (sameVizParams(source.vizParams, vizParams)) return;

                // The new source keeps the retina flag of the one it replaces and the native GSD
                // zoom stamped on the layer ('rasterNativeZoom'): OL's XYZ source never exposes
                // its maxZoom, so it cannot be read back
                const native = layer.get('rasterNativeZoom');
                layer.setSource(createRasterSource({
                    url,
                    hash: layer.file && layer.file.entry ? layer.file.entry.hash : undefined,
                    native: typeof native === 'number' && isFinite(native) ? native : FALLBACK_NATIVE_ZOOM,
                    retina: typeof source.getTilePixelRatio === 'function' && source.getTilePixelRatio(0) > 1,
                    vizParams
                }));
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

                // Check if file exists in list (dataset map) or matches entry (single-file map)
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
                }

                this.openPlantHealth(path);
            } catch (e) {
                console.error('Failed to restore plant health from URL hash:', e);
            }
        },

        _getLayerPath(layer) {
            return rasterLayerPath(layer);
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

/**
 * The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function usePlantHealth(externals) {
    return createFeatureScope({ ...definition, externals });
}

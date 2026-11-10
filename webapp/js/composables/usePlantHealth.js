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
import { isRasterAnalysisCapable } from '@/libs/entryTypes';
import { defaultVizParams, hasDefaultRamp, layerStyleOf } from '@/libs/map/defaultVizParams';
import { decodeVizParamsHash } from '@/libs/map/vizParamsHash';

/** The value infos the map reads at once to seed the default styles (FR-RAS-01) */
export const SEED_CONCURRENCY = 3;

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
            vizParamsByPath: {},
            // The layers that were offered their default style (FR-RAS-01): once each, so that a Reset, the Original
            // view or a style a user removed is not undone by the next load
            _seededPaths: new Set()
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
         * Only a layer whose params changed is restyled: the others keep their loaded
         * tiles (another layer's plant health, a closed panel, a rebuilt file list). The source is
         * restyled in place, so the layer keeps drawing its tiles until those of the new style have
         * loaded (FR-RAS-17): a new source would blank it meanwhile.
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

                if (typeof source.setVizParams === 'function') {
                    source.setVizParams(vizParams || null);
                    return;
                }
                // Another source: the new one keeps the retina flag of the one it replaces and the native GSD
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
         * Gives each single-band non-Byte georaster that has no style the default of its value info (FR-RAS-01, D-041):
         * a colour ramp stretched to the range of its values, as Raster Analysis draws it. Once per layer; a layer that
         * has a style (a view's, a link's, a user's) is left as it is, and so is one whose value info cannot be read.
         * A layer of the saved view the map shows keeps the style the view records, none included: that is the
         * user's (`savedLayers`). Opening or closing a panel never changes a style: only a user edit and Reset do.
         * At most SEED_CONCURRENCY value infos are read at once; each layer is restyled as its answer comes.
         */
        async seedRasterDefaults() {
            const dataset = this.dataset;
            if (!dataset || !this.rasterLayer) return;
            const kept = path => (this.savedLayers || []).includes(path);
            const styled = path => !!(this.vizParamsByPath && this.vizParamsByPath[path]);
            const queue = [];
            this.rasterLayer.getLayers().forEach(layer => {
                const path = this._getLayerPath(layer);
                const entry = layer.file && layer.file.entry;
                if (!path || !entry || !isRasterAnalysisCapable(entry)) return;
                if (this._seededPaths.has(path) || styled(path) || kept(path)) return;
                queue.push(path);
            });
            if (!queue.length) return;
            queue.forEach(path => this._seededPaths.add(path));
            const seedOne = async path => {
                try {
                    const info = await dataset.getRasterValueInfo(path);
                    // Styled by the user, or shown with the style of a saved view, while the info was read
                    if (styled(path) || kept(path)) return;
                    if (!hasDefaultRamp(info)) return;
                    this.vizParamsByPath = { ...this.vizParamsByPath, [path]: layerStyleOf(defaultVizParams(info)) };
                    this.refreshRasterLayers();
                } catch (e) {
                    console.warn(`Failed to read the default style of ${path}:`, e);
                }
            };
            const worker = async () => {
                while (queue.length) await seedOne(/** @type {string} */ (queue.shift()));
            };
            await Promise.all(Array.from({ length: Math.min(SEED_CONCURRENCY, queue.length) }, worker));
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
                const decoded = decodeVizParamsHash(hash);
                if (!decoded) return;
                const { path, vizParams } = decoded;

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

                // The layer is styled at once, and the panel opens with the same parameters (the style of the link wins over
                // the default of the map)
                const styled = Object.keys(vizParams).length > 0;
                if (styled) {
                    this._seededPaths.add(path);
                    this.vizParamsByPath = { ...this.vizParamsByPath, [path]: { ...vizParams } };
                }
                this.openPlantHealth(path, styled ? vizParams : undefined);
                if (styled) this.refreshRasterLayers();
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

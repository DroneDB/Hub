/**
 * Feature scope for the tooltip overlay on vector features.
 * Shared by the dataset map and the single-file map (MapCore).
 *
 * The consuming component should define a method `getLayerDisplayName(layer)`
 * that returns the fallback label for a layer (e.g. layer.file.name or layer.entry.name).
 */
import Overlay from 'ol/Overlay';
import ddb from 'ddb';
import { extractFeatureDisplayName, unnamedFeatureLabel } from '@/libs/propertiesUtils';
import { findVectorLayerForFeature, tooltipCssText } from '@/libs/map/mapUtils';
import FeatureInfoDialog from '@/features/viewers/map/FeatureInfoDialog.vue';
import { createFeatureScope } from '@/composables/featureScope';
import { keepOverlayInView } from '@/libs/map/overlayPlacement';

// The label goes on the right of the pointer; keepOverlayInView moves it to the left (or along the edge) where the map ends
const TOOLTIP_PLACEMENT = Object.freeze({ positioning: 'center-left', offset: [12, 0] });

const definition = {
    data() {
        return {
            tooltipElement: null,
            tooltipOverlay: null
        };
    },
    methods: {
        /**
         * Create the tooltip DOM element and Overlay (call once after map creation).
         */
        setupTooltipOverlay() {
            this.tooltipElement = document.createElement('div');
            this.tooltipElement.className = 'vector-tooltip';
            this.tooltipElement.style.cssText = tooltipCssText;

            this.tooltipOverlay = new Overlay({
                element: this.tooltipElement,
                offset: [...TOOLTIP_PLACEMENT.offset],
                positioning: TOOLTIP_PLACEMENT.positioning
            });
        },

        /**
         * Display tooltip with feature info at the given pixel.
         * @param {import('ol/Feature').default|import('ol/render/Feature').default} feature
         * @param {number[]} pixel
         * @param {import('ol/layer/BaseVector').default|null} [layer=null] - Layer hint from
         *   forEachFeatureAtPixel. When provided it is used directly so that
         *   findVectorLayerForFeature (which is incompatible with VectorTile sources) is skipped.
         */
        showFeatureTooltip(feature, pixel, layer = null) {
            if (!this.tooltipElement || !this.tooltipOverlay) return;

            const properties = feature.getProperties();
            let content = extractFeatureDisplayName(properties);

            if (content === 'Unknown feature') {
                const resolvedLayer = layer || findVectorLayerForFeature(feature, this.vectorLayers);
                if (resolvedLayer || properties.Layer) content = unnamedFeatureLabel(properties, resolvedLayer ? this.getLayerDisplayName(resolvedLayer) : '');
            }

            this.tooltipElement.textContent = content;
            this.tooltipElement.style.display = 'block';
            this.tooltipOverlay.setPosition(this.map.getCoordinateFromPixel(pixel));
            // The label has its content and its place: it stays out of the toolbar rail and inside the map
            keepOverlayInView(this.map, this.tooltipOverlay, this.tooltipElement, TOOLTIP_PLACEMENT);
        },

        /**
         * Hide the tooltip.
         */
        hideFeatureTooltip() {
            if (this.tooltipElement) {
                this.tooltipElement.style.display = 'none';
            }
        },

        /**
         * Convenience wrapper around findVectorLayerForFeature using this.vectorLayers.
         */
        findVectorLayerForFeature(feature) {
            return findVectorLayerForFeature(feature, this.vectorLayers);
        },

        /**
         * Open a dialog showing all properties of a feature.
         * @param {import('ol/Feature').default|import('ol/render/Feature').default} feature
         * @param {import('ol/layer/BaseVector').default|null} [layer=null] - Layer hint from
         *   forEachFeatureAtPixel. When provided it is used directly, avoiding the
         *   getFeatures() call that crashes on VectorTile sources.
         */
        showFeaturePropertiesDialog(feature, layer = null) {
            const properties = { ...(feature.getProperties() || {}) };
            delete properties.geometry;

            let title = 'Feature Properties';
            const resolvedLayer = layer || findVectorLayerForFeature(feature, this.vectorLayers);

            if (resolvedLayer) {
                const fileName = this.getLayerDisplayName(resolvedLayer) || '';
                if (fileName) {
                    title = `${fileName} - Feature Properties`;
                }
                if (properties.name) {
                    title = `${fileName} - ${properties.name}`;
                }
            }

            this.dialogs.open(FeatureInfoDialog, { title, properties });
        },

        /**
         * Default implementation - override in component if needed.
         * @param {Object} layer - The OL vector layer
         * @returns {string}
         */
        getLayerDisplayName(layer) {
            // An entry as the server lists it has a path and no name: the name is the last part of the path
            const nameOf = item => (item ? item.name || item.label || (item.path ? ddb.pathutils.basename(item.path) : '') : '');
            if (layer.entry) return nameOf(layer.entry);
            if (layer.file) return nameOf(layer.file) || nameOf(layer.file.entry);
            return '';
        }
    }
};

/**
 * The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function useMapTooltip(externals) {
    return createFeatureScope({ ...definition, externals });
}

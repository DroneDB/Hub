/**
 * Mixin for tooltip overlay on vector features.
 * Shared between Map.vue and SingleMap.vue.
 *
 * The consuming component should define a method `getLayerDisplayName(layer)`
 * that returns the fallback label for a layer (e.g. layer.file.name or layer.entry.name).
 */
import Overlay from 'ol/Overlay';
import { extractFeatureDisplayName } from '@/libs/propertiesUtils';
import { findVectorLayerForFeature, tooltipCssText } from '@/libs/map/mapUtils';
import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Lara from '@primevue/themes/lara';
import FeatureInfoDialog from '@/features/viewers/map/FeatureInfoDialog.vue';

export default {
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
                offset: [12, 0],
                positioning: 'center-left'
            });
        },

        /**
         * Display tooltip with feature info at the given pixel.
         */
        showFeatureTooltip(feature, pixel) {
            if (!this.tooltipElement || !this.tooltipOverlay) return;

            const properties = feature.getProperties();
            let content = extractFeatureDisplayName(properties);

            if (content === 'Unknown feature') {
                const layer = findVectorLayerForFeature(feature, this.vectorLayers);
                if (layer) {
                    content = this.getLayerDisplayName(layer) || 'Unknown layer';
                }
            }

            this.tooltipElement.innerHTML = content;
            this.tooltipElement.style.display = 'block';
            this.tooltipOverlay.setPosition(this.map.getCoordinateFromPixel(pixel));
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
         */
        showFeaturePropertiesDialog(feature) {
            const properties = { ...(feature.getProperties() || {}) };
            delete properties.geometry;

            let title = 'Feature Properties';
            const layer = findVectorLayerForFeature(feature, this.vectorLayers);

            if (layer) {
                const fileName = this.getLayerDisplayName(layer) || '';
                if (fileName) {
                    title = `${fileName} - Feature Properties`;
                }
                if (properties.name) {
                    title = `${fileName} - ${properties.name}`;
                }
            }

            const container = document.createElement('div');
            document.body.appendChild(container);

            const cleanup = () => {
                try {
                    dialogApp.unmount();
                } catch (_) { /* already unmounted */ }
                if (container.parentNode) {
                    document.body.removeChild(container);
                }
            };

            const dialogApp = createApp(FeatureInfoDialog, {
                title,
                properties,
                onOnClose: cleanup
            });
            dialogApp.config.errorHandler = (err) => {
                console.error('FeatureInfoDialog error:', err);
                cleanup();
            };
            dialogApp.use(PrimeVue, { theme: { preset: Lara } });
            dialogApp.mount(container);
        },

        /**
         * Default implementation - override in component if needed.
         * @param {Object} layer - The OL vector layer
         * @returns {string}
         */
        getLayerDisplayName(layer) {
            if (layer.entry) return layer.entry.name || '';
            if (layer.file) return layer.file.name || (layer.file.entry && layer.file.entry.name) || '';
            return '';
        }
    }
};

/**
 * Mixin for Thermal visualization functionality.
 * Shared between Map.vue and SingleMap.vue.
 *
 * Requirements:
 * - Component must have `this.dataset` (Dataset instance)
 * - Component must have a rasterLayer (LayerGroup) with tile layers
 * - Component must import and register ThermalControls component
 * - Component must call `this.refreshRasterLayers()` when vizParams change
 */
import HybridXYZ from '@/libs/map/olHybridXYZ';

export default {
    data() {
        return {
            thermalVisible: false,
            thermalFilePath: null,
            thermalInitialParams: null,
            thermalSpotInfo: null,
            thermalAreaStats: null
        };
    },
    methods: {
        openThermal(file, options) {
            const path = typeof file === 'string' ? file : (file && file.entry ? file.entry.path : null);
            if (!path) return;
            this.thermalFilePath = path;
            this.thermalVisible = true;
            if (options) {
                this.thermalInitialParams = options;
            }
        },

        closeThermal() {
            this.thermalVisible = false;
            this.thermalFilePath = null;
            this.thermalInitialParams = null;
            this.thermalSpotInfo = null;
            this.thermalAreaStats = null;
            // Reset vizParams only for thermal layers
            this.refreshRasterLayers();
        },

        handleThermalVizParamsChanged(params) {
            this.currentVizParams = params;
            this.refreshRasterLayers();
        },

        async queryThermalPoint(x, y) {
            if (!this.thermalFilePath || !this.dataset) return;
            try {
                this.thermalSpotInfo = await this.dataset.getThermalPoint(this.thermalFilePath, x, y);
            } catch (e) {
                console.error('Failed to query thermal point:', e);
            }
        },

        async queryThermalArea(x0, y0, x1, y1) {
            if (!this.thermalFilePath || !this.dataset) return;
            try {
                this.thermalAreaStats = await this.dataset.getThermalAreaStats(this.thermalFilePath, x0, y0, x1, y1);
            } catch (e) {
                console.error('Failed to query thermal area:', e);
            }
        }
    }
};

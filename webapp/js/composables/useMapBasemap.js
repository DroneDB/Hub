/**
 * Mixin for basemap layer management.
 * Shared between Map.vue and SingleMap.vue.
 */
import { Tile as TileLayer } from 'ol/layer';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import TileGrid from 'ol/tilegrid/TileGrid';
import { get as getProjection } from 'ol/proj';
import { getWidth } from 'ol/extent';
import { Basemaps, getCustomBasemapConfig } from '@/libs/map/basemaps';

export default {
    data() {
        return {
            selectedBasemap: localStorage.getItem('selectedBasemap') || 'satellite',
            basemaps: Basemaps,
            customBasemapConfig: getCustomBasemapConfig()
        };
    },
    methods: {
        /**
         * Create a TileLayer for the current basemap selection
         */
        createBasemapLayer() {
            if (this.selectedBasemap === 'custom') {
                const config = this.customBasemapConfig;
                if (config && config.url) {
                    const attributions = config.attribution ? [config.attribution] : [];
                    if (config.sourceType === 'wms') {
                        const wmsParams = { LAYERS: config.layerName, TILED: true, STYLES: '' };
                        if (config.defaultTime) wmsParams.TIME = config.defaultTime;
                        const tileSize = config.tileSize || 256;
                        const sourceOpts = {
                            url: config.url,
                            params: wmsParams,
                            attributions: attributions
                        };
                        if (tileSize !== 256) {
                            const projection = getProjection('EPSG:3857');
                            const projExtent = projection.getExtent();
                            const size = getWidth(projExtent) / tileSize;
                            const resolutions = [];
                            for (let z = 0; z < 21; z++) resolutions.push(size / Math.pow(2, z));
                            sourceOpts.tileGrid = new TileGrid({
                                extent: projExtent,
                                resolutions: resolutions,
                                tileSize: [tileSize, tileSize]
                            });
                        }
                        return new TileLayer({
                            source: new TileWMS(sourceOpts)
                        });
                    } else {
                        return new TileLayer({
                            source: new XYZ({
                                url: config.url,
                                attributions: attributions
                            })
                        });
                    }
                }
            }
            const basemap = this.basemaps[this.selectedBasemap] || this.basemaps['satellite'];
            return new TileLayer({
                source: new XYZ({
                    url: basemap.url,
                    attributions: basemap.attributions
                })
            });
        },

        /**
         * Replace the basemap layer at position 0 in the map.
         * Override in component if you need to persist to localStorage.
         */
        updateBasemap() {
            const newLayer = this.createBasemapLayer();
            const layers = this.map.getLayers();
            layers.removeAt(0);
            layers.insertAt(0, newLayer);
            this.basemapLayer = newLayer;
        }
    }
};

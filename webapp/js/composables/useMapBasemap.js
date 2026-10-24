// @ts-check
/**
 * Basemap of the map viewer (HQ-07: a composable; was a mixin with overrides in Map.vue).
 * Owns the selection, the custom WMS/XYZ configuration and their persistence.
 *
 *   const basemap = useMapBasemap(map);    // map: ShallowRef<ol/Map|null>
 *   new Map({ layers: [basemap.createBasemapLayer(), ...] })
 */
import { ref } from 'vue';
import { Tile as TileLayer } from 'ol/layer';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import TileGrid from 'ol/tilegrid/TileGrid';
import { get as getProjection } from 'ol/proj';
import { getWidth } from 'ol/extent';
import { Basemaps, getCustomBasemapConfig, saveCustomBasemapConfig } from '@/libs/map/basemaps';
import { EPSG } from '@/libs/constants';
import { getPref, setPref, PREF } from '@/libs/preferences';

/** Tile layer of a custom WMS/XYZ configuration. @param {any} config */
function customLayer(config) {
    const attributions = config.attribution ? [config.attribution] : [];
    if (config.sourceType !== 'wms') {
        return new TileLayer({ source: new XYZ({ url: config.url, attributions }) });
    }
    const params = { LAYERS: config.layerName, TILED: true, STYLES: '' };
    if (config.defaultTime) params.TIME = config.defaultTime;
    const options = { url: config.url, params, attributions };
    const tileSize = config.tileSize || 256;
    if (tileSize !== 256) {
        const extent = getProjection(EPSG.WEB_MERCATOR).getExtent();
        const size = getWidth(extent) / tileSize;
        options.tileGrid = new TileGrid({
            extent,
            resolutions: Array.from({ length: 21 }, (_, z) => size / Math.pow(2, z)),
            tileSize: [tileSize, tileSize]
        });
    }
    return new TileLayer({ source: new TileWMS(options) });
}

/** @param {import('vue').ShallowRef<any>} map */
export function useMapBasemap(map) {
    const selectedBasemap = ref(getPref(PREF.BASEMAP, 'satellite'));
    const customBasemapConfig = ref(getCustomBasemapConfig());

    /** Tile layer of the current selection. */
    function createBasemapLayer() {
        const config = customBasemapConfig.value;
        if (selectedBasemap.value === 'custom' && config && config.url) return customLayer(config);
        const basemap = Basemaps[selectedBasemap.value] || Basemaps.satellite;
        return new TileLayer({
            source: new XYZ({
                url: basemap.url,
                attributions: basemap.attributions,
                ...(basemap.maxZoom != null ? { maxZoom: basemap.maxZoom } : {})
            })
        });
    }

    /** Replaces the basemap (layer 0) with the current selection. */
    function updateBasemap() {
        if (!map.value) return;
        const layers = map.value.getLayers();
        layers.removeAt(0);
        layers.insertAt(0, createBasemapLayer());
    }

    /** Settings dialog: another basemap. @param {string} name */
    function handleBasemapChanged(name) {
        selectedBasemap.value = name;
        setPref(PREF.BASEMAP, name);
        updateBasemap();
    }

    /** Settings dialog: a new custom configuration. @param {any} config */
    function handleCustomBasemapConfigChanged(config) {
        saveCustomBasemapConfig(config);
        customBasemapConfig.value = config;
        if (selectedBasemap.value === 'custom') updateBasemap();
    }

    return { selectedBasemap, basemaps: Basemaps, customBasemapConfig, createBasemapLayer, updateBasemap, handleBasemapChanged, handleCustomBasemapConfigChanged };
}

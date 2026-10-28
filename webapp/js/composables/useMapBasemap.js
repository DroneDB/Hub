// @ts-check
/**
 * Basemap of the map viewer.
 * Owns the selection, the custom WMS/XYZ configuration and their persistence.
 *
 *   const basemap = useMapBasemap(map);    // map: ShallowRef<ol/Map|null>
 *   new Map({ layers: [basemap.createBasemapLayer(), ...] })
 */
import { onScopeDispose, ref, watch } from 'vue';
import { Tile as TileLayer } from 'ol/layer';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import TileGrid from 'ol/tilegrid/TileGrid';
import { get as getProjection } from 'ol/proj';
import { getWidth } from 'ol/extent';
import { Basemaps, getCustomBasemapConfig, saveCustomBasemapConfig } from '@/libs/map/basemaps';
import { EPSG } from '@/libs/constants';
import { getPref, onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { usePreference } from '@/composables/usePreference';

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

/**
 * @param {import('vue').ShallowRef<any>} map
 * @param {{ persist?: boolean }} [options]  persist: false keeps a change of basemap to this map (a
 *        comparison carries its own basemap and must not change the user's preference)
 */
export function useMapBasemap(map, { persist = true } = {}) {
    const selectedBasemap = persist
        ? usePreference(PREF.BASEMAP, PREF_DEFAULTS[PREF.BASEMAP])
        : ref(getPref(PREF.BASEMAP, PREF_DEFAULTS[PREF.BASEMAP]));
    const customBasemapConfig = ref(getCustomBasemapConfig());

    /** Tile layer of the current selection. */
    function createBasemapLayer() {
        const config = customBasemapConfig.value;
        if (selectedBasemap.value === 'custom' && config) return customLayer(config);
        // A custom selection without a usable configuration (cleared, or invalid) or an unknown name: the default
        const chosen = Basemaps[selectedBasemap.value];
        const basemap = chosen?.url ? chosen : Basemaps[PREF_DEFAULTS[PREF.BASEMAP]];
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
    }

    // Applies the selection however it changed: the dialog, the Preferences page, another tab, the account
    watch(selectedBasemap, updateBasemap, { flush: 'sync' });
    onScopeDispose(onPrefChange(key => {
        if (key !== PREF.CUSTOM_BASEMAP) return;
        customBasemapConfig.value = getCustomBasemapConfig();
        if (selectedBasemap.value === 'custom') updateBasemap();
    }));

    /** Settings dialog: a new custom configuration. @param {any} config */
    function handleCustomBasemapConfigChanged(config) {
        // The preference listener above takes the stored configuration and applies it
        saveCustomBasemapConfig(config);
    }

    return { selectedBasemap, basemaps: Basemaps, customBasemapConfig, createBasemapLayer, updateBasemap, handleBasemapChanged, handleCustomBasemapConfigChanged };
}

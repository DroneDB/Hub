// @ts-check
/**
 * Basemap of the map viewer.
 * Owns the selection and draws it; the custom WMS/XYZ source is saved by CustomBasemapEditor and
 * followed here through its preference.
 *
 * The selection is what the map draws; the user's preference is where it starts from and where a
 * basemap the user picks is saved. A basemap a saved view carries is drawn with `applyBasemap`
 * and leaves the preference alone; while it is drawn, a change of the preference from elsewhere
 * does not replace it (the view would change without anything done on this map).
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
import { Basemaps, getCustomBasemapConfig } from '@/libs/map/basemaps';
import { EPSG } from '@/libs/constants';
import { onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';
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

/** @param {import('vue').ShallowRef<any>} map */
export function useMapBasemap(map) {
    const preferredBasemap = usePreference(PREF.BASEMAP, PREF_DEFAULTS[PREF.BASEMAP]);
    const selectedBasemap = ref(preferredBasemap.value);
    // The map draws a basemap of its own (applyBasemap with a name), not the preference
    let ownBasemap = false;
    // A change of the preference from elsewhere (the Preferences page, another tab, the account)
    // shows too, unless the map draws a basemap of its own
    watch(preferredBasemap, name => { if (!ownBasemap) selectedBasemap.value = name; }, { flush: 'sync' });
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

    /** Settings dialog: the user picks another basemap, which becomes their preference. @param {string} name */
    function handleBasemapChanged(name) {
        ownBasemap = false;
        preferredBasemap.value = name;
        selectedBasemap.value = name;
    }

    /**
     * Draws a basemap without saving it as the preference (the one a saved view carries), and
     * keeps it when the preference changes elsewhere; none draws, and follows, the preference.
     * @param {string|null|undefined} name
     */
    function applyBasemap(name) {
        ownBasemap = !!name;
        selectedBasemap.value = name || preferredBasemap.value;
    }

    // Applies the selection however it changed: the dialog, the Preferences page, another tab, the account
    watch(selectedBasemap, updateBasemap, { flush: 'sync' });
    onScopeDispose(onPrefChange(key => {
        if (key !== PREF.CUSTOM_BASEMAP) return;
        customBasemapConfig.value = getCustomBasemapConfig();
        if (selectedBasemap.value === 'custom') updateBasemap();
    }));

    return { selectedBasemap, basemaps: Basemaps, createBasemapLayer, updateBasemap, handleBasemapChanged, applyBasemap };
}

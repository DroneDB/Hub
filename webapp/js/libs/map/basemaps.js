import { getPref, setPref, PREF } from '@/libs/preferences';

const Basemaps = {
    'satellite': {
        label: "Satellite",
        url: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"],
        maxZoom: 21
    },
    'hybrid': {
        label: "Hybrid",
        url: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"],
        maxZoom: 21
    },
    'osm': {
        label: "OpenStreetMap",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attributions: ["&copy; OpenStreetMap"],
        maxZoom: 19
    },
    'custom': {
        label: "Custom",
        url: null,
        attributions: [],
        isCustom: true
    }
};

/**
 * Custom basemap configuration, or null when none (or an incomplete one) is stored.
 * @returns {{ sourceType: 'wms'|'xyz', url: string, layerName: string, attribution: string }|null}
 */
function getCustomBasemapConfig() {
    const config = getPref(PREF.CUSTOM_BASEMAP, null);
    return config && config.url && config.sourceType ? config : null;
}

/**
 * @param {{ sourceType: 'wms'|'xyz', url: string, layerName: string, attribution: string }} config
 */
function saveCustomBasemapConfig(config) {
    setPref(PREF.CUSTOM_BASEMAP, config);
}

export { Basemaps, getCustomBasemapConfig, saveCustomBasemapConfig };
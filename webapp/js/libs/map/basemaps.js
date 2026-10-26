import { getPref, setPref, PREF, PREF_DEFAULTS } from '@/libs/preferences';

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
 * The attribution text of a tile server: its host name. The map renders attributions as HTML,
 * so it is derived from the URL and never taken from a stored or synced text.
 * @param {string} url
 * @returns {string} '' when the URL cannot be parsed
 */
function getAttributionFromUrl(url) {
    try {
        return '&copy; ' + new URL(url).hostname;
    } catch {
        return '';
    }
}

/**
 * Whether a custom basemap URL is one the map draws: an absolute http or https URL. The settings
 * dialog validates with it, so a URL it saves is never one the map then drops. Tile placeholders
 * ({z}, {x}, {y}, {s}, {a-c}) in host, path or query parse, as do the query strings of WMS URLs.
 * @param {unknown} url
 * @returns {boolean}
 */
function isAbsoluteHttpUrl(url) {
    try {
        return ['http:', 'https:'].includes(new URL(String(url)).protocol);
    } catch {
        return false;
    }
}

/** The custom sources the map can draw, and the tile sizes of a WMS source (the first is the default). */
const CUSTOM_SOURCE_TYPES = ['xyz', 'wms'];
const CUSTOM_TILE_SIZES = [256, 512];

/**
 * Custom basemap configuration, or null when none is stored, it is incomplete, its source type is
 * not one the map draws, or its URL is not an absolute http(s) URL (the value may come from the
 * account). The attribution is recomputed and the optional fields of another type are reset.
 * @returns {{ sourceType: 'wms'|'xyz', url: string, layerName: string, tileSize: number, defaultTime: string, wmsLayers: any[], attribution: string }|null}
 */
function getCustomBasemapConfig() {
    const config = getPref(PREF.CUSTOM_BASEMAP, PREF_DEFAULTS[PREF.CUSTOM_BASEMAP]);
    if (!config || typeof config !== 'object' || !CUSTOM_SOURCE_TYPES.includes(config.sourceType)
        || typeof config.url !== 'string' || !isAbsoluteHttpUrl(config.url)) return null;
    const layerName = typeof config.layerName === 'string' ? config.layerName : '';
    // A WMS source draws nothing without a layer
    if (config.sourceType === 'wms' && !layerName) return null;
    return {
        ...config,
        layerName,
        tileSize: CUSTOM_TILE_SIZES.includes(config.tileSize) ? config.tileSize : CUSTOM_TILE_SIZES[0],
        defaultTime: typeof config.defaultTime === 'string' ? config.defaultTime : '',
        wmsLayers: Array.isArray(config.wmsLayers) ? config.wmsLayers.filter(l => typeof l?.name === 'string') : [],
        attribution: getAttributionFromUrl(config.url)
    };
}

/**
 * @param {{ sourceType: 'wms'|'xyz', url: string, layerName: string, attribution: string }} config
 */
function saveCustomBasemapConfig(config) {
    setPref(PREF.CUSTOM_BASEMAP, config);
}

export { Basemaps, getAttributionFromUrl, isAbsoluteHttpUrl, getCustomBasemapConfig, saveCustomBasemapConfig };
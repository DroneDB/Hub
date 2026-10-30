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

/**
 * The configuration stored for what the editor holds: the URL trimmed, the attribution taken from
 * it, the TIME of the chosen WMS layer, and the WMS fields reset for an XYZ source.
 * @param {{ sourceType: 'wms'|'xyz', url: string, layerName?: string, tileSize?: number, wmsLayers?: any[] }} form
 */
function buildCustomBasemapConfig({ sourceType, url, layerName = '', tileSize, wmsLayers = [] }) {
    const trimmed = url.trim();
    const wms = sourceType === 'wms';
    return {
        sourceType,
        url: trimmed,
        layerName: wms ? layerName : '',
        tileSize: wms && CUSTOM_TILE_SIZES.includes(tileSize) ? tileSize : CUSTOM_TILE_SIZES[0],
        defaultTime: wms ? wmsLayers.find(l => l.name === layerName)?.defaultTime || '' : '',
        attribution: getAttributionFromUrl(trimmed),
        wmsLayers: wms ? wmsLayers : []
    };
}

/**
 * The URL of one tile of a custom source, loaded to check the source before it is saved: the
 * first XYZ tile, or a WMS GetMap of one quarter of the world at the tile size.
 * @param {{ sourceType: 'wms'|'xyz', url: string, layerName: string, tileSize?: number, defaultTime?: string }} config
 */
function customBasemapTestUrl(config) {
    if (config.sourceType !== 'wms') {
        return config.url.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0');
    }
    const separator = config.url.includes('?') ? '&' : '?';
    const size = config.tileSize || CUSTOM_TILE_SIZES[0];
    let url = config.url + separator
        + 'SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1'
        + '&LAYERS=' + encodeURIComponent(config.layerName)
        + '&STYLES='
        + '&SRS=EPSG:3857&BBOX=0,0,20037508,20037508'
        + '&WIDTH=' + size + '&HEIGHT=' + size + '&FORMAT=image/png&TILED=true';
    if (config.defaultTime) url += '&TIME=' + encodeURIComponent(config.defaultTime);
    return url;
}

/**
 * Loads an image; rejects when it fails or takes longer than the timeout.
 * @param {string} url @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
function loadTestTile(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = '';
            reject(new Error('Connection timed out'));
        }, timeoutMs);
        img.onload = () => {
            clearTimeout(timeout);
            resolve();
        };
        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load tile'));
        };
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
}

export {
    Basemaps, CUSTOM_TILE_SIZES, getAttributionFromUrl, isAbsoluteHttpUrl, getCustomBasemapConfig, saveCustomBasemapConfig,
    buildCustomBasemapConfig, customBasemapTestUrl, loadTestTile
};
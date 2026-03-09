const CUSTOM_BASEMAP_KEY = 'customBasemap';

const Basemaps = {
    'satellite': {
        label: "Satellite",
        url: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"]
    },
    'hybrid': {
        label: "Hybrid",
        url: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"]
    },
    'osm': {
        label: "OpenStreetMap",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attributions: ["&copy; OpenStreetMap"]
    },
    'custom': {
        label: "Custom",
        url: null,
        attributions: [],
        isCustom: true
    }
};

/**
 * Get custom basemap configuration from localStorage
 * @returns {{ sourceType: 'wms'|'xyz', url: string, layerName: string, attribution: string }|null}
 */
function getCustomBasemapConfig() {
    try {
        const raw = localStorage.getItem(CUSTOM_BASEMAP_KEY);
        if (raw) {
            const config = JSON.parse(raw);
            if (config && config.url && config.sourceType) {
                return config;
            }
        }
    } catch (e) {
        console.error('Error reading custom basemap config from localStorage:', e);
    }
    return null;
}

/**
 * Save custom basemap configuration to localStorage
 * @param {{ sourceType: 'wms'|'xyz', url: string, layerName: string, attribution: string }} config
 */
function saveCustomBasemapConfig(config) {
    try {
        localStorage.setItem(CUSTOM_BASEMAP_KEY, JSON.stringify(config));
    } catch (e) {
        console.error('Error saving custom basemap config to localStorage:', e);
    }
}

export { Basemaps, getCustomBasemapConfig, saveCustomBasemapConfig };
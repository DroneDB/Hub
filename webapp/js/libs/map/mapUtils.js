/**
 * Shared utility functions of the maps of the Hub (the map viewer, the dataset Map tab, the measurement tools)
 */
import { PRIMARY, ANALYSIS_YELLOW } from '@/libs/palette';

/**
 * How a map fits its view to an extent (View.fit options): room around it, a short animation, and
 * no closer than half a metre per pixel.
 */
export const FIT_OPTIONS = Object.freeze({ padding: [40, 40, 40, 40], duration: 500, minResolution: 0.5, maxZoom: 22 });

/** The share of the map size an overview map leaves free around the pins it fits (FR-ORG-09) */
export const OVERVIEW_FIT_MARGIN = 0.1;

/**
 * The padding ([top, right, bottom, left], px) of an overview map that fits its pins: 10% of the map size on
 * every side, plus what the toolbar rail takes on the right and what the bottom controls take at the bottom (the
 * `--map-rail-reserve` and `--map-bottom-reserve` tokens of the map, FR-XC-20), so no pin lands at the edge or
 * under a control.
 * @param {number[]} mapSize  width and height of the map in px
 * @param {{ rail: number, bottom: number }} reserves  in px
 * @returns {number[]}
 */
export function overviewFitPadding([width, height], { rail, bottom }) {
    const x = Math.round(width * OVERVIEW_FIT_MARGIN);
    const y = Math.round(height * OVERVIEW_FIT_MARGIN);
    return [y, x + rail, y + bottom, x];
}

/**
 * How a map fits its view to the extent of its files (FR-MAP-28): the same room and animation, and no limit
 * but the zoom range. A drone survey is a few hundred metres wide and has to fill the map; FIT_OPTIONS stops
 * at 0.5 m per pixel, which is right for a cluster of pins and shows a survey as a postage stamp. The
 * view never zooms past the native zoom of the rasters (ViewZoomCap).
 */
export const FILE_FIT_OPTIONS = Object.freeze({ padding: FIT_OPTIONS.padding, duration: FIT_OPTIONS.duration, maxZoom: FIT_OPTIONS.maxZoom });

/** The closest a fit goes to an extent with no size (one point): the resolution of FIT_OPTIONS, metres per pixel. */
export const POINT_FIT_MIN_RESOLUTION = FIT_OPTIONS.minResolution;

/** Default colour of measurements and point annotations (map and point cloud). */
export const MEASURE_COLOR = '#ffcc33';

/** Colour of analysis overlays (raster analysis, stockpiles, profile lines): the Hub's yellow. */
export const ANALYSIS_COLOR = ANALYSIS_YELLOW;

/** Default colour of a new measurement group. */
export const GROUP_COLOR = PRIMARY[500];

/** Swatches offered by the measurement, annotation and group dialogs. */
export const MEASUREMENT_SWATCHES = Object.freeze([
    MEASURE_COLOR, // Yellow
    GROUP_COLOR,   // Blue
    '#ff0000',     // Red
    '#00cc66',     // Green
    '#ff6600',     // Orange
    '#9900ff',     // Purple
    '#00cccc',     // Cyan
    '#333333'      // Dark gray
]);

/**
 * Color palette for vector layers - bright, distinct colors with good contrast
 */
const colorPalette = [
    'rgba(66, 133, 244, 0.8)',    // Blue
    'rgba(219, 68, 55, 0.8)',     // Red
    'rgba(15, 157, 88, 0.8)',     // Green
    'rgba(244, 160, 0, 0.8)',     // Yellow
    'rgba(171, 71, 188, 0.8)',    // Purple
    'rgba(255, 87, 34, 0.8)',     // Deep Orange
    'rgba(3, 169, 244, 0.8)',     // Light Blue
    'rgba(0, 150, 136, 0.8)',     // Teal
    'rgba(124, 77, 255, 0.8)',    // Deep Purple
    'rgba(229, 57, 53, 0.8)',     // Red
    'rgba(0, 200, 83, 0.8)',      // Green
    'rgba(253, 216, 53, 0.8)'     // Yellow
];

/**
 * Generate a numeric hash from a string
 * @param {string} str
 * @returns {number}
 */
function stringToHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Find the vector layer that contains a given feature
 * @param {import('ol/Feature').default} feature
 * @param {Array} vectorLayers
 * @returns {import('ol/layer/Vector').default|null}
 */
export function findVectorLayerForFeature(feature, vectorLayers) {
    for (let i = 0; i < vectorLayers.length; i++) {
        const layer = vectorLayers[i];
        const source = layer.getSource();
        // VectorTileSource (used by MVT layers) does not expose getFeatures().
        // Skip these sources to avoid TypeError; the caller should prefer passing
        // the layer hint directly from forEachFeatureAtPixel when available.
        if (typeof source.getFeatures !== 'function') continue;
        if (source.getFeatures().some(f => f === feature)) {
            return layer;
        }
    }
    return null;
}

/**
 * Generate a unique color based on a path string and index.
 * Uses the colorPalette for small indices, or HSL hash-based color for larger ones.
 * @param {string} path - The path to use as key
 * @param {number} index - The index in the layer list
 * @param {Object} colorCache - Mutable cache object for storing assigned colors
 * @returns {string} CSS color string
 */
export function getVectorColor(path, index, colorCache) {
    if (colorCache[path]) {
        return colorCache[path];
    }

    let color;
    if (index < colorPalette.length) {
        color = colorPalette[index];
    } else {
        const hash = stringToHashCode(path);
        const hue = hash % 360;
        const saturation = 80;
        const lightness = 45;
        color = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
    }

    colorCache[path] = color;
    return color;
}

/**
 * CSS text for the tooltip overlay element
 */
export const tooltipCssText =
    'position: absolute; ' +
    'background-color: rgba(255, 255, 255, 0.9); ' +
    'color: #333; ' +
    'padding: 6px 10px; ' +
    'border-radius: 4px; ' +
    'border: 1px solid rgba(0, 0, 0, 0.2); ' +
    'font-size: 13px; ' +
    'font-weight: bold; ' +
    'box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15); ' +
    'pointer-events: none; ' +
    'z-index: 1000; ' +
    'max-width: 300px; ' +
    'white-space: nowrap; ' +
    'overflow: hidden; ' +
    'text-overflow: ellipsis; ' +
    'display: none;';

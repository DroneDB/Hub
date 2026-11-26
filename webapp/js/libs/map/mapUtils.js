/**
 * Shared utility functions of the maps of the Hub (the map viewer, the dataset Map tab, the measurement tools)
 */
import { transformExtent } from 'ol/proj';
import { PRIMARY, ANALYSIS_YELLOW } from '@/libs/palette';
import { EPSG } from '@/libs/constants';
import { getVectorColor } from '@/libs/map/vectorColours';

export { getVectorColor };

/**
 * How a map fits its view to an extent (View.fit options): room around it, a short animation, and
 * no closer than half a metre per pixel.
 */
export const FIT_OPTIONS = Object.freeze({ padding: [40, 40, 40, 40], duration: 500, minResolution: 0.5, maxZoom: 22 });

/** The latitude (degrees) where Web Mercator ends: its square world is ±85.05° high. */
export const MERCATOR_MAX_LAT = 85.05112878;

/**
 * A WGS84 box in Web Mercator (the map's projection). The poles have no Web Mercator: the
 * latitude is held to the range the projection covers (a layer that reaches a pole, such as the
 * countries of the world down to Antarctica, would else reach hundreds of world heights south and
 * a fit to it would show the Southern Ocean).
 * @param {number[]} bbox  minLon, minLat, maxLon, maxLat
 * @returns {number[]} minX, minY, maxX, maxY
 */
export function bboxExtent(bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    return transformExtent([minLon, Math.max(minLat, -MERCATOR_MAX_LAT), maxLon, Math.min(maxLat, MERCATOR_MAX_LAT)], EPSG.WGS84, EPSG.WEB_MERCATOR);
}

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

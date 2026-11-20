// @ts-check
/**
 * How the map draws its analysis overlays (the raster area, the profile line, the stockpiles):
 * the Hub's yellow with a dark halo under it, so a line reads on bright ground (sand, concrete,
 * snow) as well as on dark ground.
 */
import { Fill, Stroke, Style } from 'ol/style';
import { hexRgba } from '@/libs/palette';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';

/** The fill of an analysis polygon */
export const ANALYSIS_FILL = hexRgba(ANALYSIS_COLOR, 0.2);

/** The halo drawn under an analysis line */
export const ANALYSIS_HALO = 'rgba(0, 0, 0, 0.6)';

/** How much wider than the line its halo is, in pixels */
export const HALO_EXTRA_WIDTH = 2;

/** The measurement types drawn as analysis overlays */
export const ANALYSIS_MEASUREMENT_TYPES = Object.freeze(['stockpile', 'profile']);

/**
 * The colours the analysis overlays were saved with when they were orange, and the colour each
 * one is now: a saved stockpile or profile takes today's colour when it is loaded.
 */
const ORANGE_COLOURS = Object.freeze({
    '#ff9800': ANALYSIS_COLOR,
    'rgba(255, 152, 0, 0.20)': ANALYSIS_FILL
});

/**
 * Today's colour of a colour an analysis overlay was saved with: the orange of the earlier
 * overlays becomes the yellow, any other colour (one the user chose) stays.
 * @param {string|null|undefined} colour
 * @returns {string|null|undefined}
 */
export function currentAnalysisColour(colour) {
    if (typeof colour !== 'string') return colour;
    return ORANGE_COLOURS[colour.trim().toLowerCase()] ?? colour;
}

/**
 * The halo under a line: the same dash, wider, dark. Draw it before the line's own style.
 * @param {number} width  the line's width
 * @param {number[]} [lineDash]
 * @returns {Style}
 */
export function haloStyle(width, lineDash) {
    return new Style({ stroke: new Stroke({ color: ANALYSIS_HALO, width: width + HALO_EXTRA_WIDTH, lineDash }) });
}

/**
 * The styles of an analysis overlay: its halo, then the line in the analysis yellow (with the
 * fill and the vertex image given).
 * @param {{ width?: number, lineDash?: number[], fill?: string|null, image?: import('ol/style/Image').default }} [options]
 * @returns {Style[]}
 */
export function analysisStyles({ width = 2, lineDash, fill, image } = {}) {
    return [
        haloStyle(width, lineDash),
        new Style({
            stroke: new Stroke({ color: ANALYSIS_COLOR, width, lineDash }),
            fill: fill ? new Fill({ color: fill }) : undefined,
            image
        })
    ];
}

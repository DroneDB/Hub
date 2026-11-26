// @ts-check
/**
 * vectorColours - the colours the maps give to what they draw by name (a vector layer by its path, an organization
 * by its slug). It imports nothing of OpenLayers, so a page that only needs a colour (the logo of an organization)
 * does not load the map code.
 */

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
 * The colour of an organization: the one of `colours` (the colours the map gives its organizations by their place
 * among them, see organizationColours), else the one derived from its slug alone, which does not depend on which other
 * organizations are shown. The legend of the map and the logo of an organization both ask here, so an organization
 * that is not in the map's colours has the same colour in both.
 * @param {string} slug
 * @param {Record<string, string>} [colours]
 * @returns {string} CSS color string
 */
export function organizationColour(slug, colours = {}) {
    return colours[slug] ?? getVectorColor(slug, Number.POSITIVE_INFINITY, {});
}

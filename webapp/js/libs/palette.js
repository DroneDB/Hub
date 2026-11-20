// @ts-check
/**
 * The DroneDB blue, with no UI-framework dependency so that map and viewer code can read it
 * without pulling in the PrimeVue preset. theme.js builds the PrimeVue primary tokens from it,
 * canvas code (OpenLayers styles, 2D and 3D overlays) reads it directly, and css/_variables.scss
 * keeps a copy for the stylesheets that a spec holds equal to this object.
 */

/** @typedef {50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950} PrimaryShade */

/** The DroneDB blue, shade 50 to 950, as #rrggbb strings. */
export const PRIMARY = Object.freeze({
    50: '#e6f1fd',
    100: '#b3d5f9',
    200: '#80b8f5',
    300: '#4d9cf0',
    400: '#2685e8',
    500: '#0070e0',
    600: '#0060bf',
    700: '#004a95',
    800: '#00356b',
    900: '#001f40',
    950: '#001122'
});

/**
 * The keyboard focus ring of the Hub, in the light and the dark theme (FR-XC-21): the one set the
 * PrimeVue preset (theme.js), the focus-ring mixin of css/app.scss and css/ol-controls.css draw
 * with. css/_variables.scss keeps a copy (--ddb-focus-ring-*) that a spec holds equal to it.
 *
 * `color` is the ring: 3:1 or more against the page of its theme. `halo` is the second ring that
 * fills the gap between a control and the ring where the colours around are not known (the map
 * and its imagery): the pair is 3:1 or more against each other, so one of them always shows.
 */
export const FOCUS_RING = Object.freeze({
    width: '2px',
    offset: '2px',
    light: Object.freeze({ color: PRIMARY[700], halo: '#ffffff' }),
    dark: Object.freeze({ color: PRIMARY[300], halo: '#09090b' })
});

/**
 * The yellow of the map analysis overlays (the raster area, the profile line, the stockpiles) and
 * of the stockpile panel's accent and the panels' warnings: the Hub has no orange, its warnings
 * are yellow. css/_analysis-panel.scss keeps a copy that a spec holds equal to it.
 */
export const ANALYSIS_YELLOW = '#ffd54f';

/**
 * A #rrggbb colour as a canvas colour string with an alpha (#0070e0: rgba(0, 112, 224, alpha)).
 * @param {string} hex
 * @param {number} alpha  0 to 1
 * @returns {string}
 */
export const hexRgba = (hex, alpha) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * A shade of the brand blue as a canvas colour string with an alpha
 * (shade 500: rgba(0, 112, 224, alpha)).
 * @param {number} alpha  0 to 1
 * @param {PrimaryShade} [shade]
 * @returns {string}
 */
export const primaryRgba = (alpha, shade = 500) => hexRgba(PRIMARY[shade], alpha);

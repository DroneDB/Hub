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
 * A shade of the brand blue as a canvas colour string with an alpha
 * (shade 500: rgba(0, 112, 224, alpha)).
 * @param {number} alpha  0 to 1
 * @param {PrimaryShade} [shade]
 * @returns {string}
 */
export const primaryRgba = (alpha, shade = 500) => {
    const hex = PRIMARY[shade];
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

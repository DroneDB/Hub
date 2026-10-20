// @ts-check
/** App-wide constants (HQ-02). */

/** Coordinate reference systems the map code names. */
export const EPSG = Object.freeze({
    WGS84: 'EPSG:4326',
    WEB_MERCATOR: 'EPSG:3857'
});

/** How long a toast stays, in milliseconds (HQ-03). */
export const TOAST_LIFE = Object.freeze({
    short: 3000,
    normal: 5000,
    long: 8000
});

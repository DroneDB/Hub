// @ts-check
/** App-wide constants. */

/** Coordinate reference systems the map code names. */
export const EPSG = Object.freeze({
    WGS84: 'EPSG:4326',
    WEB_MERCATOR: 'EPSG:3857'
});

/** Shown when the server refuses a download because the user's download slots are busy (HTTP 429). */
export const DOWNLOAD_LIMIT_MESSAGE = 'Download limit reached. Please wait for a download to finish before starting a new one.';

/** How long a toast stays, in milliseconds. */
export const TOAST_LIFE = Object.freeze({
    short: 3000,
    normal: 5000,
    long: 8000
});

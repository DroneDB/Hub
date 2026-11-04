// @ts-check
/**
 * Links to the DroneDB documentation. Every page the Hub links to is named here, so a page that
 * moves in the docs changes one line.
 */

/** Where the documentation pages live */
export const DOCS_BASE_URL = 'https://docs.dronedb.app/docs';

/**
 * The URL of a documentation page.
 * @param {string} page    the page path under the docs root, e.g. 'reference/formats'
 * @param {string} [anchor] a heading on the page, without '#'
 */
export function docsUrl(page, anchor) {
    return `${DOCS_BASE_URL}/${page}${anchor ? `#${anchor}` : ''}`;
}

/** The documentation pages the windows of the Hub link to (the entry types name theirs) */
export const DOCS = Object.freeze({
    alignRaster: docsUrl('hub-guide/processing/align-raster'),
    maskBorders: docsUrl('hub-guide/processing/mask-borders'),
    largeUploads: docsUrl('self-hosting/troubleshooting', 'tuning-the-reverse-proxy-for-large-uploads')
});

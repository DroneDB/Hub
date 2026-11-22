// @ts-check
/**
 * Which addresses a report may print as a QR code (and draw as a link of its own): the ones on this Hub. It is its own
 * module, with no encoder in it, so that a page that only asks the question does not load the QR library.
 */

/**
 * Whether `url` is an address on `origin` (http or https): the only addresses a code may carry, so that a report
 * cannot make the Hub print a code for another site.
 * @param {unknown} url
 * @param {string} [origin]  the origin of the Hub; the page's by default
 */
export function isOriginUrl(url, origin = typeof window === 'undefined' ? '' : window.location.origin) {
    if (typeof url !== 'string' || !origin) return false;
    try {
        const parsed = new URL(url);
        return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin === new URL(origin).origin;
    } catch {
        return false;
    }
}

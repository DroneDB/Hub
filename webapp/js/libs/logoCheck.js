// @ts-check
/**
 * logoCheck - what the Hub checks of a logo file before it asks the Registry: its type and its size. The Registry
 * checks both again and reads the content, not the type the browser reports; this is the same rule, so a refusal
 * shows at the field without a request. The size limit is the caller's: the logo of an organization and the logo
 * of a report template are the same kind of file with their own limits.
 */

/** The image types a logo can have: the same list the logo upload offers and the Registry accepts. */
export const LOGO_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/**
 * What is wrong with a logo file, or null: its type, then its size.
 * @param {{ type?: string, size?: number } | null | undefined} file
 * @param {number} maxBytes  the most the Registry takes for this logo
 * @returns {string | null}
 */
export function logoProblem(file, maxBytes) {
    if (!file) return 'Choose an image';
    if (!LOGO_TYPES.includes(file.type ?? '')) return 'The logo is a PNG, JPEG, WebP or SVG image';
    if ((file.size ?? 0) > maxBytes) return `The logo is at most ${maxBytes / 1024} KB`;
    return null;
}

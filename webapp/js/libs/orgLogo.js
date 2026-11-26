// @ts-check
/**
 * orgLogo - what an organization shows where it has no logo image: its initials on its colour. The pure rules
 * of the OrgLogo component, kept apart so they are tested without a component.
 */
import { readableTextOnChannels } from '@/libs/readableText';

/**
 * The initials of an organization: the first letters of its first two words (of its name, else of its slug), in
 * capitals. A name of one word gives one letter.
 * @param {{ name?: string|null, slug?: string|null } | null | undefined} org
 * @returns {string}
 */
export function orgInitials(org) {
    const text = String(org?.name || org?.slug || '').trim();
    const words = text.split(/[\s\-_.]+/).filter(word => /[\p{L}\p{N}]/u.test(word));
    return words.slice(0, 2).map(word => (Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '').toUpperCase()).join('');
}

/** @param {number} h degrees @param {number} s 0-1 @param {number} l 0-1 @returns {number[]} 0-255 channels */
function hslToRgb(h, s, l) {
    const k = (/** @type {number} */ n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map(c => Math.round(c * 255));
}

/**
 * The channels of a colour the maps hand out (`rgba(r, g, b, a)` or `hsla(h, s%, l%, a)`), without its alpha, or null
 * for any other text.
 * @param {string} colour
 * @returns {number[] | null}
 */
export function colourChannels(colour) {
    const rgb = colour.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    const hsl = colour.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
    if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return null;
}

/**
 * The look of the initials of an organization: the colour as an opaque fill (the maps' colours are drawn with an alpha
 * for a pin; a fill with one would take the colour of the page behind it) and the text on it, white or the dark text,
 * whichever reads better (the lighter palette colours, the yellows, take the dark one). The fill is not a theme token,
 * so neither is its text.
 * @param {string} colour  a colour of the maps
 * @returns {{ background: string, color: string }}
 */
export function initialsLook(colour) {
    const channels = colourChannels(colour);
    if (!channels) return { background: colour, color: '#ffffff' };
    return { background: `rgb(${channels.join(', ')})`, color: readableTextOnChannels(channels) };
}

// @ts-check
/**
 * The colours a measurements file may carry (`stroke`, `fill`). A file comes from any tool, and a colour is
 * written into a style and into the markup of the popups: only a hexadecimal colour or a plain `rgb()`/`rgba()`
 * of numbers (what the Hub's own analysis overlays are saved in) is accepted, so that a value such as
 * `red;position:fixed;...` never reaches a style attribute.
 */

const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i;
const NUMBER = String.raw`\d{1,3}(?:\.\d+)?%?`;
const ALPHA = String.raw`(?:0|1|0?\.\d+|\d{1,3}%)`;
const FUNCTIONAL_COLOUR = new RegExp(String.raw`^rgba?\(\s*${NUMBER}\s*,\s*${NUMBER}\s*,\s*${NUMBER}\s*(?:,\s*${ALPHA}\s*)?\)$`, 'i');

/**
 * Whether a value is a colour a file may carry: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(r, g, b) or rgba(r, g, b, a).
 * @param {unknown} value
 * @returns {value is string}
 */
export const isSafeColour = value => typeof value === 'string' && (HEX_COLOUR.test(value.trim()) || FUNCTIONAL_COLOUR.test(value.trim()));

/**
 * The colour of a saved measurement, or `fallback` when the value is not one a file may carry.
 * @template T
 * @param {unknown} value
 * @param {T} [fallback]
 * @returns {string | T | undefined}
 */
export function safeColour(value, fallback = undefined) {
    return isSafeColour(value) ? value.trim() : fallback;
}

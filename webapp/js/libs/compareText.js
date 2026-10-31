// @ts-check
/**
 * The one way the Hub orders names for people: case and accents do not matter and runs of digits
 * compare as numbers ("Client 2" before "Client 10"), in the language of the browser.
 */

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Comparator for display text; a missing value reads as the empty text.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} negative when `a` comes first, positive when `b` does, 0 when they read the same
 */
export function compareText(a, b) {
    return collator.compare(a == null ? '' : String(a), b == null ? '' : String(b));
}

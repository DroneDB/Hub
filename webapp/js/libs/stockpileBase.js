// @ts-check
/**
 * The base a stockpile volume is measured from (libddb's base plane methods), and which base a
 * pile gets when the user has not picked one.
 *
 * A pile found by a click is measured on the best-fit plane: libddb's detector finds it as what
 * rises above a plane fitted to the ground around it, so a pile on a slope is measured above the
 * slope (the lowest point of its outline, downhill, would count the slope under the pile as
 * pile). A polygon the user draws keeps the lowest perimeter. Once the user picks a base in the
 * panel, every pile is measured on that one.
 */

/** @typedef {'lowest_perimeter' | 'average_perimeter' | 'best_fit' | 'flat'} BaseMethod */
/** @typedef {'detected' | 'drawn'} PileOutline  how the outline of the pile was made */

export const BASE_METHOD = Object.freeze({
    LOWEST_PERIMETER: /** @type {BaseMethod} */ ('lowest_perimeter'),
    AVERAGE_PERIMETER: /** @type {BaseMethod} */ ('average_perimeter'),
    BEST_FIT: /** @type {BaseMethod} */ ('best_fit'),
    FLAT: /** @type {BaseMethod} */ ('flat')
});

/** The base methods with the names the Hub shows them by, in the order it offers them */
export const BASE_METHODS = Object.freeze([
    { id: BASE_METHOD.LOWEST_PERIMETER, name: 'Lowest perimeter' },
    { id: BASE_METHOD.AVERAGE_PERIMETER, name: 'Average perimeter' },
    { id: BASE_METHOD.BEST_FIT, name: 'Best-fit plane' },
    { id: BASE_METHOD.FLAT, name: 'Flat (elevation = 0)' }
]);

export const PILE_OUTLINE = Object.freeze({
    DETECTED: /** @type {PileOutline} */ ('detected'),
    DRAWN: /** @type {PileOutline} */ ('drawn')
});

/**
 * @param {unknown} method
 * @returns {method is BaseMethod}
 */
export function isBaseMethod(method) {
    return BASE_METHODS.some(m => m.id === method);
}

/**
 * @param {BaseMethod} method
 * @returns {string} the name the Hub shows the base by
 */
export function baseMethodName(method) {
    return BASE_METHODS.find(m => m.id === method)?.name ?? method;
}

/**
 * The base a pile is measured from: the one the user picked, else the one of its outline.
 * @param {PileOutline} outline
 * @param {unknown} [chosen]  the base the user picked, if any
 * @returns {BaseMethod}
 */
export function baseMethodFor(outline, chosen) {
    if (isBaseMethod(chosen)) return chosen;
    return outline === PILE_OUTLINE.DETECTED ? BASE_METHOD.BEST_FIT : BASE_METHOD.LOWEST_PERIMETER;
}

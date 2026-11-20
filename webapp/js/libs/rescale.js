// @ts-check
/**
 * The Rescale range of a raster panel (FR-RAS-10, FR-RAS-20, D-025): two numbers, Min and Max. The
 * user types them as numbers are written in their locale ("12,5" and "12.5" are both 12.5,
 * libs/format.js parseNumber); the `rescale` request parameter keeps its machine format "min,max"
 * with "." as the decimal sign, which the Registry also checks (a bad value is a 400 there).
 */
import { parseNumber } from '@/libs/format';

/**
 * What is wrong with each field of a Rescale range typed as text, or null for a field that is fine.
 * Both empty is fine: the range is automatic.
 * @param {unknown} min  the text of Min
 * @param {unknown} max  the text of Max
 * @returns {{ min: string|null, max: string|null }}
 */
export function rescaleErrors(min, max) {
    const blank = (/** @type {unknown} */ v) => v === null || v === undefined || String(v).trim() === '';
    if (blank(min) && blank(max)) return { min: null, max: null };
    const errors = { min: /** @type {string|null} */ (null), max: /** @type {string|null} */ (null) };
    if (blank(min)) errors.min = 'Enter Min, or empty both fields for an automatic range';
    else if (Number.isNaN(parseNumber(min))) errors.min = 'Min must be a number';
    if (blank(max)) errors.max = 'Enter Max, or empty both fields for an automatic range';
    else if (Number.isNaN(parseNumber(max))) errors.max = 'Max must be a number';
    if (!errors.min && !errors.max && parseNumber(min) >= parseNumber(max)) errors.min = 'Min must be less than Max';
    return errors;
}

/**
 * What is wrong with a Rescale range typed as text, or null: the first error of `rescaleErrors`.
 * @param {unknown} min @param {unknown} max
 * @returns {string|null}
 */
export function rescaleProblem(min, max) {
    const errors = rescaleErrors(min, max);
    return errors.min || errors.max;
}

/**
 * The machine value of a valid range typed as text ("min,max" with "." as the decimal sign), '' for
 * the automatic range, null when the range is invalid.
 * @param {unknown} min @param {unknown} max
 * @returns {string|null}
 */
export function rescaleValue(min, max) {
    if (rescaleProblem(min, max)) return null;
    if (String(min ?? '').trim() === '') return '';
    return `${parseNumber(min)},${parseNumber(max)}`;
}

/**
 * The two texts of a machine value ("min,max"); empty texts when there is none.
 * @param {string|null|undefined} value
 * @returns {{ min: string, max: string }}
 */
export function splitRescale(value) {
    if (typeof value !== 'string' || value.trim() === '') return { min: '', max: '' };
    const [min = '', max = ''] = value.split(',');
    return { min: min.trim(), max: max.trim() };
}

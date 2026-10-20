// @ts-check
/**
 * User-visible formatting (HQ-02): dates, durations, sizes, numbers, coordinates and
 * measures. Components format through this module only, so the app shows one format
 * per kind of value and a later i18n pass changes one file.
 *
 * Empty input (null, undefined, '', invalid date) returns `placeholder` ('' by default).
 */
import { bytesToSize, formatTimeAgo } from './utils';

export { bytesToSize as formatBytes, formatTimeAgo };

/**
 * @typedef {Date|number|string|null|undefined} DateInput  a Date, epoch milliseconds or an ISO string
 * @typedef {{ placeholder?: string }} EmptyOption
 */

/** @param {DateInput} value @returns {Date|null} */
function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Locale date, e.g. "10/20/2026".
 * @param {DateInput} value
 * @param {EmptyOption} [options]
 */
export function formatDate(value, { placeholder = '' } = {}) {
    const d = toDate(value);
    return d ? d.toLocaleDateString() : placeholder;
}

/**
 * Locale date and time with 2-digit fields, e.g. "10/20/2026, 02:05 PM".
 * @param {DateInput} value
 * @param {EmptyOption & { seconds?: boolean }} [options]
 */
export function formatDateTime(value, { placeholder = '', seconds = false } = {}) {
    const d = toDate(value);
    if (!d) return placeholder;
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {})
    }).format(d);
}

/**
 * "1h 2m 3s", "2m 3s", "3s".
 * @param {number|null|undefined} totalSeconds
 * @param {EmptyOption} [options]
 */
export function formatDurationSeconds(totalSeconds, { placeholder = '' } = {}) {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0 || !isFinite(totalSeconds)) return placeholder;
    const s = Math.floor(totalSeconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor(s / 60) % 60;
    const seconds = s % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/**
 * Same as formatDurationSeconds, from milliseconds.
 * @param {number|null|undefined} ms
 * @param {EmptyOption} [options]
 */
export function formatDuration(ms, options) {
    return formatDurationSeconds(ms === null || ms === undefined ? ms : ms / 1000, options);
}

/**
 * A number with a fixed number of decimals; non-numbers pass through as text.
 * @param {unknown} value
 * @param {number} [digits]
 * @param {{ placeholder?: string }} [options]  placeholder defaults to '-'
 */
export function formatNumber(value, digits = 3, { placeholder = '-' } = {}) {
    if (value === null || value === undefined || value === '') return placeholder;
    return typeof value === 'number' ? value.toFixed(digits) : String(value);
}

/**
 * "45.123457, 9.765432" (latitude first).
 * @param {number} lat
 * @param {number} lon
 * @param {number} [digits]
 */
export function formatLatLon(lat, lon, digits = 6) {
    return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/**
 * Degrees, minutes, seconds: 45°30'00.00" N.
 * @param {number} degrees  decimal degrees
 * @param {'lat'|'lon'} axis
 */
export function toDms(degrees, axis) {
    const dd = Math.abs(degrees);
    const d = Math.floor(dd);
    const m = Math.floor((dd - d) * 60);
    const s = Math.round((dd - d - m / 60) * 3600 * 100) / 100;
    const dir = axis === 'lat' ? (degrees >= 0 ? 'N' : 'S') : (degrees >= 0 ? 'E' : 'W');
    return `${d}°${m < 10 ? '0' : ''}${m}'${s < 10 ? '0' : ''}${s.toFixed(2)}" ${dir}`;
}

const round2 = v => Math.round(v * 100) / 100;
const ACRES_PER_M2 = 0.00024710538146717;
const FEET_PER_M = 3.28084;

/**
 * Measured area in the user's units: m² up to 1 ha, then km²; acres for imperial.
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {{ value: number, unit: string, text: string }}  value rounded to 2 decimals
 */
export function areaParts(squareMeters, units = 'metric') {
    let value, unit;
    if (units === 'metric') {
        [value, unit] = squareMeters > 10000 ? [squareMeters / 1000000, 'km²'] : [squareMeters, 'm²'];
    } else {
        [value, unit] = [squareMeters * ACRES_PER_M2, 'acres'];
    }
    value = round2(value);
    return { value, unit, text: `${value} ${unit}` };
}

/**
 * Measured length in the user's units: m up to 100 m, then km; feet for imperial.
 * @param {number} meters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {{ value: number, unit: string, text: string }}  value rounded to 2 decimals
 */
export function lengthParts(meters, units = 'metric') {
    let value, unit;
    if (units === 'metric') {
        [value, unit] = meters > 100 ? [meters / 1000, 'km'] : [meters, 'm'];
    } else {
        [value, unit] = [meters * FEET_PER_M, 'ft'];
    }
    value = round2(value);
    return { value, unit, text: `${value} ${unit}` };
}

/** @param {number} squareMeters @param {string} [units] */
export const formatArea = (squareMeters, units) => areaParts(squareMeters, units).text;

/** @param {number} meters @param {string} [units] */
export const formatLength = (meters, units) => lengthParts(meters, units).text;

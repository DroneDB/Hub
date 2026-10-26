// @ts-check
/**
 * User-visible formatting: dates, durations, sizes, numbers, coordinates and
 * measures. Components format through this module only, so the app shows one format
 * per kind of value and a later i18n pass changes one file.
 *
 * Empty input (null, undefined, '', invalid date) returns `placeholder` ('' by default).
 */
import { formatTimeAgo } from './utils';

export { formatTimeAgo };

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

/**
 * Ground speed in the user's units, one decimal: km/h, or mph for imperial.
 * @param {number} metersPerSecond
 * @param {'metric'|'imperial'|string} [units]
 */
export function formatSpeed(metersPerSecond, units = 'metric') {
    return units === 'imperial'
        ? `${(metersPerSecond * 2.23694).toFixed(1)} mph`
        : `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

const INCHES_PER_M = 39.3701;
const FEET_PER_MILE = 5280;

/**
 * A length with fixed decimals that keeps its unit at any size: m, or ft for imperial
 * (an altitude, a GPS accuracy).
 * @param {number} meters
 * @param {'metric'|'imperial'|string} [units]
 * @param {number} [decimals]
 * @returns {{ value: string, unit: string, text: string }}
 */
export function fixedLengthParts(meters, units = 'metric', decimals = 2) {
    const [v, unit] = units === 'imperial' ? [meters * FEET_PER_M, 'ft'] : [meters, 'm'];
    const value = v.toFixed(decimals);
    return { value, unit, text: `${value} ${unit}` };
}

// Values in the unit given by factor (per metre), joined: "5.0", "4.3 x 6.2"
function joinSides(sidesMeters, factor, decimals) {
    return sidesMeters.map(s => (s * factor).toFixed(decimals)).join(' x ');
}

// Pixel sides that differ by less than this are shown as one value
const SQUARE_PIXEL_TOLERANCE = 0.05;

/**
 * The ground size of a raster pixel: cm/px below 1 m, then m/px; in/px below 1 ft,
 * then ft/px for imperial. A pixel whose sides differ by more than 5% shows both.
 * "5.0 cm/px", "0.50 cm/px", "4.3 x 6.2 cm/px", "2.0 in/px"
 * @param {number} xMeters
 * @param {number} yMeters
 * @param {'metric'|'imperial'|string} [units]
 */
export function formatPixelSize(xMeters, yMeters, units = 'metric') {
    const square = Math.abs(xMeters - yMeters) <= SQUARE_PIXEL_TOLERANCE * Math.max(xMeters, yMeters);
    const sides = square ? [(xMeters + yMeters) / 2] : [xMeters, yMeters];
    const max = Math.max(...sides);
    const [factor, unit] = units === 'imperial'
        ? (max * INCHES_PER_M < 12 ? [INCHES_PER_M, 'in/px'] : [FEET_PER_M, 'ft/px'])
        : (max < 1 ? [100, 'cm/px'] : [1, 'm/px']);
    const scaled = max * factor;
    const decimals = scaled < 1 ? 2 : scaled < 100 ? 1 : 0;
    return `${joinSides(sides, factor, decimals)} ${unit}`;
}

/**
 * The ground width and height of a raster: m below 1 km, then km; ft below 1 mile,
 * then mi for imperial. "179 x 193 m", "8.4 x 6.2 m", "1.79 x 1.93 km", "295 x 289 ft"
 * @param {number} widthMeters
 * @param {number} heightMeters
 * @param {'metric'|'imperial'|string} [units]
 */
export function formatExtent(widthMeters, heightMeters, units = 'metric') {
    const sides = [widthMeters, heightMeters];
    const max = Math.max(...sides);
    const [smallFactor, smallUnit, largeFactor, largeUnit, largeFrom] = units === 'imperial'
        ? [FEET_PER_M, 'ft', FEET_PER_M / FEET_PER_MILE, 'mi', FEET_PER_MILE / FEET_PER_M]
        : [1, 'm', 1 / 1000, 'km', 1000];
    if (max >= largeFrom) return `${joinSides(sides, largeFactor, 2)} ${largeUnit}`;
    return `${joinSides(sides, smallFactor, max * smallFactor >= 10 ? 0 : 1)} ${smallUnit}`;
}

/**
 * The area of a piece of land: m² below 1 ha, ha below 100 km², then km²; acres for
 * imperial (as a measured area). "640 m²", "3.4 ha", "250 km²", "2.03 acres"
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 */
export function formatLandArea(squareMeters, units = 'metric') {
    if (units !== 'metric') return formatArea(squareMeters, units);
    if (squareMeters < 1e4) return `${Math.round(squareMeters)} m²`;
    if (squareMeters < 1e8) return `${(squareMeters / 1e4).toFixed(1)} ha`;
    return `${Math.round(squareMeters / 1e6)} km²`;
}

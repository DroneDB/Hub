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

/**
 * The word that agrees with count: singular for 1, the plural form (singular + "s" unless
 * given) for any other count, e.g. pluralize(2, 'has', 'have') is "have".
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 */
export function pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
}

/**
 * A count and its noun, e.g. "1 file", "0 files", "3 files".
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 */
export function countOf(count, singular, plural) {
    return `${count} ${pluralize(count, singular, plural)}`;
}

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
const FEET_PER_M = 3.28084;
const M2_PER_ACRE = 4046.8564224;
// A square foot is 0.09290304 m² by definition
const SQUARE_FEET_PER_M2 = 1 / 0.09290304;

/**
 * @typedef {{ below: number, factor: number, unit: string, landDecimals: number }} AreaStep
 *   one unit of an area scale: it applies below `below` m², `factor` turns m² into it, and a
 *   land area shows `landDecimals` decimals in it
 */

/**
 * The units an area is shown in, smallest first: m², then ha from 1 ha, then km² from 100 km²;
 * ft², then acres from 1 acre. The last step applies at any size.
 * @type {Readonly<Record<'metric'|'imperial', readonly AreaStep[]>>}
 */
const AREA_SCALES = Object.freeze({
    metric: Object.freeze([
        { below: 1e4, factor: 1, unit: 'm²', landDecimals: 0 },
        { below: 1e8, factor: 1e-4, unit: 'ha', landDecimals: 1 },
        { below: Infinity, factor: 1e-6, unit: 'km²', landDecimals: 0 }
    ]),
    imperial: Object.freeze([
        { below: M2_PER_ACRE, factor: SQUARE_FEET_PER_M2, unit: 'ft²', landDecimals: 0 },
        { below: Infinity, factor: 1 / M2_PER_ACRE, unit: 'acres', landDecimals: 2 }
    ])
});

/**
 * The unit an area is shown in, for every view that shows one: a measured area, the area of a
 * piece of land, a stockpile footprint. Any units other than 'metric' are imperial.
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {AreaStep}
 */
export function areaScale(squareMeters, units = 'metric') {
    const scale = units === 'metric' ? AREA_SCALES.metric : AREA_SCALES.imperial;
    return scale.find(step => squareMeters < step.below) ?? scale[scale.length - 1];
}

/**
 * Measured area in the user's units (see areaScale): "640 m²", "1.5 ha", "1200 ft²", "3.71 acres".
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {{ value: number, unit: string, text: string }}  value rounded to 2 decimals
 */
export function areaParts(squareMeters, units = 'metric') {
    const { factor, unit } = areaScale(squareMeters, units);
    const value = round2(squareMeters * factor);
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
 * The area of a piece of land, in the units of areaScale with fixed decimals per unit.
 * "640 m²", "3.4 ha", "250 km²", "10764 ft²", "2.03 acres"
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 */
export function formatLandArea(squareMeters, units = 'metric') {
    const { factor, unit, landDecimals } = areaScale(squareMeters, units);
    return `${(squareMeters * factor).toFixed(landDecimals)} ${unit}`;
}

// A cubic yard and a short ton by definition
const M3_PER_CUBIC_YARD = 0.764554857984;
const TONNES_PER_SHORT_TON = 0.90718474;

/**
 * @typedef {{ factor: number, unit: string }} UnitStep  `factor` turns the metric value into `unit`
 * @typedef {{ volume: UnitStep, weight: UnitStep, density: UnitStep, perWeight: UnitStep }} BulkUnits
 *   the units of a pile of material: volume (m³), weight (t), density (t/m³) and the weight a price
 *   is per (t: its factor turns a price per tonne into a price per `unit`)
 */

/** @type {Readonly<Record<'metric'|'imperial', BulkUnits>>} */
const BULK_UNITS = Object.freeze({
    metric: Object.freeze({
        volume: { factor: 1, unit: 'm³' },
        weight: { factor: 1, unit: 't' },
        density: { factor: 1, unit: 't/m³' },
        perWeight: { factor: 1, unit: 't' }
    }),
    imperial: Object.freeze({
        volume: { factor: 1 / M3_PER_CUBIC_YARD, unit: 'yd³' },
        weight: { factor: 1 / TONNES_PER_SHORT_TON, unit: 'ST' },
        density: { factor: M3_PER_CUBIC_YARD / TONNES_PER_SHORT_TON, unit: 'ST/yd³' },
        perWeight: { factor: TONNES_PER_SHORT_TON, unit: 'ST' }
    })
});

/**
 * The units a stockpile is shown in: m³, t, t/m³ and prices per tonne; yd³, short tons, ST/yd³
 * and prices per short ton for imperial. Values are kept metric and converted for display only.
 * @param {'metric'|'imperial'|string} [units]
 * @returns {BulkUnits}
 */
export function bulkUnits(units = 'metric') {
    return units === 'metric' ? BULK_UNITS.metric : BULK_UNITS.imperial;
}

/**
 * An amount of money in a currency, as the locale writes it: "$1,234.50", "€1,234.50".
 * An unknown currency code is written after the number.
 * @param {number} amount
 * @param {string} currency  an ISO 4217 code
 */
export function formatMoney(amount, currency) {
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch {
        return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`.trim();
    }
}

/** The currency of prices while the user has not chosen one (PREF.CURRENCY) */
export const DEFAULT_CURRENCY = 'USD';

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * The currency a stored value names: an ISO 4217 code, upper-cased; the default for anything else
 * (a value written by hand or cut short).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCurrency(value) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return CURRENCY_CODE.test(code) ? code : DEFAULT_CURRENCY;
}

// The currencies offered first, before the others in code order
const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR'];

/**
 * The currencies to choose from, the common ones first: [{ value: 'EUR', label: 'EUR - Euro' }, ...].
 * Without Intl.supportedValuesOf (an older browser) only the common ones.
 * @returns {{ value: string, label: string }[]}
 */
export function currencyChoices() {
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : [];
    const rest = all.filter(code => !COMMON_CURRENCIES.includes(code)).sort();
    let names = null;
    try {
        names = new Intl.DisplayNames(undefined, { type: 'currency' });
    } catch { /* codes only */ }
    return [...COMMON_CURRENCIES, ...rest].map(code => {
        const name = names?.of(code);
        return { value: code, label: name && name !== code ? `${code} - ${name}` : code };
    });
}

// @ts-check
/**
 * User-visible formatting: dates, durations, sizes, numbers, coordinates and
 * measures. Components format through this module only, so the app shows one format
 * per kind of value and a later i18n pass changes one file (FR-XC-08).
 *
 * Numbers and dates are written in the browser's locale (navigator.language, D-006): its
 * decimal sign and its group separator, through Intl. A quantity has its number of
 * decimals in PRECISION, and a typed number is read with parseNumber (D-025).
 *
 * A number put in a text field for the user to edit is written with formatInputNumber (the
 * locale's decimal sign, no group separators), never with formatNumber: parseNumber reads a
 * lone "." or "," as the decimal sign, so a grouped "1,234" would read back as 1.234.
 *
 * Empty input (null, undefined, '', invalid date) returns `placeholder`: '' by default for
 * dates, EMPTY_CELL for numbers; a date or a fact that is not known shows UNKNOWN.
 */

/**
 * @typedef {Date|number|string|null|undefined} DateInput  a Date, epoch milliseconds or an ISO string
 * @typedef {{ placeholder?: string }} EmptyOption
 */

/** What a date or a fact that is not known shows */
export const UNKNOWN = 'Unknown';

/** What an empty numeric table cell shows (an en dash) */
export const EMPTY_CELL = '\u2013';

/**
 * The locale numbers and dates are written and read in: the browser's (D-006); the runtime's
 * default without a navigator.
 * @returns {string|undefined}
 */
export function displayLocale() {
    return (typeof navigator !== 'undefined' && navigator.language) || undefined;
}

/**
 * The number of decimals of each quantity, the one table every view uses, so the same quantity
 * reads the same in a panel, a map label, a list and a chart.
 */
export const PRECISION = Object.freeze({
    /** a number of things: pixels, points, files */
    count: 0,
    /** a length in m or ft */
    length: 2,
    /** a length in km or mi */
    longLength: 3,
    /** an area in m², ha, km², ft² or acres */
    area: 2,
    /** a volume in m³ or yd³ */
    volume: 2,
    /** a weight in t or short tons */
    weight: 2,
    /** a bulk density in t/m³ or ST/yd³ */
    density: 3,
    /** an elevation in m or ft */
    elevation: 2,
    /** a ground speed in km/h or mph */
    speed: 1,
    /** a temperature in °C, °F or K */
    temperature: 1,
    /** a percentage */
    percent: 1,
    /** a size in KB, MB, GB... */
    bytes: 2,
    /** a value without a unit (an index, a band value) */
    value: 3
});

/** @typedef {keyof typeof PRECISION} Quantity */

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

/** One Intl.NumberFormat per locale and options, kept: map labels format on every frame */
function numberFormat(/** @type {Intl.NumberFormatOptions} */ options) {
    const locale = displayLocale();
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = numberFormats.get(key);
    if (!format) {
        try {
            format = new Intl.NumberFormat(locale, options);
        } catch {
            // A locale the runtime does not know
            format = new Intl.NumberFormat(undefined, options);
        }
        numberFormats.set(key, format);
    }
    return format;
}

/** @param {number|Quantity} digits @returns {number} */
const decimalsOf = digits => (typeof digits === 'number' ? digits : PRECISION[digits] ?? PRECISION.value);

/**
 * A number in the browser's locale, with group separators: "59,090,002.25" in en, "59.090.002,25"
 * in it. Non-numbers pass through as text; no number (null, undefined, '', NaN, Infinity) is the
 * placeholder.
 * @param {unknown} value
 * @param {number|Quantity} [digits]  the decimals, or the quantity whose decimals (PRECISION) apply
 * @param {{ placeholder?: string, trim?: boolean, significant?: number, grouping?: boolean }} [options]
 *   trim: no trailing zeros ("1.5", not "1.50"); significant: at most this many significant
 *   digits instead of `digits` decimals; grouping false: no group separators (a coordinate)
 */
export function formatNumber(value, digits = PRECISION.value, { placeholder = EMPTY_CELL, trim = false, significant, grouping = true } = {}) {
    if (value === null || value === undefined || value === '') return placeholder;
    if (typeof value !== 'number') return String(value);
    if (!Number.isFinite(value)) return placeholder;
    /** @type {Intl.NumberFormatOptions} */
    let options;
    let shown = value || 0;
    if (significant) {
        options = { maximumSignificantDigits: significant };
    } else {
        const decimals = decimalsOf(digits);
        options = { minimumFractionDigits: trim ? 0 : decimals, maximumFractionDigits: decimals };
        // No "-0.00" for a small negative value rounded to zero
        if (Math.abs(shown) < 0.5 * Math.pow(10, -decimals)) shown = 0;
    }
    return numberFormat({ useGrouping: grouping, ...options }).format(shown);
}

/**
 * A number to put in a text field the user edits: the browser's decimal sign, no group separators,
 * no trailing zeros ("1234,5" in it, "1234.5" in en), so parseNumber reads it back as it is. ''
 * for no number.
 * @param {unknown} value
 * @param {number|Quantity} [digits]  at most this many decimals
 */
export function formatInputNumber(value, digits = 10) {
    return formatNumber(value, digits, { trim: true, grouping: false, placeholder: '' });
}

/** The decimal sign and the group separator of the browser's locale */
function separators() {
    const parts = numberFormat({ useGrouping: true }).formatToParts(12345.6);
    return {
        decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
        group: parts.find(p => p.type === 'group')?.value ?? ','
    };
}

/**
 * Numbers already written (formatNumber), one after the other: joined by ", ", or by "; " in a
 * locale whose decimal sign is a comma ("45,5; 9,25"), so the list stays readable.
 * @param {string[]} texts
 */
export function joinNumberTexts(texts) {
    return texts.join(separators().decimal === ',' ? '; ' : ', ');
}

/**
 * Numbers written one after the other, each with formatNumber, joined by joinNumberTexts.
 * @param {unknown[]} values
 * @param {number|Quantity} [digits]
 * @param {{ placeholder?: string, trim?: boolean, grouping?: boolean }} [options]
 */
export function formatNumberList(values, digits, options) {
    return joinNumberTexts(values.map(v => formatNumber(v, digits, options)));
}

// Grouped digits, "," standing for the group separator: groups of three ("1,234", "12,345,678"), or
// the Indian grouping of en-IN and hi-IN, groups of two before the last three ("12,34,567")
const groupedDigits = (/** @type {string} */ group) =>
    new RegExp(`^(\\d{1,3}(\\${group}\\d{3})+|\\d{1,2}(\\${group}\\d{2})+\\${group}\\d{3})$`);

// Group separators that are never a decimal sign: an apostrophe or a right single quotation mark
// (de-CH writes 1’234.5)
const APOSTROPHES = /['\u2019]/g;

/**
 * The digits of a number written with `decimal` and `group`, as JavaScript reads them ("1234.5"),
 * or null when the text is not written so.
 * @param {string} text  without sign or spaces
 * @param {string} decimal
 * @param {string} group
 */
function plainDigits(text, decimal, group) {
    const at = text.indexOf(decimal);
    const [whole, fraction] = at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)];
    if (!/^\d*$/.test(fraction)) return null;
    let digits = whole;
    if (whole.includes(group)) {
        if (!groupedDigits(group).test(whole)) return null;
        digits = whole.split(group).join('');
    } else if (!/^\d*$/.test(whole)) {
        return null;
    }
    if (!digits && !fraction) return null;
    return `${digits || '0'}.${fraction || '0'}`;
}

/**
 * The number a user typed, by the rule of D-025: a lone "." or "," with no other separator is the
 * decimal sign, so "12.5" and "12,5" are 12.5 in every locale; any other text is read with the
 * browser's locale first ("1.234,5" is 1234.5 in it, "1,234.5" in en, "12,34,567.5" in en-IN), then
 * with the other convention. Spaces and apostrophes (group separators in fr and de-CH) are ignored,
 * and a leading + or - is the sign. NaN when the text is not a number.
 * @param {unknown} text
 * @returns {number}
 */
export function parseNumber(text) {
    if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
    if (typeof text !== 'string') return NaN;
    const { decimal, group } = separators();
    // \s includes the no-break spaces some locales group digits with
    let t = text.replace(/\s/g, '').replace(APOSTROPHES, '');
    // Any other group separator than "." and "," is only ever a group separator
    if (group !== '.' && group !== ',' && !/\s/.test(group)) t = t.split(group).join('');
    let sign = 1;
    const signed = /^([+\-\u2212])(.*)$/.exec(t);
    if (signed) {
        sign = signed[1] === '+' ? 1 : -1;
        t = signed[2];
    }
    if (!t || !/^[\d.,]+$/.test(t)) return NaN;

    const separatorCount = (t.match(/[.,]/g) ?? []).length;
    let digits;
    if (separatorCount <= 1) {
        digits = plainDigits(t.replace(',', '.'), '.', ',');
    } else {
        const [localeDecimal, localeGroup] = decimal === ',' ? [',', '.'] : ['.', ','];
        digits = plainDigits(t, localeDecimal, localeGroup) ?? plainDigits(t, localeGroup, localeDecimal);
    }
    return digits === null ? NaN : sign * Number(digits);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

/**
 * A size in bytes, in binary units (1 KB = 1024 bytes) with at most `decimals` decimals:
 * "0 B", "1 KB", "1.46 MB", "1,5 GB" in it.
 * @param {number|null|undefined} bytes
 * @param {{ decimals?: number, placeholder?: string }} [options]
 */
export function formatBytes(bytes, { decimals = PRECISION.bytes, placeholder = EMPTY_CELL } = {}) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return placeholder;
    if (bytes === 0) return '0 B';
    const k = 1024;
    const i = Math.max(0, Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))));
    return `${formatNumber(bytes / Math.pow(k, i), Math.max(0, decimals), { trim: true })} ${BYTE_UNITS[i]}`;
}

/**
 * Format a timestamp as a human-readable relative time string.
 * This is the single source of truth for "time ago" formatting across the app.
 * @param {number|null|undefined} ms - Millisecond timestamp (e.g., `Date.now()` or `new Date(str).getTime()`)
 * @returns {string} e.g. "just now", "5 minutes ago", "3 months ago", "2 years ago"
 */
export function formatTimeAgo(ms) {
    if (ms == null) return '';
    const diff = Date.now() - ms;
    const absDiff = Math.abs(diff);
    const suffix = diff >= 0 ? 'ago' : 'from now';
    const minutes = Math.floor(absDiff / 60000);
    const hours = Math.floor(absDiff / 3600000);
    const days = Math.floor(absDiff / 86400000);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ${suffix}`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ${suffix}`;
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ${suffix}`;
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ${suffix}`;
    return `${years || 1} year${years > 1 ? 's' : ''} ${suffix}`;
}

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
    return `${formatNumber(count, PRECISION.count, { trim: true })} ${pluralize(count, singular, plural)}`;
}

/**
 * The date of a value, or null when there is none: no value, a text that is not a date, or the
 * epoch 0 that a file without a date reports (a capture time of 0 is not known, not 1970).
 * @param {DateInput} value @returns {Date|null}
 */
function toDate(value) {
    if (value === null || value === undefined || value === '' || value === 0) return null;
    const d = value instanceof Date ? value : new Date(value);
    const ms = d.getTime();
    return isNaN(ms) || ms === 0 ? null : d;
}

/** @param {Intl.DateTimeFormatOptions} options */
function dateTimeFormat(options) {
    try {
        return new Intl.DateTimeFormat(displayLocale(), options);
    } catch {
        return new Intl.DateTimeFormat(undefined, options);
    }
}

/**
 * Locale date, e.g. "10/20/2026".
 * @param {DateInput} value
 * @param {EmptyOption} [options]
 */
export function formatDate(value, { placeholder = '' } = {}) {
    const d = toDate(value);
    return d ? dateTimeFormat({ year: 'numeric', month: 'numeric', day: 'numeric' }).format(d) : placeholder;
}

/**
 * Locale date and time with 2-digit fields, in local time: "10/20/2026, 02:05 PM" in en-US,
 * "20/10/2026, 14:05" in it. Every date of the app is written so (Modified, Capture Time, Created).
 * @param {DateInput} value
 * @param {EmptyOption & { seconds?: boolean }} [options]
 */
export function formatDateTime(value, { placeholder = '', seconds = false } = {}) {
    const d = toDate(value);
    if (!d) return placeholder;
    return dateTimeFormat({
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {})
    }).format(d);
}

/**
 * Locale time of day with 2-digit fields, in local time: "02:05:09 PM" in en-US, "14:05:09" in it.
 * @param {DateInput} value
 * @param {EmptyOption & { seconds?: boolean }} [options]
 */
export function formatTime(value, { placeholder = '', seconds = true } = {}) {
    const d = toDate(value);
    if (!d) return placeholder;
    return dateTimeFormat({ hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(d);
}

const UTC_CLOCK = /^(\d{2}):(\d{2}):(\d{2})$/;

/**
 * A UTC time of day ("HH:mm:ss", as the Registry writes the lines of a task log) in local time
 * (formatTime): the latest such moment that is not after `now` (a log line is never in the future).
 * The text as it is when it is not a time of day.
 * @param {string} clock  "HH:mm:ss" in UTC
 * @param {Date} [now]
 */
export function utcClockToLocal(clock, now = new Date()) {
    const m = UTC_CLOCK.exec(clock);
    if (!m) return clock;
    const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (h > 23 || min > 59 || s > 59) return clock;
    let ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, min, s);
    // A minute of slack for a server clock that runs a little ahead
    if (ms > now.getTime() + 60000) ms -= 86400000;
    return formatTime(ms, { seconds: true });
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

/** A value rounded to the decimals of `digits` (a number of decimals or a quantity) */
const roundTo = (/** @type {number} */ v, /** @type {number|Quantity} */ digits) => {
    const f = Math.pow(10, decimalsOf(digits));
    return Math.round(v * f) / f;
};

/**
 * A value and its unit, as the measuring functions return them: `value` rounded to the decimals of
 * the quantity, `text` the value in the browser's locale (no trailing zeros) and the unit.
 * @param {number} v @param {string} unit @param {number|Quantity} digits
 * @returns {{ value: number, unit: string, text: string }}
 */
const quantityParts = (v, unit, digits) =>
    ({ value: roundTo(v, digits), unit, text: `${formatNumber(v, digits, { trim: true })} ${unit}` });
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
 * Measured area in the user's units (see areaScale): "640 m²", "1.5 ha", "1,200 ft²", "3.71 acres".
 * @param {number} squareMeters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {{ value: number, unit: string, text: string }}  value rounded to PRECISION.area decimals
 */
export function areaParts(squareMeters, units = 'metric') {
    const { factor, unit } = areaScale(squareMeters, units);
    return quantityParts(squareMeters * factor, unit, 'area');
}

/**
 * Measured length in the user's units: m below 1 km (PRECISION.length decimals), then km
 * (PRECISION.longLength decimals); feet for imperial. "110.4 m", "1.235 km", "3.28 ft"
 * @param {number} meters
 * @param {'metric'|'imperial'|string} [units]
 * @returns {{ value: number, unit: string, text: string }}  value rounded to the decimals of its unit
 */
export function lengthParts(meters, units = 'metric') {
    if (units !== 'metric') return quantityParts(meters * FEET_PER_M, 'ft', 'length');
    // On the value as it would show in metres, so 999.996 m is "1 km", not "1,000 m"
    return Math.abs(roundTo(meters, 'length')) >= 1000
        ? quantityParts(meters / 1000, 'km', 'longLength')
        : quantityParts(meters, 'm', 'length');
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
        ? `${formatNumber(metersPerSecond * 2.23694, 'speed')} mph`
        : `${formatNumber(metersPerSecond * 3.6, 'speed')} km/h`;
}

const INCHES_PER_M = 39.3701;
const FEET_PER_MILE = 5280;

/**
 * A length with fixed decimals that keeps its unit at any size: m, or ft for imperial
 * (an altitude, a GPS accuracy).
 * @param {number} meters
 * @param {'metric'|'imperial'|string} [units]
 * @param {number} [decimals]
 * @returns {{ value: string, unit: string, text: string }}  value: the number as formatNumber writes it
 */
export function fixedLengthParts(meters, units = 'metric', decimals = PRECISION.length, { grouping = true } = {}) {
    const [v, unit] = units === 'imperial' ? [meters * FEET_PER_M, 'ft'] : [meters, 'm'];
    const value = formatNumber(v, decimals, { grouping });
    return { value, unit, text: `${value} ${unit}` };
}

// Values in the unit given by factor (per metre), joined: "5.0", "4.3 x 6.2"
function joinSides(/** @type {number[]} */ sidesMeters, /** @type {number} */ factor, /** @type {number} */ decimals) {
    return sidesMeters.map(s => formatNumber(s * factor, decimals)).join(' x ');
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
    return `${formatNumber(squareMeters * factor, landDecimals)} ${unit}`;
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
 * A quantity of a pile of material, given metric, in the user's units with the decimals of
 * PRECISION (no trailing zeros); the placeholder for no number.
 * @param {'volume'|'weight'|'density'} kind
 * @param {unknown} metric  m³, t or t/m³
 * @param {string} [units]
 * @param {string} [placeholder]
 */
function bulkText(kind, metric, units, placeholder = EMPTY_CELL) {
    if (typeof metric !== 'number' || !Number.isFinite(metric)) return placeholder;
    const { factor, unit } = bulkUnits(units)[kind];
    return `${formatNumber(metric * factor, kind, { trim: true })} ${unit}`;
}

/**
 * A volume in m³ in the user's units: "1,234.5 m³", "1,614.69 yd³". The stockpile panel and the
 * label of the pile on the map write it so.
 * @param {unknown} cubicMeters @param {string} [units] @param {EmptyOption} [options]
 */
export const formatVolume = (cubicMeters, units, { placeholder } = {}) => bulkText('volume', cubicMeters, units, placeholder);

/** A weight in tonnes in the user's units: "2,074.2 t", "2,286.43 ST". @param {unknown} tonnes @param {string} [units] @param {EmptyOption} [options] */
export const formatWeight = (tonnes, units, { placeholder } = {}) => bulkText('weight', tonnes, units, placeholder);

/** A bulk density in t/m³ in the user's units: "1.68 t/m³", "1.416 ST/yd³". @param {unknown} tonnesPerCubicMeter @param {string} [units] @param {EmptyOption} [options] */
export const formatDensity = (tonnesPerCubicMeter, units, { placeholder } = {}) => bulkText('density', tonnesPerCubicMeter, units, placeholder);

/**
 * The label of a stockpile (on the map, in the Measurement List, in the saved file's tooltip): its
 * title, volume, material and density, built at render time from the stored metric properties, in
 * the units the user has now (or the pile's own `unitSystem` when none is given), so Convert and a
 * reload show yd³ and ST like the stockpile panel.
 * @param {{ title?: string, netVolume?: unknown, materialName?: string, materialDensity?: unknown, unitSystem?: string }} [props]
 * @param {string} [unitPref]  'metric' or 'imperial'
 * @returns {string}
 */
export function stockpileLabel(props, unitPref) {
    const p = props || {};
    const units = unitPref || p.unitSystem;
    const parts = [];
    if (p.title) parts.push(p.title);
    if (typeof p.netVolume === 'number') parts.push(formatVolume(p.netVolume, units));
    if (p.materialName) parts.push(p.materialName);
    if (p.materialDensity) parts.push(formatDensity(p.materialDensity, units));
    return parts.join(' - ') || 'Stockpile';
}

/**
 * An amount of money in a currency, as the locale writes it: "$1,234.50", "€1,234.50".
 * An unknown currency code is written after the number.
 * @param {number} amount
 * @param {string} currency  an ISO 4217 code
 */
export function formatMoney(amount, currency) {
    try {
        return new Intl.NumberFormat(displayLocale(), { style: 'currency', currency }).format(amount);
    } catch {
        return `${formatNumber(amount, 2, { trim: true })} ${currency}`.trim();
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

// @ts-check
import { formatNumber, EMPTY_CELL, PRECISION } from '@/libs/format';

/**
 * The unit the values of a single-band raster are shown in (Raster Analysis: range, area
 * statistics, profile, inspected value), and the one formatter of a raster value (FR-RAS-28).
 *
 * A raster's own unit is its band's unit type, as libddb's raster value info reports it. An
 * elevation model without one is in metres: libddb reads the elevations of a band without a unit
 * type as metres (volumes, stockpiles, profiles, contours). Any other raster without a unit type
 * (raw sensor values, such as the digital numbers of a thermal mosaic) has no unit.
 */

/** The unit of the elevations of an elevation model without a unit type */
export const ELEVATION_UNIT = 'm';

// The samples of an elevation model, as libddb tells one from an image (ddb align): floating
// point or signed integers; images are unsigned integers
const ELEVATION_DATA_TYPES = new Set(['Float32', 'Float64', 'Int16', 'Int32']);

/**
 * @typedef {{ bandCount?: number, dataType?: string, isThermal?: boolean, unit?: string }} RasterValueInfo
 *   what libddb's raster value info says of a raster (getRasterValueInfo)
 */

/**
 * Whether the raster is an elevation model (DSM, DTM): one band, of floating point or signed
 * integer samples, and not thermal.
 * @param {RasterValueInfo | null | undefined} info
 */
export function isElevationRaster(info) {
    if (!info || info.isThermal) return false;
    return Number(info.bandCount) === 1 && ELEVATION_DATA_TYPES.has(info.dataType ?? '');
}

/**
 * The unit of the values of the raster: its own, else metres for an elevation model, else none.
 * @param {RasterValueInfo | null | undefined} info
 * @returns {string}
 */
export function rasterValueUnit(info) {
    if (!info) return '';
    if (info.unit) return info.unit;
    return isElevationRaster(info) ? ELEVATION_UNIT : '';
}

// The units of the band as the files and libddb write them, in the one symbol the Hub shows (FR-RAS-28)
const UNIT_SYMBOLS = new Map([
    ['c', '°C'], ['°c', '°C'], ['degc', '°C'], ['celsius', '°C'], ['degrees celsius', '°C'],
    ['k', 'K'], ['kelvin', 'K'],
    ['f', '°F'], ['°f', '°F'], ['degf', '°F'], ['fahrenheit', '°F'], ['degrees fahrenheit', '°F']
]);
const TEMPERATURE_UNITS = new Set(['°C', 'K', '°F']);
const ELEVATION_UNITS = new Set(['m', 'ft']);

/**
 * The symbol a unit is written with: "Celsius" and "C" are "°C", "kelvin" is "K", "fahrenheit" is "°F"; any other
 * unit is as it is, without the spaces around it.
 * @param {string|null|undefined} unit
 * @returns {string}
 */
export function rasterUnitSymbol(unit) {
    const text = String(unit ?? '').trim();
    return UNIT_SYMBOLS.get(text.toLowerCase()) ?? text;
}

/** The number rounded as Intl rounds it (293.15 is 293.2 at one decimal; toFixed says 293.1), in a form Number() reads */
const roundedText = (/** @type {number} */ value, /** @type {number} */ places) =>
    new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: places, maximumFractionDigits: places }).format(value);

/**
 * A value of a raster in its unit: the one format of the tooltip, the panel, the area statistics, the legend and the
 * chart. The value is the number as shown (rounded to its decimals), the unit its symbol, the text the two with a space,
 * "29.1 °C". It does not convert: the server answers in the unit that was asked (D-022). A temperature has one decimal,
 * an elevation in m or ft two (PRECISION), any other value up to three, without trailing zeros.
 * @param {unknown} value
 * @param {string|null|undefined} [unit]
 * @param {{ digits?: number, placeholder?: string }} [options]  digits: the decimals instead of those of the unit's kind
 * @returns {{ value: number|null, unit: string, text: string }}  without a number, value is null and text the placeholder (or
 *   the text given, with the unit)
 */
export function rasterValueParts(value, unit, { digits, placeholder = EMPTY_CELL } = {}) {
    const symbol = rasterUnitSymbol(unit);
    if (typeof value === 'string' && value !== '') {
        // Values of several bands, already written: the unit follows them
        return { value: null, unit: symbol, text: symbol ? `${value} ${symbol}` : value };
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return { value: null, unit: '', text: placeholder };
    /** @type {import('@/libs/format').Quantity|number} */
    let decimals = 'value';
    let trim = true;
    if (typeof digits === 'number') {
        decimals = digits;
        trim = false;
    } else if (TEMPERATURE_UNITS.has(symbol)) {
        decimals = 'temperature';
        trim = false;
    } else if (ELEVATION_UNITS.has(symbol)) {
        decimals = 'elevation';
        trim = false;
    }
    const number = formatNumber(value, decimals, { trim });
    const places = typeof decimals === 'number' ? decimals : PRECISION[decimals];
    return {
        value: Number(roundedText(value, places)) || 0,
        unit: symbol,
        text: symbol ? `${number} ${symbol}` : number
    };
}

/**
 * The text of a raster value in its unit.
 * @param {unknown} value @param {string|null|undefined} [unit] @param {{ digits?: number, placeholder?: string }} [options]
 */
export const formatRasterValue = (value, unit, options) => rasterValueParts(value, unit, options).text;

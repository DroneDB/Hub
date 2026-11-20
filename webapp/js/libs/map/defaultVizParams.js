// @ts-check
/**
 * The default style of a raster layer (FR-XC-24, FR-RAS-24, D-041): the one function the map seeds a raster with when it
 * loads, and the Raster Analysis panel opens with and goes back to on Reset. The stretch is ddb's: the value info of the
 * raster carries it (`stretch`, one {min, max} per band, one for an index, none for a Byte raster of several bands); the
 * Hub computes none. A panel never changes the default (FR-RAS-17).
 *
 * The colour map is ironbow for thermal, rdylgn for a vegetation index and viridis for any other single band. A thermal
 * raster opens in the unit of its band (D-022): a Kelvin raster in K, with the formula of that unit (ddb converts from the
 * band unit, so the formula of the band's own unit changes no value) and the rescale of ddb, which is in the band unit.
 */
import { rasterValueUnit, thermalBandUnit, thermalFormulaOfUnit } from '@/libs/map/rasterUnit';

/**
 * @typedef {{ isThermal?: boolean, calibration?: unknown, unit?: string, bandCount?: number, dataType?: string,
 *             valueMin?: number, valueMax?: number, stretch?: { min: number, max: number }[] }} ValueInfo
 *   what the Registry's raster value info says of a raster (libddb DDBGetRasterValueInfoEx)
 * @typedef {{ formula?: string, colormap: string, rescale: string, unit: string }} DefaultVizParams
 *   rescale is "min,max", or '' for the server's own stretch; unit is what the panel's Unit field starts with
 */

export const THERMAL_COLORMAP = 'ironbow';
export const INDEX_COLORMAP = 'rdylgn';
export const GENERIC_COLORMAP = 'viridis';

/**
 * A stretch limit as the text of a rescale: up to 7 significant digits, no exponent, no trailing zeros.
 * @param {number} v
 */
function limitText(v) {
    const rounded = Number(v.toPrecision(7));
    const text = String(rounded);
    return /e/i.test(text) ? String(Number(rounded.toFixed(8))) : text;
}

/**
 * The "min,max" of the default stretch of a single band, '' when there is none to give.
 * @param {ValueInfo|null|undefined} info
 */
export function defaultRescale(info) {
    if (!info) return '';
    /** @type {{ min?: number, max?: number }|null} */
    let limits = null;
    if (Array.isArray(info.stretch)) {
        // One band, or an index; several bands have no single pair (the tiles stretch each of them)
        limits = info.stretch.length === 1 ? info.stretch[0] : null;
    } else if (typeof info.valueMin === 'number' && typeof info.valueMax === 'number') {
        // A value info without a stretch (a Registry older than the ddb that gives it): the range of the values
        limits = { min: info.valueMin, max: info.valueMax };
    }
    if (!limits || !Number.isFinite(limits.min) || !Number.isFinite(limits.max)) return '';
    return `${limitText(/** @type {number} */ (limits.min))},${limitText(/** @type {number} */ (limits.max))}`;
}

/**
 * The default style of the raster that the value info describes.
 * @param {ValueInfo|null|undefined} info
 * @param {{ index?: boolean }} [options]  index: the raster is shown as a vegetation index
 * @returns {DefaultVizParams}
 */
export function defaultVizParams(info, { index = false } = {}) {
    const thermal = !!(info && info.isThermal);
    // The unit of a thermal raster: its band's; none for the raw counts of a sensor, which are no temperatures
    const bandUnit = thermalBandUnit(info);
    /** @type {DefaultVizParams} */
    const params = {
        colormap: thermal ? THERMAL_COLORMAP : (index ? INDEX_COLORMAP : GENERIC_COLORMAP),
        rescale: defaultRescale(info),
        unit: thermal ? bandUnit : rasterValueUnit(info)
    };
    // Only a thermal raster whose unit is known has a unit to convert to; a formula on another raster would change its values
    if (bandUnit) params.formula = thermalFormulaOfUnit(bandUnit);
    return params;
}

/**
 * Whether a raster of one band of data (the entry says so: isRasterAnalysisCapable) gets a colour ramp when the map loads
 * it: a thermal one, or one of values; a Byte image keeps its own colours.
 * @param {ValueInfo|null|undefined} info
 */
export function hasDefaultRamp(info) {
    if (!info) return false;
    return !!info.isThermal || info.dataType !== 'Byte';
}

/**
 * The style a layer is seeded with: the default without the panel's Unit field, which is no part of the tiles.
 * @param {DefaultVizParams} defaults
 * @returns {{ formula?: string, colormap: string, rescale?: string }}
 */
export function layerStyleOf({ formula, colormap, rescale }) {
    return { ...(formula ? { formula } : {}), colormap, ...(rescale ? { rescale } : {}) };
}

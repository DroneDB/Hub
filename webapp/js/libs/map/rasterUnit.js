// @ts-check
/**
 * The unit the values of a single-band raster are shown in (Raster Analysis: range, area
 * statistics, profile, inspected value).
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

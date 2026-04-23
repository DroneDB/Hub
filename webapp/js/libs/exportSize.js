/**
 * Utilities for estimating GeoTIFF raster export output size and enforcing
 * the server-configured MaxExportSizeBytes limit on the client side.
 *
 * The estimation matches the server-side ObjectsManager.EstimateRasterOutputBytes:
 * a conservative upper bound based on raw uncompressed input data size.
 *
 *     estimatedBytes = width × height × bytesPerPixel × bandCount
 */

/**
 * Lookup table for bytes-per-pixel per GDAL data type name.
 * Mirrors the server-side BytesPerPixel switch.
 */
const BYTES_PER_PIXEL = Object.freeze({
    Byte: 1,
    UInt8: 1,
    Int8: 1,
    UInt16: 2,
    Int16: 2,
    UInt32: 4,
    Int32: 4,
    Float32: 4,
    Float64: 8,
    UInt64: 8,
    Int64: 8
});

/**
 * Conservative default for unknown / missing data types.
 */
const DEFAULT_BYTES_PER_PIXEL = 4;

/**
 * Returns the number of bytes per pixel for a given GDAL data type name.
 * @param {string|null|undefined} dataType
 * @returns {number}
 */
export function bytesPerPixel(dataType) {
    return BYTES_PER_PIXEL[dataType] ?? DEFAULT_BYTES_PER_PIXEL;
}

/**
 * Estimates the GeoTIFF export output size (in bytes) for a raster.
 * Accepts a raster info object as returned by the server (rasterInfo or thermalInfo).
 *
 * Missing bandCount defaults to 1 (typical for thermal rasters).
 * Missing dataType defaults to Float32 (4 bytes/pixel) — conservative.
 *
 * @param {Object} info - Raster info object ({width, height, bandCount, dataType}).
 * @returns {number} Estimated output size in bytes, or 0 when input is invalid.
 */
export function estimateExportSize(info) {
    if (!info) return 0;
    const width = Number(info.width) || 0;
    const height = Number(info.height) || 0;
    const bandCount = Number(info.bandCount) || 1;
    if (width <= 0 || height <= 0 || bandCount <= 0) return 0;
    return width * height * bandCount * bytesPerPixel(info.dataType);
}

/**
 * Returns true if the estimated export output exceeds the given limit.
 * A null/undefined/<=0 limit means "no limit" and always returns false.
 *
 * @param {Object} info - Raster info object.
 * @param {number|null|undefined} maxBytes - Configured MaxExportSizeBytes (null = unlimited).
 * @returns {boolean}
 */
export function isExportTooLarge(info, maxBytes) {
    if (!maxBytes || maxBytes <= 0) return false;
    const estimated = estimateExportSize(info);
    return estimated > 0 && estimated > maxBytes;
}

/**
 * Human-readable byte size formatter (binary units, matches server-side FormatBytes).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
    return `${rounded} ${units[unit]}`;
}

// @ts-check
/**
 * The export of a styled raster (FR-RAS-16, FR-RAS-26, FR-PRC-15, D-023): the words, the window and the refusal that the one
 * export control of Raster Analysis and Plant Health (features/viewers/map/RasterExportButton) shares. The Registry
 * counts the size of an export (the value info says it, D-023): nothing here computes one.
 */
import { transformExtent } from 'ol/proj';
import { pathutils } from 'ddb';
import { formatBytes } from '@/libs/format';

/** What the export gives (FR-RAS-26): a picture of the style, in the CRS of the file, not its values. */
export const EXPORT_LABEL = 'Export styled image (RGBA GeoTIFF, in the CRS of the file)';

/** The second export: what the map shows now, at the resolution of the raster (D-023). */
export const EXPORT_EXTENT_LABEL = 'Export visible extent';

/** Why 'Export visible extent' is disabled on a server whose libddb exports no window (FR-XC-22; the submit refuses it). */
export const EXPORT_WINDOW_UNSUPPORTED = 'Needs a newer server (libddb 2.3)';

/** Why 'Export visible extent' waits while the estimate of the new extent is read (FR-XC-22). */
export const EXPORT_CHECKING_SIZE = 'Checking size…';

/** The words of the phases the raster-export task reports, as HeavyTaskStatus shows them ("Exporting 42%"). */
export const EXPORT_PHASES = Object.freeze({ loading: 'Exporting', rendering: 'Exporting', converting: 'Exporting', done: 'Exporting' });

/**
 * Why an export is refused for its size (FR-XC-22), or '' when it is not: the estimate and the limit of the Registry, with
 * the sizes of the one formatter (FR-XC-08).
 * @param {number | null | undefined} bytes  the estimate
 * @param {number | null | undefined} limit  the limit (none: null, 0 or less)
 * @param {{ extent?: boolean }} [options]  extent: the estimate is that of the visible extent
 * @returns {string}  'Too large to export: about 9.3 GB > 1 GB limit'
 */
export function exportRefusal(bytes, limit, { extent = false } = {}) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || typeof limit !== 'number' || !(limit > 0)) return '';
    if (bytes <= limit) return '';
    return `Too large to export${extent ? ' the visible extent' : ''}: about ${formatBytes(bytes)} > ${formatBytes(limit)} limit`;
}

/**
 * The visible extent of the map as the WGS 84 window of the export task and of the value info (§7.1).
 * @param {number[] | null | undefined} extent  [minX, minY, maxX, maxY] in Web Mercator (the map's view)
 * @returns {number[] | null}  [minLon, minLat, maxLon, maxLat] in degrees, or null for an extent that is no place
 */
export function visibleBbox(extent) {
    if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
    const clamp = (/** @type {number} */ v, /** @type {number} */ limit) => Math.max(-limit, Math.min(limit, v));
    const box = [clamp(minLon, 180), clamp(minLat, 90), clamp(maxLon, 180), clamp(maxLat, 90)].map(v => Math.round(v * 1e6) / 1e6);
    return box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3] ? box : null;
}

/**
 * The name of the downloaded file.
 * @param {string} path  the raster
 * @param {boolean} [extent]  the visible extent only
 */
export function exportFileName(path, extent = false) {
    return `${pathutils.stem(path) || 'export'}${extent ? '_extent' : ''}_export.tif`;
}

/**
 * The parameters of the raster-export task: the style of the layer (the kind of stretch is the panel's own and goes no
 * further), the window of the visible extent when there is one, and the name of the file.
 * @param {Record<string, any>} vizParams
 * @param {{ bbox?: number[] | null, fileName?: string }} [options]
 */
export function exportTaskParams(vizParams, { bbox = null, fileName = '' } = {}) {
    /** @type {Record<string, any>} */
    const params = { ...vizParams };
    delete params.stretch;
    if (bbox) params.bbox = bbox;
    if (fileName) params.fileName = fileName;
    return params;
}

/**
 * The words of a refused submit (a 400 ProblemDetails): an export over the limit says it as the control does, with the
 * estimate and the limit the Registry sent; any other refusal gives its own reason, at its member when it has one.
 * @param {any} e  the error of the request
 * @param {{ extent?: boolean }} [options]
 */
export function exportSubmitMessage(e, { extent = false } = {}) {
    const refusal = exportRefusal(e?.estimatedExportBytes, e?.exportLimitBytes, { extent });
    if (refusal) return refusal;
    return e?.errors?.bbox?.[0] || e?.message || String(e);
}

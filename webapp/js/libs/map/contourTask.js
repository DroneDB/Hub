// @ts-check
/**
 * The contour lines of a raster run as the heavy task `raster-contours` (FR-RAS-11, NFR-001): the task gives the progress and
 * the Cancel (HeavyTaskStatus, FR-XC-15), its artifact is the GeoJSON of the lines. What the Hub decides about a request
 * lives here: the task's parameters, the estimate of its levels (a long run is confirmed first) and what to say about a
 * result that was cut at the cap of the server.
 */
import { formatNumber } from '@/libs/format';
import { nodataNumber } from '@/libs/ddb/dataset';

/** The id of the Registry's tool */
export const CONTOUR_TOOL_ID = 'raster-contours';

/** More levels than this ask for a confirmation before the run (FR-RAS-11) */
export const CONTOUR_LEVEL_WARNING = 50;

/**
 * @typedef {object} ContourOptions  the payload of ContourOptionsDialog
 * @property {number|null} [interval]
 * @property {number|null} [count]
 * @property {number} [baseOffset]
 * @property {number|null} [minElev]
 * @property {number|null} [maxElev]
 * @property {number} [simplifyTolerance]
 * @property {number} [bandIndex]
 */

/**
 * The parameters of the task, as the Registry's tool takes them: the options of the dialog, plus the options of the values of
 * the layer when it has them (its NoData value, and its thermal formula, which gives the levels in its unit).
 * @param {ContourOptions} options
 * @param {{ nodata?: number|string|null, formula?: string|null }} [valueOptions]
 * @returns {Record<string, any>}
 */
export function contourTaskParams(options, valueOptions = {}) {
    /** @type {Record<string, any>} */
    const params = {
        interval: options.interval ?? null,
        count: options.count ?? null,
        baseOffset: options.baseOffset ?? 0,
        minElev: options.minElev ?? null,
        maxElev: options.maxElev ?? null,
        simplifyTolerance: options.simplifyTolerance ?? 0,
        bandIndex: options.bandIndex ?? 1
    };
    const nodata = nodataNumber(valueOptions && valueOptions.nodata);
    if (nodata !== null) params.nodata = nodata;
    if (valueOptions && valueOptions.formula) params.formula = valueOptions.formula;
    return params;
}

/**
 * How many levels a request draws: the number asked for, or the range to draw (the range of the raster, narrowed by the
 * elevation limits) over the interval, rounded up. null when it cannot be told (no interval and no count, or no range).
 * @param {{ interval?: number|null, count?: number|null, minElev?: number|null, maxElev?: number|null }} request
 * @param {{ min?: number|null, max?: number|null }} [range]  the range of the raster's values
 * @returns {number|null}
 */
export function estimateContourLevels(request, range = {}) {
    const interval = Number(request.interval);
    if (!(interval > 0)) {
        const count = Number(request.count);
        return count > 0 ? Math.floor(count) : null;
    }
    const low = finite(request.minElev) ? Math.max(Number(request.minElev), finite(range.min) ? Number(range.min) : -Infinity) : range.min;
    const high = finite(request.maxElev) ? Math.min(Number(request.maxElev), finite(range.max) ? Number(range.max) : Infinity) : range.max;
    if (!finite(low) || !finite(high) || !(Number(high) > Number(low))) return null;
    return Math.ceil((Number(high) - Number(low)) / interval);
}

/** @param {unknown} value @returns {boolean} */
function finite(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

/**
 * The warning before a long run, or '' when the run is short or cannot be estimated. A fixed interval gives the range over
 * the interval; a target count is the number of levels asked for.
 * @param {number|null} levels  estimateContourLevels
 * @param {'interval'|'count'} [mode]  how the dialog spaces the levels
 * @param {string} [noun]  what the values of the raster are called: 'value' on a raster that is not an elevation model (FR-RAS-25)
 * @returns {string}
 */
export function contourLevelsWarning(levels, mode = 'interval', noun = 'elevation') {
    if (levels === null || levels <= CONTOUR_LEVEL_WARNING) return '';
    const shown = formatNumber(levels, 0);
    if (mode === 'count') {
        return `About ${shown} contour levels. A large raster can take several minutes, and the result is limited in size. Use fewer levels, or limit the ${noun} range, to make it faster.`;
    }
    return `About ${shown} contour levels (the range divided by the interval). A large raster can take several minutes, and the result is limited in size. Use a larger interval, or limit the ${noun} range, to make it faster.`;
}

/**
 * What a result says about being cut at the cap of the server: `truncated` and `featureCap` of ddb. Empty when the result
 * is complete.
 * @param {{ truncated?: boolean, featureCap?: number }|null|undefined} result
 * @param {string} [noun]  what the values of the raster are called: 'value' on a raster that is not an elevation model (FR-RAS-25)
 * @returns {{ truncated: boolean, title: string, message: string }}
 */
export function contourTruncation(result, noun = 'elevation') {
    if (!result || result.truncated !== true) return { truncated: false, title: '', message: '' };
    const cap = typeof result.featureCap === 'number' ? formatNumber(result.featureCap, 0) : '';
    return {
        truncated: true,
        title: 'Contours truncated',
        message: `The contour lines are truncated at ${cap ? `${cap} lines` : 'the most lines the server returns'}: the rest of the raster has none. Use a larger interval, or limit the ${noun} range, and generate again.`
    };
}

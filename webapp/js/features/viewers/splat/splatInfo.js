// @ts-check
/**
 * What the info popover of the splat viewer says about a splat, derived from what the viewer
 * already holds: the entry's properties (libddb writes `splatCount` and `shDegree` at index time,
 * and `georeferenced` / `georef` for a splat that carries a local frame), `bounds.json` (the
 * extent, and the up the build estimated with its confidence and source), the scale the
 * measurements use, and Spark's pager for the level-of-detail streaming. Every function is pure;
 * a field that is missing or not of its type is "unknown" and never an error.
 */
import { measureFormatters } from '@/features/viewers/unified/sceneUtils';
import { UP_AXES, ESTIMATE_LABELS } from './upAxis';
import { isVec3 } from './measureMath';

const UNKNOWN = 'Unknown';
/** An estimated up within this angle of a world axis is named by the axis (cos 8 degrees). */
const AXIS_COS = 0.99;

/** @param {unknown} v @returns {v is number} */
const isCount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** The number with thousands separators (1,234,567), or "Unknown". @param {unknown} count */
export function formatSplatCount(count) {
    return isCount(count) ? Math.round(count).toLocaleString('en-US') : UNKNOWN;
}

const SH_NAMES = ['0 (flat colour)', '1', '2', '3 (full)'];

/** The spherical-harmonics degree of the colour, or "Unknown". @param {unknown} degree */
export function formatShDegree(degree) {
    return typeof degree === 'number' && Number.isInteger(degree) && degree >= 0 && degree < SH_NAMES.length ? SH_NAMES[degree] : UNKNOWN;
}

/**
 * The extent of the scene (bounds.json min and max) as "x × y × z" in the unit of the scale, or
 * "Unknown". The sides are those of the file, which is the frame metres are given in for a
 * georeferenced splat.
 * @param {any} bounds
 * @param {{ metersPerUnit: number, unit: string }} scale
 */
export function formatExtent(bounds, scale) {
    if (!bounds || !isVec3(bounds.min) || !isVec3(bounds.max)) return UNKNOWN;
    const { length } = measureFormatters(() => scale.metersPerUnit, () => scale.unit);
    return [0, 1, 2].map(i => length({ length: Math.abs(bounds.max[i] - bounds.min[i]) })).join(' × ');
}

/**
 * Whether the splat has a local frame, and which. A georeferenced splat reads in metres.
 * @param {any} properties  entry.properties
 */
export function formatGeoreference(properties) {
    if (properties?.georeferenced !== true) return 'No';
    const georef = properties.georef;
    if (georef?.kind === 'enu') return 'Yes (local east-north-up frame, metres)';
    if (georef?.kind === 'projected' && typeof georef.crs === 'string' && georef.crs) {
        return `Yes (${georef.crs.length > 40 ? 'projected coordinates' : georef.crs}, metres)`;
    }
    return 'Yes (metres)';
}

/**
 * The up the build estimated, as "+Z, 85% sure (ground plane)", or "Not estimated". A direction
 * close to a world axis is named by it, any other is given as a vector of the file.
 * @param {any} bounds
 */
export function formatEstimatedUp(bounds) {
    const up = bounds?.up;
    if (!isVec3(up)) return 'Not estimated';
    const length = Math.hypot(up[0], up[1], up[2]);
    if (!(length > 1e-9)) return 'Not estimated';
    const unit = up.map(v => v / length);
    const axis = UP_AXES.find(a => a.up[0] * unit[0] + a.up[1] * unit[1] + a.up[2] * unit[2] >= AXIS_COS);
    const direction = axis ? axis.id.toUpperCase() : `(${unit.map(v => v.toFixed(2)).join(', ')})`;
    const confidence = typeof bounds.upConfidence === 'number' && Number.isFinite(bounds.upConfidence)
        ? `${Math.round(Math.min(1, Math.max(0, bounds.upConfidence)) * 100)}% sure` : 'confidence unknown';
    const source = Object.hasOwn(ESTIMATE_LABELS, bounds.upSource) ? ` (${ESTIMATE_LABELS[bounds.upSource]})` : '';
    return `${direction}, ${confidence}${source}`;
}

/** @param {unknown} list @returns {any[]} */
const listOf = list => (Array.isArray(list) ? list : []);

/**
 * What the pager of Spark says about the streaming of a paged file: how many chunks the view still
 * waits for, and how many pages of its pool are filled. `null` without a pager.
 *
 * Only the public members of the pager are read. `fetchPriority` is every chunk the view wants, in
 * priority order, including those already in a page, so it is walked the way the pager's own fetch
 * loop walks it: each wanted chunk takes a page, a resident one (`getSplatsChunk`) is not on the
 * way, and one that is not resident is on the way (in flight, fetched and waiting for a page, or
 * waiting for a fetcher) while it fits in the pool (`maxPages`); one that does not fit is never
 * fetched, so it is not counted. Without `getSplatsChunk` which chunks are resident is unknown and
 * none is counted.
 * @param {any} pager  spark.pager
 * @returns {{ pending: number, pages: number, maxPages: number } | null}
 */
export function pagerState(pager) {
    if (!pager) return null;
    const maxPages = isCount(pager.maxPages) ? pager.maxPages : 0;
    let pending = 0;
    if (typeof pager.getSplatsChunk === 'function') {
        const pool = maxPages || Infinity;
        let pages = 0;
        for (const wanted of listOf(pager.fetchPriority)) {
            if (pages >= pool) break;
            if (!pager.getSplatsChunk(wanted?.splats, wanted?.chunk)) pending += 1;
            pages += 1;
        }
    }
    return { pending, pages: listOf(pager.pageToSplatsChunk).filter(Boolean).length, maxPages };
}

/**
 * The level-of-detail state in a sentence. A paged .rad streams the detail of the view; any other
 * file is whole in memory with the level of detail built in the browser.
 * @param {boolean} streaming  the splat is a paged .rad
 * @param {ReturnType<typeof pagerState>} state
 */
export function formatLodState(streaming, state) {
    if (!streaming) return 'Whole file loaded (detail built in the browser)';
    if (!state) return 'Starting';
    if (state.pending > 0) return `Streaming (${state.pending} ${state.pending === 1 ? 'chunk' : 'chunks'} on the way)`;
    return state.maxPages > 0 ? `Up to date for this view (${state.pages} of ${state.maxPages} pages in memory)` : 'Up to date for this view';
}

/**
 * The rows of the popover: [{ id, label, value }].
 * @param {object} source
 * @param {any} source.entry                                   the dataset entry
 * @param {any} source.bounds                                  the parsed bounds.json, or null
 * @param {{ metersPerUnit: number, unit: string }} source.scale  what the scene's lengths are in (measureMath.sceneScale)
 * @param {boolean} source.streaming
 * @param {ReturnType<typeof pagerState>} [source.lod]
 * @param {string} [source.quality]                            the quality in force, e.g. "Auto (medium)"
 */
export function splatInfoRows({ entry, bounds, scale, streaming, lod = null, quality }) {
    const properties = entry?.properties;
    const rows = [
        { id: 'splats', label: 'Splats', value: formatSplatCount(properties?.splatCount) },
        { id: 'sh', label: 'Colour detail (SH)', value: formatShDegree(properties?.shDegree) },
        { id: 'size', label: scale.unit === 'm' ? 'Size' : 'Size (scene units)', value: formatExtent(bounds, scale) },
        { id: 'lod', label: 'Level of detail', value: formatLodState(streaming, lod) },
        { id: 'georef', label: 'Georeferenced', value: formatGeoreference(properties) },
        { id: 'up', label: 'Estimated up', value: formatEstimatedUp(bounds) }
    ];
    if (quality) rows.push({ id: 'quality', label: 'Quality', value: quality });
    return rows;
}

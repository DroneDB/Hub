// @ts-check
/**
 * The image of a chart block of the report model: the elevation profile of a profile item, sampled from the first
 * elevation layer of the cover view (never from another raster) with the request the profile panel makes
 * (dataset.getRasterProfile, with the NoData value of the layer's style), drawn with chart.js on an offscreen canvas.
 * The chart library is loaded when the first chart is drawn.
 *
 * A cover view with no elevation layer has no chart: the result has no image and the model's note.
 */
import { layerValueOptions, rasterValueParts, ELEVATION_UNIT } from '@/libs/map/rasterUnit';
import { profileRange, profileSamples, validProfileSamples } from '@/libs/map/profileSeries';
import { formatLength } from '@/libs/format';
import { PRIMARY } from '@/libs/palette';
import { NO_ELEVATION_LAYER } from '@/libs/reports/reportSections';
import { canvasToBlob, releaseCanvas } from '@/libs/reports/snapshots/canvasImage';
import { throwIfAborted } from '@/libs/reports/snapshots/renderQueue';

export const PROFILE_SIZE = Object.freeze({ width: 1200, height: 480 });
/** The samples asked of the server along the line (it clamps to 2..4096). */
export const PROFILE_SAMPLES = 512;
export const NO_PROFILE_VALUES = 'The elevation layer has no values along this line';

const TEXT = '#111827';
const GRID = '#e5e7eb';

/** The chart's white background (a canvas is transparent, and a transparent image goes black in a JPEG). */
const whiteBackground = {
    id: 'whiteBackground',
    /** @param {any} chart */
    beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
};

/**
 * The chart.js configuration of a profile: distance along the line (in the units of the report) against the value, a
 * gap where a sample has no value.
 * @param {import('@/libs/map/profileSeries').RasterProfile} profile
 * @param {{ unit?: string, lengthUnits?: string }} [options]
 */
export function profileChartConfig(profile, { unit = ELEVATION_UNIT, lengthUnits = 'metric' } = {}) {
    const samples = profileSamples(profile);
    const points = samples.map(s => ({ x: s.distance, y: s.value === undefined ? null : s.value }));
    const range = profileRange(profile);
    // A flat profile has no height to draw: give it some, so the line is not on the frame
    const flat = range.max === range.min;
    const length = profile.totalLength ?? (samples.length ? samples[samples.length - 1].distance : 0);
    return {
        type: /** @type {const} */ ('line'),
        data: { datasets: [{ data: points, borderColor: PRIMARY[600], borderWidth: 3, pointRadius: 0, spanGaps: false, fill: false }] },
        options: {
            animation: /** @type {const} */ (false),
            responsive: false,
            devicePixelRatio: 1,
            events: [],
            layout: { padding: 16 },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: {
                    type: /** @type {const} */ ('linear'), min: 0, max: length || undefined,
                    title: { display: true, text: 'Distance along the line', color: TEXT, font: { size: 16 } },
                    ticks: { color: TEXT, font: { size: 15 }, maxTicksLimit: 8, callback: (/** @type {any} */ v) => formatLength(Number(v), lengthUnits) },
                    grid: { color: GRID }
                },
                y: {
                    type: /** @type {const} */ ('linear'),
                    min: flat ? range.min - 1 : range.min,
                    max: flat ? range.max + 1 : range.max,
                    title: { display: true, text: unit ? `Value (${unit})` : 'Value', color: TEXT, font: { size: 16 } },
                    ticks: { color: TEXT, font: { size: 15 }, callback: (/** @type {any} */ v) => rasterValueParts(Number(v), unit, { placeholder: '' }).text },
                    grid: { color: GRID }
                }
            }
        },
        plugins: [whiteBackground]
    };
}

/** The chart library, loaded once, with the parts a line chart uses. */
async function loadChartLibrary() {
    const { Chart, LineController, LineElement, PointElement, LinearScale } = await import('chart.js');
    Chart.register(LineController, LineElement, PointElement, LinearScale);
    return Chart;
}

/**
 * Renders a chart block. The distances are in the units of the block (the report's: its definition's, else the
 * reader's), so the page, the PDF and the tables of the report agree.
 * @param {any} block  a `chart` block of the report model
 * @param {{ dataset: any, width?: number, height?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ image: Blob | null, width: number, height: number, note: string | null }>}
 */
export async function renderProfileChart(block, { dataset, width = PROFILE_SIZE.width, height = PROFILE_SIZE.height, signal } = /** @type {any} */ ({})) {
    throwIfAborted(signal);
    const size = { width, height };
    const layer = block.elevationLayer;
    if (!layer) return { image: null, ...size, note: block.note || NO_ELEVATION_LAYER };
    const line = Array.isArray(block.line) ? block.line : [];
    if (line.length < 2) return { image: null, ...size, note: NO_PROFILE_VALUES };

    const profile = await dataset.getRasterProfile(layer.path, { type: 'LineString', coordinates: line }, PROFILE_SAMPLES, layerValueOptions(layer.vizParams));
    throwIfAborted(signal);
    if (!validProfileSamples(profile).length) return { image: null, ...size, note: NO_PROFILE_VALUES };

    const Chart = await loadChartLibrary();
    throwIfAborted(signal);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const chart = new Chart(canvas, /** @type {any} */ (profileChartConfig(profile, { unit: profile.unit || ELEVATION_UNIT, lengthUnits: block.units === 'imperial' ? 'imperial' : 'metric' })));
    try {
        return { image: await canvasToBlob(canvas), ...size, note: null };
    } finally {
        chart.destroy();
        releaseCanvas(canvas);
    }
}

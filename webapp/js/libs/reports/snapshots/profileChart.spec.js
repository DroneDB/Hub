/**
 * The profile chart: sampled from the elevation layer of the block (never another raster), with the options of its
 * style; the note and no image when the cover view has no elevation layer or the line has no values; the chart.js
 * configuration with a gap where a sample has no value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const charts = [];
vi.mock('chart.js', () => ({
    Chart: class FakeChart {
        static register = vi.fn();
        constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; charts.push(this); }
        destroy() { this.destroyed = true; }
    },
    LineController: {}, LineElement: {}, PointElement: {}, LinearScale: {}
}));

import { Chart } from 'chart.js';
import { renderProfileChart, profileChartConfig, NO_PROFILE_VALUES, PROFILE_SIZE } from './profileChart';

const profile = (values, extra = {}) => ({ samples: values.map((value, i) => ({ distance: i * 10, value })), min: Math.min(...values.filter(v => v !== null)), max: Math.max(...values.filter(v => v !== null)), totalLength: (values.length - 1) * 10, ...extra });
const block = (extra = {}) => ({
    type: 'chart', chart: 'profile', itemId: 'p', ref: '4', line: [[11, 45], [11.001, 45]],
    elevationLayer: { path: 'dsm.tif', hash: 'h', vizParams: { nodata: -9999, formula: 'NDVI' } },
    note: null, alt: 'Elevation profile of item 4', ...extra
});
const fakeCanvas = () => {
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
        const el = original(tag);
        if (tag === 'canvas') el.toBlob = callback => callback(new Blob(['png']));
        return el;
    });
};

beforeEach(() => {
    charts.length = 0;
    vi.restoreAllMocks();
});

describe('renderProfileChart', () => {
    it('has no image and the note of the model when the cover view has no elevation layer', async () => {
        const dataset = { getRasterProfile: vi.fn() };
        const result = await renderProfileChart(block({ elevationLayer: null, note: 'No elevation layer in the cover view' }), { dataset });
        expect(result).toEqual({ image: null, ...PROFILE_SIZE, note: 'No elevation layer in the cover view' });
        expect(dataset.getRasterProfile).not.toHaveBeenCalled();
        expect(charts).toHaveLength(0);
    });

    it('says the same when the block has no note of its own', async () => {
        const result = await renderProfileChart(block({ elevationLayer: null, note: null }), { dataset: {} });
        expect(result.note).toBe('No elevation layer in the cover view');
    });

    it('samples the elevation layer of the block along the line of the item, with the options of its style', async () => {
        fakeCanvas();
        const dataset = { getRasterProfile: vi.fn(async () => profile([100, 101, 103])) };
        const result = await renderProfileChart(block(), { dataset, units: 'metric' });
        expect(dataset.getRasterProfile).toHaveBeenCalledTimes(1);
        const [path, line, samples, options] = dataset.getRasterProfile.mock.calls[0];
        expect(path).toBe('dsm.tif');
        expect(line).toEqual({ type: 'LineString', coordinates: [[11, 45], [11.001, 45]] });
        expect(samples).toBeGreaterThan(2);
        // The NoData value of the style; a formula that is not a thermal one is no option of a value
        expect(options).toEqual({ nodata: -9999 });
        expect(result.note).toBeNull();
        expect(result.image).toBeInstanceOf(Blob);
        expect(result).toMatchObject(PROFILE_SIZE);
    });

    it('draws it with chart.js on a canvas of the size asked, offscreen, and destroys the chart', async () => {
        fakeCanvas();
        const dataset = { getRasterProfile: async () => profile([1, 2, 3]) };
        await renderProfileChart(block(), { dataset, width: 600, height: 300 });
        expect(Chart.register).toHaveBeenCalled();
        const [chart] = charts;
        expect(chart.canvas.width).toBe(0);
        expect(chart.destroyed).toBe(true);
        expect(chart.config.options.animation).toBe(false);
        expect(chart.config.options.responsive).toBe(false);
    });

    it('has no image and a note when no sample has a value', async () => {
        const dataset = { getRasterProfile: async () => ({ samples: [{ distance: 0, value: null }, { distance: 5, value: null }] }) };
        const result = await renderProfileChart(block(), { dataset });
        expect(result.image).toBeNull();
        expect(result.note).toBe(NO_PROFILE_VALUES);
    });

    it('does not ask for a line with fewer than two positions', async () => {
        const dataset = { getRasterProfile: vi.fn() };
        const result = await renderProfileChart(block({ line: [[11, 45]] }), { dataset });
        expect(result.image).toBeNull();
        expect(dataset.getRasterProfile).not.toHaveBeenCalled();
    });

    it('passes the failure of the request on and does not draw after an abort', async () => {
        await expect(renderProfileChart(block(), { dataset: { getRasterProfile: async () => { throw new Error('No raster'); } } })).rejects.toThrow('No raster');
        const controller = new AbortController();
        const dataset = { getRasterProfile: async () => { controller.abort(); return profile([1, 2]); } };
        await expect(renderProfileChart(block(), { dataset, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(charts).toHaveLength(0);
    });
});

describe('profileChartConfig', () => {
    it('plots the distance against the value, with a gap where a sample has no value', () => {
        const config = profileChartConfig(profile([1, null, 3]));
        expect(config.data.datasets[0].data).toEqual([{ x: 0, y: 1 }, { x: 10, y: null }, { x: 20, y: 3 }]);
        expect(config.data.datasets[0].spanGaps).toBe(false);
        expect(config.options.scales.y).toMatchObject({ min: 1, max: 3 });
        expect(config.options.scales.x).toMatchObject({ min: 0, max: 20 });
    });

    it('writes the ticks in the unit of the value and the units of the user', () => {
        const config = profileChartConfig(profile([1, 2]), { unit: 'm', lengthUnits: 'imperial' });
        expect(config.options.scales.y.ticks.callback(12.5)).toContain('12.5');
        expect(config.options.scales.y.ticks.callback(12.5)).toContain('m');
        expect(config.options.scales.x.ticks.callback(10)).toMatch(/ft/);
        expect(config.options.scales.y.title.text).toBe('Value (m)');
    });

    it('gives a flat profile some height', () => {
        const config = profileChartConfig(profile([5, 5, 5]));
        expect(config.options.scales.y.max).toBeGreaterThan(config.options.scales.y.min);
    });
});

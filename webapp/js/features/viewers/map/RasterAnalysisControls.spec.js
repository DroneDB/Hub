/**
 * The Raster Analysis panel: Area draws a rectangle (the host does) and the panel shows the
 * statistics of its values in the raster's unit, with the pixels without data; the last value
 * read with Inspect is shown with where it was read.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => null } } }));

const { default: RasterAnalysisControls } = await import('./RasterAnalysisControls.vue');

const STATS = {
    min: 196.96, max: 197.71, mean: 197.2133, median: 197.19, stddev: 0.1692,
    pixelCount: 9000, bounds: { x0: 1000, y0: 1000, x1: 1099, y1: 1099 }, unit: '', isThermal: false
};

let wrapper;
async function render(props = {}) {
    const dataset = { getRasterValueInfo: vi.fn(async () => ({ valueMin: 194.7, valueMax: 229.5, isThermal: false, unit: '' })) };
    wrapper = mount(RasterAnalysisControls, {
        props: { visible: true, dataset, filePath: 'odm_dem/dsm.tif', ...props },
        global: { stubs: { RasterProfileChart: true, ColormapDropdown: true } }
    });
    await flushPromises();
    return wrapper;
}
const byId = id => wrapper.find(`[data-testid="${id}"]`);
const statRows = () => byId('raster-area-stats').findAll('dl > div').map(d => `${d.find('dt').text()} ${d.find('dd').text()}`);

afterEach(() => wrapper?.unmount());

describe('RasterAnalysisControls area statistics', () => {
    it('Area asks the host to draw a rectangle, and to stop while it draws', async () => {
        await render();
        const button = byId('raster-area-stats-btn');
        expect(button.text()).toBe('Area');
        await button.trigger('click');
        expect(wrapper.emitted('toggleAreaStats')).toHaveLength(1);

        await wrapper.setProps({ drawingArea: true });
        expect(button.text()).toBe('Stop');
        expect(button.classes()).toContain('is-active');
    });

    it('shows min, max, mean, median and spread in the unit, then the pixels and those without data', async () => {
        await render({ areaStats: STATS });
        expect(statRows()).toEqual([
            'Min: 196.96 m', 'Max: 197.71 m', 'Mean: 197.21 m', 'Median: 197.19 m', 'Std dev: 0.17 m',
            `Pixels: ${(9000).toLocaleString()}`, `No data: ${(1000).toLocaleString()}`
        ]);
    });

    it('has no no-data row when every pixel has a value', async () => {
        await render({ areaStats: { ...STATS, pixelCount: 10000 } });
        expect(statRows().some(r => r.startsWith('No data'))).toBe(false);
    });

    it('shows the spread of a thermal area without the Kelvin offset', async () => {
        await render();
        wrapper.vm.rasterInfo = { valueMin: 20, valueMax: 40, isThermal: true, calibration: {} };
        wrapper.vm.selectedFormula = 'KELVIN';
        await wrapper.setProps({ areaStats: { ...STATS, min: 20, stddev: 1.25, isThermal: true } });
        expect(statRows()).toContain('Min: 293.1K');
        expect(statRows()).toContain('Std dev: 1.3K');
    });

    it('shows the computation, then an error, and Clear asks the host to remove them', async () => {
        await render({ areaStatsLoading: true });
        expect(byId('raster-area-stats').text()).toContain('Computing statistics');
        expect(byId('raster-area-stats-clear').exists()).toBe(false);
        expect(byId('raster-area-stats-btn').attributes('disabled')).toBeDefined();

        await wrapper.setProps({ areaStatsLoading: false, areaStatsError: 'The rectangle is outside the raster.' });
        expect(byId('raster-area-stats').text()).toContain('The rectangle is outside the raster.');
        const clear = byId('raster-area-stats-clear');
        expect(clear.attributes('aria-label')).toBe('Clear the statistics and remove the rectangle from the map');
        await clear.trigger('click');
        expect(wrapper.emitted('clearAreaStats')).toHaveLength(1);
    });

    it('has no statistics section before a rectangle is drawn', async () => {
        await render();
        expect(byId('raster-area-stats').exists()).toBe(false);
    });
});

describe('RasterAnalysisControls spot value', () => {
    it('shows where a georeferenced value was read as latitude, longitude', async () => {
        await render({ spotInfo: { value: 197.111, x: 1280, y: 1280, hasGeo: true, geoX: 21.43055029, geoY: 50.98112738 } });
        expect(byId('raster-spot-value').text()).toContain('197.11 m');
        expect(byId('raster-spot-value').text()).toContain('50.981127, 21.430550');
    });

    it('shows the pixel of a value without georeference', async () => {
        await render({ spotInfo: { value: 3, x: 4, y: 5, hasGeo: false } });
        expect(byId('raster-spot-value').text()).toContain('pixel 4, 5');
    });
});

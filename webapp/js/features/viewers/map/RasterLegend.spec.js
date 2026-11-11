/**
 * The legend on the map (FR-RAS-27): the colour bar and the labels of a styled layer, from the vizParams of the layers.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RasterLegend from './RasterLegend.vue';

const THERMAL_ROWS = [{ path: 'thermal.tif', name: 'thermal.tif', visible: true }];
const IRONBOW_STYLE = { 'thermal.tif': { formula: 'CELSIUS', colormap: 'ironbow', rescale: '10,40' } };

describe('RasterLegend', () => {
    it('shows the gradient of ironbow and its ends, 10.0 °C and 40.0 °C', () => {
        const wrapper = mount(RasterLegend, { props: { rows: THERMAL_ROWS, styles: IRONBOW_STYLE } });
        const bar = wrapper.get('[data-testid="raster-legend-bar"]');
        // The bar is the gradient of the colormap: every stop is in its style
        const style = bar.attributes('style');
        for (const color of ['#000000', '#570f6a', '#bd3754', '#f97808', '#ffe344', '#ffffff']) {
            expect(style.toLowerCase().replace(/rgb\((\d+), (\d+), (\d+)\)/g, (_, r, g, b) => '#' + [r, g, b].map(v => Number(v).toString(16).padStart(2, '0')).join('')))
                .toContain(color);
        }
        expect(wrapper.get('[data-testid="raster-legend-min"]').text()).toBe('10.0 °C');
        expect(wrapper.get('[data-testid="raster-legend-max"]').text()).toBe('40.0 °C');
        expect(wrapper.get('figure').attributes('aria-label')).toBe('thermal.tif: Ironbow colours from 10.0 °C to 40.0 °C');
    });

    it('shows nothing for a layer that has no style, or whose layer is hidden', () => {
        expect(mount(RasterLegend, { props: { rows: THERMAL_ROWS, styles: {} } }).find('[data-testid="raster-legend"]').exists()).toBe(false);
        const hidden = [{ ...THERMAL_ROWS[0], visible: false }];
        expect(mount(RasterLegend, { props: { rows: hidden, styles: IRONBOW_STYLE } }).find('[data-testid="raster-legend"]').exists()).toBe(false);
    });

    it('follows the style of the layer: another range gives other labels', async () => {
        const wrapper = mount(RasterLegend, { props: { rows: THERMAL_ROWS, styles: IRONBOW_STYLE } });
        await wrapper.setProps({ styles: { 'thermal.tif': { formula: 'KELVIN', colormap: 'ironbow', rescale: '283,313' } } });
        expect(wrapper.get('[data-testid="raster-legend-min"]').text()).toBe('283.0 K');
        expect(wrapper.get('[data-testid="raster-legend-max"]').text()).toBe('313.0 K');
    });

    it('reads the unit of a layer without a thermal formula from its value info, once', async () => {
        const dataset = { getRasterValueInfo: vi.fn(async () => ({ bandCount: 1, dataType: 'Float32', unit: '' })) };
        const rows = [{ path: 'dsm.tif', name: 'dsm.tif' }];
        const wrapper = mount(RasterLegend, { props: { rows, styles: { 'dsm.tif': { colormap: 'viridis', rescale: '-6.3,216' } }, dataset } });
        await flushPromises();
        expect(wrapper.get('[data-testid="raster-legend-min"]').text()).toBe('-6.30 m');
        expect(wrapper.get('[data-testid="raster-legend-max"]').text()).toBe('216.00 m');
        await wrapper.setProps({ styles: { 'dsm.tif': { colormap: 'viridis', rescale: '0,100' } } });
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenCalledTimes(1);
        expect(wrapper.get('[data-testid="raster-legend-max"]').text()).toBe('100.00 m');
    });

    it('takes the unit the map knows and reads none from the server', async () => {
        const dataset = { getRasterValueInfo: vi.fn() };
        const rows = [{ path: 'dsm.tif', name: 'dsm.tif' }];
        const wrapper = mount(RasterLegend, { props: { rows, styles: { 'dsm.tif': { colormap: 'viridis', rescale: '0,100' } }, units: { 'dsm.tif': 'm' }, dataset } });
        await flushPromises();
        expect(wrapper.get('[data-testid="raster-legend-max"]').text()).toBe('100.00 m');
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
    });

    it('names the layers when there are several legends', () => {
        const rows = [{ path: 'a.tif', name: 'a.tif' }, { path: 'b.tif', name: 'b.tif' }];
        const styles = { 'a.tif': { colormap: 'viridis', rescale: '0,1' }, 'b.tif': { colormap: 'rdylgn', rescale: '-1,1' } };
        const wrapper = mount(RasterLegend, { props: { rows, styles } });
        expect(wrapper.findAll('.legend-name').map(n => n.text())).toEqual(['a.tif', 'b.tif']);
    });
});

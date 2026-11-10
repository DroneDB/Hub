/**
 * Plant Health with outlier index values: the histogram is shown on the range the index can have
 * near the bulk of the data, its handles apart on the 2%-98% range, and a note says why; an index
 * without outliers keeps the server's histogram.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => null } } }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
const copyText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
// The clipboard: copyLinkWithNotice (useCopyText) copies through it
vi.mock('clipboard-copy', () => ({ default: copyText }));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const { default: PlantHealthPanel } = await import('./PlantHealthPanel.vue');
const { default: HistogramChart } = await import('./HistogramChart.vue');

// `bins` equal bins from `min` to `max`, the counts given by `count(binCenter)`
function histogram(min, max, bins, count) {
    const width = (max - min) / bins;
    const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
    const counts = Array.from({ length: bins }, (_, i) => count(min + (i + 0.5) * width));
    return { counts, edges, bins };
}

const ALGORITHMS = [{ id: 'NDVI', name: 'NDVI', range: [-1, 1] }, { id: 'EXG', name: 'ExG' }];

// The NDVI of the micasense orthophoto: a few pixels without signal give -191.7 and 278.5
const OUTLIER_STATS = {
    1: {
        min: -191.73, max: 278.52, mean: 0.77, std: 1.05, percentiles: { p2: 0.3706, p98: 0.9467 },
        histogram: histogram(-191.73, 278.52, 255, v => (Math.abs(v) < 2 ? 70000 : 0))
    }
};
const CLEAN_STATS = {
    1: {
        min: -0.2, max: 0.9, mean: 0.5, std: 0.1, percentiles: { p2: 0.1, p98: 0.85 },
        histogram: histogram(-0.2, 0.9, 255, () => 10)
    }
};

// The default stretch of the index, as ddb gives it in the value info read with the formula (D-041): its 2nd to 98th
// percentile, inside the range of the formula
const STRETCH = { OUTLIER: [{ min: 0.3706, max: 0.9467 }], CLEAN: [{ min: 0.1, max: 0.85 }] };

let wrapper;
let dataset;
async function renderWith(formulaStats, { stretch = formulaStats === OUTLIER_STATS ? STRETCH.OUTLIER : STRETCH.CLEAN, initialParams = null, pick = 'NDVI' } = {}) {
    dataset = {
        getRasterInfo: vi.fn(async () => ({ bands: [{}, {}, {}, {}, {}] })),
        getRasterMetadata: vi.fn(async (path, formula) => ({
            algorithms: ALGORITHMS,
            statistics: formula ? formulaStats : { 1: { min: 0, max: 1, mean: 0.5, std: 0.1 } }
        })),
        getRasterValueInfo: vi.fn(async (path, options = {}) => (options.formula
            ? { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', stretch }
            : { bandCount: 5, dataType: 'UInt16', isThermal: false, unit: '' }))
    };
    wrapper = mount(PlantHealthPanel, {
        props: { visible: true, dataset, filePath: 'odm_orthophoto/odm_orthophoto.tif', initialParams },
        global: { stubs: { PlantHealthFormulasDialog: true, ColormapDropdown: true, BandSelector: true, Chart: true }, mocks: { $notify: notify } }
    });
    await flushPromises();
    if (pick) {
        await wrapper.find('#plant-health-panel-formula').setValue(pick);
        await flushPromises();
    }
    return wrapper;
}
const chart = () => wrapper.findComponent(HistogramChart);
const note = () => wrapper.find('[data-testid="plant-health-histogram-note"]');
const handlePositions = () => chart().findAll('[role="slider"]').map(h => parseFloat(h.attributes('style').match(/left:\s*([-\d.]+)%/)[1]));

afterEach(() => wrapper?.unmount());

describe('PlantHealthPanel histogram with outliers', () => {
    it('stretches to the 2%-98% range of ddb and keeps the handles apart on the index range', async () => {
        await renderWith(OUTLIER_STATS);
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.3706');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.9467');
        const { edges, counts } = chart().props('data');
        expect(counts).toEqual([]);
        expect(edges[0]).toBeCloseTo(0.3706 - (0.9467 - 0.3706));
        expect(edges[1]).toBe(1);
        const [min, max] = handlePositions();
        expect(max - min).toBeGreaterThan(40);
        expect(note().text()).toContain('Outliers: the values go from -191.730 to 278.520');
        expect(note().text()).toContain('cannot be drawn');
    });

    it('keeps the histogram of an index without outliers, without a note', async () => {
        await renderWith(CLEAN_STATS);
        expect(chart().props('data')).toEqual({ counts: CLEAN_STATS[1].histogram.counts, edges: CLEAN_STATS[1].histogram.edges });
        expect(note().exists()).toBe(false);
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.1');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.85');
    });
});

describe('PlantHealthPanel Copy Link', () => {
    it('writes the settings in the hash keeping the address and the history state of the router', async () => {
        // The router keeps the address it is at in the history state; without it, its next
        // navigation writes the address of its last one back over this entry
        const url = '/r/o/d/view/abc/map?layer=a';
        window.history.replaceState({ back: '/before', current: url, position: 2 }, '', url);
        await renderWith(CLEAN_STATS);
        await wrapper.find('button[title="Copy a shareable link with the current settings"]').trigger('click');
        const address = window.location.pathname + window.location.search + window.location.hash;
        expect(address).toMatch(/^\/r\/o\/d\/view\/abc\/map\?layer=a#path=odm_orthophoto%2Fodm_orthophoto\.tif&formula=NDVI/);
        expect(window.history.state).toEqual({ back: '/before', position: 2, current: address });
        expect(copyText).toHaveBeenCalledWith(window.location.href);
    });

    // FR-RAS-05: the copy is confirmed, and a failed one says so
    it('says that the link was copied, and when it could not be', async () => {
        notify.success.mockClear();
        notify.error.mockClear();
        await renderWith(CLEAN_STATS);
        const copy = () => wrapper.find('button[title="Copy a shareable link with the current settings"]').trigger('click');
        await copy();
        await flushPromises();
        expect(notify.success).toHaveBeenCalledWith('Link copied to the clipboard', { summary: 'Plant Health' });

        copyText.mockRejectedValueOnce(new Error('denied'));
        await copy();
        await flushPromises();
        expect(notify.error).toHaveBeenCalledWith('The link could not be copied', { summary: 'Plant Health' });
    });

    it('writes the formula, the colormap, the rescale and the stretch that the layer is given', async () => {
        await renderWith(CLEAN_STATS);
        await wrapper.find('button[title="Copy a shareable link with the current settings"]').trigger('click');
        const params = new URLSearchParams(window.location.hash.slice(1));
        expect(Object.fromEntries(params)).toEqual({
            path: 'odm_orthophoto/odm_orthophoto.tif', formula: 'NDVI', colormap: 'rdylgn', rescale: '0.1,0.85', stretch: 'percentile'
        });
        // The layer is styled with the same
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({
            formula: 'NDVI', colormap: 'rdylgn', rescale: '0.1,0.85', stretch: 'percentile'
        });
    });
});

// D-041: the default stretch of an index is ddb's, from the value info read with the formula; the Hub computes none
describe('PlantHealthPanel default stretch', () => {
    it('takes the stretch of the value info read with the formula, not one of its own', async () => {
        // Percentiles in the statistics that differ from the stretch of ddb: the Hub must not use them
        await renderWith(CLEAN_STATS, { stretch: [{ min: 0.21, max: 0.78 }] });
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('odm_orthophoto/odm_orthophoto.tif', { formula: 'NDVI' });
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.21');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.78');
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({
            formula: 'NDVI', colormap: 'rdylgn', rescale: '0.21,0.78', stretch: 'percentile'
        });
    });

    it('takes the range of the index values when the value info has no stretch', async () => {
        await renderWith(CLEAN_STATS, { stretch: null });
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('-0.200');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.900');
    });

    it('keeps the range of a link over the default, and reads the index of the link', async () => {
        await renderWith(CLEAN_STATS, {
            pick: null, initialParams: { formula: 'NDVI', colormap: 'rdylgn', rescale: '-0.272,0.644', stretch: 'percentile' }
        });
        expect(dataset.getRasterMetadata).toHaveBeenCalledWith('odm_orthophoto/odm_orthophoto.tif', 'NDVI');
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('-0.272');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.644');
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({
            formula: 'NDVI', colormap: 'rdylgn', rescale: '-0.272,0.644', stretch: 'percentile'
        });
    });

    it('gives a link without a range the default stretch of its index', async () => {
        await renderWith(CLEAN_STATS, { pick: null, initialParams: { formula: 'NDVI', colormap: 'rdylgn', stretch: 'percentile' } });
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({
            formula: 'NDVI', colormap: 'rdylgn', rescale: '0.1,0.85', stretch: 'percentile'
        });
    });

    // FR-RAS-05: the Copy Link of earlier releases wrote the rescale and the stretch without a formula
    it('opens an old link with a rescale and no formula: the bands, without a stretch or a request for one', async () => {
        await renderWith(CLEAN_STATS, { pick: null, initialParams: { bands: '4,2,1', rescale: '0.1,0.9', stretch: 'percentile' } });
        expect(wrapper.find('#plant-health-panel-formula').element.value).toBe('');
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
        // Without a formula the panel styles with the bands; a rescale and a stretch are those of an index
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({ bands: '4,2,1' });
    });
});

describe('HistogramChart handles', () => {
    it('put a range outside the histogram on its edges', () => {
        const w = mount(HistogramChart, {
            props: { data: { counts: [1, 2], edges: [0, 5, 10] }, min: -5, max: 20 },
            global: { stubs: { Chart: true } }
        });
        const left = w.findAll('[role="slider"]').map(h => h.attributes('style'));
        expect(left).toEqual(['left: 0%;', 'left: 100%;']);
        w.unmount();
    });
});

// FR-RAS-20: the Rescale of the layer is two number fields; a range that is not valid marks its field and the last valid one is kept
describe('PlantHealthPanel rescale fields', () => {
    const min = () => wrapper.find('#plant-health-panel-rescale-min');
    const max = () => wrapper.find('#plant-health-panel-rescale-max');
    const changes = () => (wrapper.emitted('vizParamsChanged') || []).length;
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 400)); await flushPromises(); };

    // The fields are typed in the order that never makes a valid range on the way (a valid one is applied)
    it.each([
        [[['min', 'abc'], ['max', '1']], 'min', 'Min must be a number'],
        [[['max', ''], ['min', '0']], 'max', 'Enter Max, or empty both fields for an automatic range'],
        [[['max', '-1'], ['min', '1']], 'min', 'Min must be less than Max']
    ])('typing %j emits nothing and marks the %s field', async (steps, field, message) => {
        await renderWith(CLEAN_STATS);
        await settle();
        const before = changes();
        for (const [name, value] of steps) await (name === 'min' ? min() : max()).setValue(value);
        await settle();
        expect(changes()).toBe(before);
        expect((field === 'min' ? min() : max()).attributes('aria-invalid')).toBe('true');
        expect(wrapper.find(`[data-testid="rescale-${field}-error"]`).text()).toBe(message);
    });

    it('applies a valid range typed with a comma as the machine value', async () => {
        await renderWith(CLEAN_STATS);
        await settle();
        await min().setValue('0,1');
        await max().setValue('0,9');
        await settle();
        const last = wrapper.emitted('vizParamsChanged').at(-1)[0];
        expect(last.rescale).toBe('0.1,0.9');
        expect(min().attributes('aria-invalid')).toBeUndefined();
    });
});

describe('PlantHealthPanel close (FR-RAS-01)', () => {
    it('closes without changing the style of the layer', () => {
        const vm = { $emit: vi.fn(), reset: vi.fn() };
        PlantHealthPanel.methods.close.call(vm);
        expect(vm.reset).not.toHaveBeenCalled();
        expect(vm.$emit).toHaveBeenCalledWith('close');
        expect(vm.$emit).not.toHaveBeenCalledWith('vizParamsChanged', expect.anything());
    });
});

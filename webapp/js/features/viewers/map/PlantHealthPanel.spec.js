/**
 * Plant Health with outlier index values: the histogram is shown on the range the index can have
 * near the bulk of the data, its handles apart on the 2%-98% range, and a note says why; an index
 * without outliers keeps the server's histogram.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => null } } }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
const copyText = vi.hoisted(() => vi.fn());
vi.mock('@/composables/useCopyText', async importOriginal => ({ ...(await importOriginal()), copyText }));

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

let wrapper;
async function renderWith(formulaStats) {
    const dataset = {
        getRasterInfo: vi.fn(async () => ({ bands: [{}, {}, {}, {}, {}] })),
        getRasterMetadata: vi.fn(async (path, formula) => ({
            algorithms: ALGORITHMS,
            statistics: formula ? formulaStats : { 1: { min: 0, max: 1, mean: 0.5, std: 0.1 } }
        }))
    };
    wrapper = mount(PlantHealthPanel, {
        props: { visible: true, dataset, filePath: 'odm_orthophoto/odm_orthophoto.tif' },
        global: { stubs: { PlantHealthFormulasDialog: true, ColormapDropdown: true, BandSelector: true, Chart: true } }
    });
    await flushPromises();
    await wrapper.find('#plant-health-panel-formula').setValue('NDVI');
    await flushPromises();
    return wrapper;
}
const chart = () => wrapper.findComponent(HistogramChart);
const note = () => wrapper.find('[data-testid="plant-health-histogram-note"]');
const handlePositions = () => chart().findAll('[role="slider"]').map(h => parseFloat(h.attributes('style').match(/left:\s*([-\d.]+)%/)[1]));

afterEach(() => wrapper?.unmount());

describe('PlantHealthPanel histogram with outliers', () => {
    it('stretches to the 2%-98% range and keeps the handles apart on the index range', async () => {
        await renderWith(OUTLIER_STATS);
        expect(wrapper.find('#plant-health-panel-rescale').element.value).toBe('0.371,0.947');
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
        expect(wrapper.find('#plant-health-panel-rescale').element.value).toBe('0.100,0.850');
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

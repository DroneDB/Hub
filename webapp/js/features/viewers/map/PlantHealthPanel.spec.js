/**
 * Plant Health with outlier index values: the histogram is shown on the range the index can have
 * near the bulk of the data, its handles apart on the 2%-98% range, and a note says why; an index
 * without outliers keeps the server's histogram.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// The server features: no export limit of its own (the value info says it), a server that exports a window (libddb 2.3)
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => null, get: name => name === 'rasterExportWindow' } } }));
const heavy = vi.hoisted(() => ({ runHeavyTask: vi.fn(), tasks: null }));
vi.mock('@/composables/useHeavyTask', async () => {
    const { ref } = await import('vue');
    heavy.tasks = ref({});
    return { useHeavyTask: () => ({ runHeavyTask: heavy.runHeavyTask, heavyTasks: heavy.tasks }) };
});
vi.mock('@/libs/download', () => ({ downloadBlob: vi.fn() }));
const copyText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
// The clipboard: copyLinkWithNotice (useCopyText) copies through it
vi.mock('clipboard-copy', () => ({ default: copyText }));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/libs/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { default: PlantHealthPanel } = await import('./PlantHealthPanel.vue');
const { default: HistogramChart } = await import('./HistogramChart.vue');
const { ESTIMATE_DELAY_MS } = await import('@/composables/useRasterExport');

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
async function renderWith(formulaStats, { stretch = formulaStats === OUTLIER_STATS ? STRETCH.OUTLIER : STRETCH.CLEAN, initialParams = null, pick = 'NDVI',
    info = { bands: [{}, {}, {}, {}, {}] }, algorithms = ALGORITHMS, props = {} } = {}) {
    dataset = {
        getRasterInfo: vi.fn(async () => info),
        getRasterMetadata: vi.fn(async (path, formula) => ({
            algorithms,
            statistics: formula ? formulaStats : { 1: { min: 0, max: 1, mean: 0.5, std: 0.1 } }
        })),
        getRasterValueInfo: vi.fn(async (path, options = {}) => (options.formula
            ? { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', stretch }
            : { bandCount: 5, dataType: 'UInt16', isThermal: false, unit: '' }))
    };
    wrapper = mount(PlantHealthPanel, {
        props: { visible: true, dataset, filePath: 'odm_orthophoto/odm_orthophoto.tif', initialParams, ...props },
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

// The server (ddb 2.2) bins the range worth showing itself and counts the values outside it
const SERVER_OUTLIER_STATS = {
    1: {
        min: -191.73, max: 278.52, mean: 0.77, std: 1.05, percentiles: { p2: 0.3706, p98: 0.9467 },
        histogram: { ...histogram(0.3706 - (0.9467 - 0.3706), 1, 255, () => 10), below: 8, above: 5 }
    }
};

describe('PlantHealthPanel histogram with outliers', () => {
    it('shows the histogram the server binned, with a note that says where the values outside it go', async () => {
        await renderWith(SERVER_OUTLIER_STATS, { stretch: STRETCH.OUTLIER });
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.3706');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.9467');
        const { edges, counts } = chart().props('data');
        expect(counts).toHaveLength(255);
        expect(edges[0]).toBeCloseTo(0.3706 - (0.9467 - 0.3706));
        expect(edges[255]).toBe(1);
        expect(note().text()).toBe('Outliers: the values go from -191.730 to 278.520. The histogram shows -0.206 to 1.000.');
    });

    it('trims a histogram binned from min to max to the range of the index: no bars, the handles keep apart', async () => {
        await renderWith(OUTLIER_STATS);
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.3706');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.9467');
        const { edges, counts } = chart().props('data');
        expect(counts).toEqual([]);
        // The Hub takes no percentiles (D-041): the range of the index, -1 to 1
        expect(edges).toEqual([-1, 1]);
        const [min, max] = handlePositions();
        expect(max - min).toBeGreaterThan(25);
        expect(note().text()).toContain('Outliers: the values go from -191.730 to 278.520');
        expect(note().text()).toContain('cannot be drawn between -1.000 and 1.000');
    });

    it('keeps the histogram of an index without outliers, without a note', async () => {
        await renderWith(CLEAN_STATS);
        expect(chart().props('data')).toEqual({ counts: CLEAN_STATS[1].histogram.counts, edges: CLEAN_STATS[1].histogram.edges });
        expect(note().exists()).toBe(false);
        expect(wrapper.find('#plant-health-panel-rescale-min').element.value).toBe('0.1');
        expect(wrapper.find('#plant-health-panel-rescale-max').element.value).toBe('0.85');
    });
});

// FR-RAS-34: the values of an index inside its own range are no outliers
describe('PlantHealthPanel histogram note', () => {
    // NDRE of the rinconada ortho: the values stay inside -1 to 1, the server shows the central part
    const NDRE_STATS = {
        1: {
            min: -0.93, max: 0.97, mean: 0.02, std: 0.2, percentiles: { p2: -0.41, p98: 0.45 },
            histogram: { ...histogram(-0.41 - 0.86, 0.45 + 0.86, 255, () => 10), below: 40, above: 20 }
        }
    };
    const NDRE = [{ id: 'NDRE', name: 'Normalized Difference Red Edge', range: [-1, 1] }];

    it('says nothing when the values stay inside the range of the index', async () => {
        await renderWith(NDRE_STATS, { stretch: [{ min: -0.41, max: 0.45 }], algorithms: NDRE, pick: 'NDRE' });
        expect(note().exists()).toBe(false);
        expect(wrapper.text()).not.toMatch(/outlier/i);
    });

    it('calls them outliers when one is below or above the range', async () => {
        const below = { 1: { ...NDRE_STATS[1], min: -1.4 } };
        await renderWith(below, { stretch: [{ min: -0.41, max: 0.45 }], algorithms: NDRE, pick: 'NDRE' });
        expect(note().text()).toContain('Outliers: the values go from -1.400 to 0.970');
        wrapper.unmount();
        const above = { 1: { ...NDRE_STATS[1], max: 1.2 } };
        await renderWith(above, { stretch: [{ min: -0.41, max: 0.45 }], algorithms: NDRE, pick: 'NDRE' });
        expect(note().text()).toContain('Outliers: the values go from -0.930 to 1.200');
    });

    it('gives a neutral note, with the precision of an index, for an index that has no range of its own', async () => {
        const EXG = [{ id: 'EXG', name: 'Excess Green Index' }];
        await renderWith(NDRE_STATS, { stretch: [{ min: -0.41, max: 0.45 }], algorithms: EXG, pick: 'EXG' });
        expect(note().text()).toBe('The histogram shows the central part, -1.270 to 1.310; the values go from -0.930 to 0.970.');
        expect(note().text()).not.toMatch(/outlier/i);
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

// FR-RAS-16, FR-PRC-15, FR-RAS-26: the export of Plant Health is the one export control, with the state of its task
describe('PlantHealthPanel export', () => {
    const exportWhole = () => wrapper.find('[data-testid="raster-export-whole"]');
    const exportStatus = () => wrapper.find('[data-testid="heavy-task-status"]');

    it('submits the raster-export task with the style of the layer and shows Queued…, then Exporting n %', async () => {
        heavy.tasks.value = {};
        heavy.runHeavyTask.mockReset();
        heavy.runHeavyTask.mockImplementation((_dataset, _tool, options) => new Promise(() => {
            heavy.tasks.value = { t1: { taskId: 't1', toolId: 'raster-export', state: 'Enqueued', percent: 0 } };
            options.onSubmitted({ taskId: 't1' });
        }));
        await renderWith(CLEAN_STATS);
        expect(exportWhole().attributes('aria-label')).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file)');

        await exportWhole().trigger('click');
        await flushPromises();
        const [, toolId, options] = heavy.runHeavyTask.mock.calls[0];
        expect(toolId).toBe('raster-export');
        expect(options.params).toMatchObject({ path: 'odm_orthophoto/odm_orthophoto.tif', formula: 'NDVI', fileName: 'odm_orthophoto_export.tif' });
        expect(options.params).not.toHaveProperty('stretch');
        expect(exportStatus().text()).toContain('Queued…');

        heavy.tasks.value = { t1: { taskId: 't1', toolId: 'raster-export', state: 'Processing', phase: 'rendering', percent: 37 } };
        await flushPromises();
        expect(exportStatus().text()).toContain('Exporting');
        expect(exportStatus().text()).toContain('37%');
        expect(wrapper.find('[data-testid="heavy-task-cancel"]').exists()).toBe(true);
    });

    it('passes the visible extent of the map to the control', async () => {
        await renderWith(CLEAN_STATS);
        dataset.taskResult = vi.fn(async () => new Blob(['tif']));
        await wrapper.setProps({ visibleBbox: [15, 45, 15.5, 45.5] });
        heavy.runHeavyTask.mockReset();
        heavy.runHeavyTask.mockResolvedValue({ taskId: 't1' });
        await wrapper.find('[data-testid="raster-export-extent"]').trigger('click');
        await flushPromises();
        expect(heavy.runHeavyTask.mock.calls[0][2].params).toMatchObject({ bbox: [15, 45, 15.5, 45.5], fileName: 'odm_orthophoto_extent_export.tif' });
    });

    // FR-RAS-16, FR-XC-22: in Plant Health too, an export refused for its size is a focusable button with its reason as
    // visible text. Plant Health reads the info of its bands, so the control reads the estimate of the raster itself
    it('refuses an export over the limit with a focusable button and the reason as visible text', async () => {
        heavy.runHeavyTask.mockReset();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            await renderWith(CLEAN_STATS);
            dataset.getRasterValueInfo.mockImplementation(async (path, options = {}) => (options.formula
                ? { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', stretch: STRETCH.CLEAN }
                : { bandCount: 5, dataType: 'UInt16', isThermal: false, unit: '', estimatedExportBytes: 9985798963, exportLimitBytes: 1073741824 }));
            await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
            await flushPromises();
        } finally {
            vi.useRealTimers();
        }

        const button = exportWhole();
        expect(button.element.tagName).toBe('BUTTON');
        expect(button.attributes('disabled')).toBeUndefined();
        expect(button.attributes('tabindex')).toBeUndefined();
        expect(button.attributes('aria-disabled')).toBe('true');
        const reason = wrapper.find('[data-testid="raster-export-whole-reason"]');
        expect(reason.text()).toBe('Too large to export: about 9.3 GB > 1 GB limit. Use Visible extent to export it in parts.');
        expect(button.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));

        await button.trigger('click');
        await flushPromises();
        expect(heavy.runHeavyTask).not.toHaveBeenCalled();
    });
});

// FR-RAS-18: the presets and the sensor
describe('PlantHealthPanel presets', () => {
    // As libddb gives them for a 4-band Green/Red/NIR/RedEdge raster (a generic profile): no True Color, the composite maps NIR to red
    const INFO = {
        bands: [{ index: 1, name: 'Green' }, { index: 2, name: 'Red' }, { index: 3, name: 'NIR' }, { index: 4, name: 'Rededge' }],
        detectedSensor: 'generic-4band',
        detectedSensorName: 'Generic 4-band',
        defaultPreset: 'false-color-ir',
        availablePresets: [
            { id: 'false-color-ir', name: 'Color Infrared', bandMapping: { r: 3, g: 2, b: 1 }, isDefault: true },
            { id: 'ndwi', name: 'NDWI', type: 'index', formula: 'NDWI', colormap: 'bugn', isDefault: false }
        ]
    };
    const preset = () => wrapper.find('#plant-health-panel-preset');

    it('shows the Preset list with the presets of the server and the name of the sensor', async () => {
        await renderWith(CLEAN_STATS, { info: INFO, pick: '' });
        expect(preset().exists()).toBe(true);
        expect(preset().findAll('option').map(o => o.text())).toEqual(['Custom...', 'Color Infrared', 'NDWI']);
        expect(wrapper.get('[data-testid="plant-health-sensor"]').text()).toBe('Generic 4-band');
        expect(wrapper.get('[data-testid="plant-health-sensor"]').attributes('title')).toBe('generic-4band');
    });

    it('writes the id as a name for a server that gives none', async () => {
        await renderWith(CLEAN_STATS, { info: { ...INFO, detectedSensorName: undefined }, pick: '' });
        expect(wrapper.get('[data-testid="plant-health-sensor"]').text()).toBe('Generic 4band');
    });

    it('has no Preset list when the sensor has no presets', async () => {
        await renderWith(CLEAN_STATS, { info: { ...INFO, availablePresets: [] }, pick: '' });
        expect(preset().exists()).toBe(false);
    });

    it('styles the layer with a band preset by its id', async () => {
        await renderWith(CLEAN_STATS, { info: INFO, pick: '' });
        await preset().setValue('false-color-ir');
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toEqual({ preset: 'false-color-ir' });
    });

    // FR-RAS-26: a band preset has no formula, so ddb exports the bands scaled to 8 bits, and the label says so; an index is the styled image
    it('names the export after the style: scaled bands for a band preset, a styled image for an index', async () => {
        await renderWith(CLEAN_STATS, { info: INFO, algorithms: [{ id: 'NDWI', name: 'NDWI', range: [-1, 1] }], pick: '' });
        const label = () => wrapper.find('[data-testid="raster-export-whole"]').attributes('aria-label');
        await preset().setValue('false-color-ir');
        expect(label()).toBe('Export scaled bands (8-bit GeoTIFF, in the CRS of the file)');
        await preset().setValue('ndwi');
        await flushPromises();
        expect(label()).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file)');
    });

    it('takes an index preset as its formula and colormap', async () => {
        const algorithms = [{ id: 'NDWI', name: 'NDWI', range: [-1, 1] }];
        await renderWith(CLEAN_STATS, { info: INFO, algorithms, pick: '' });
        await preset().setValue('ndwi');
        await flushPromises();
        expect(wrapper.find('#plant-health-panel-formula').element.value).toBe('NDWI');
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).toMatchObject({ formula: 'NDWI', colormap: 'bugn' });
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0].preset).toBeUndefined();
    });
});

// FR-RAS-32: the formula list
describe('PlantHealthPanel formula list', () => {
    const LIST = [
        { id: 'NDVI', name: 'Normalized Difference Vegetation Index', category: 'multispectral', requiredBands: ['Red', 'NIR'], range: [-1, 1] },
        { id: 'VARI', name: 'Visual Atmospheric Resistance Index', category: 'rgb', requiredBands: ['Red', 'Green', 'Blue'], disabled: true, disabledReason: 'Requires bands: RGB' },
        { id: 'CELSIUS', name: 'Celsius Temperature', category: 'thermal', requiredBands: ['Thermal'], disabled: true, disabledReason: 'Requires bands: T' },
        { id: 'KELVIN', name: 'Kelvin Temperature', category: 'thermal', requiredBands: ['Thermal'], disabled: true, disabledReason: 'Requires bands: T' }
    ];
    const options = () => wrapper.get('[data-testid="plant-health-formula"]').findAll('option').map(o => o.text());

    it('starts every option with the id, so the closed select reads "NDVI – ..."', async () => {
        await renderWith(CLEAN_STATS, { algorithms: LIST, pick: '' });
        expect(options()).toEqual([
            'None (bands only)',
            'NDVI – Normalized Difference Vegetation Index',
            'VARI – Visual Atmospheric Resistance Index ✗'
        ]);
    });

    it('lists no thermal formula on a multispectral raster, and no other on a thermal one', async () => {
        await renderWith(CLEAN_STATS, { algorithms: LIST, pick: '' });
        expect(options().join('|')).not.toContain('CELSIUS');
        expect(options().join('|')).not.toContain('KELVIN');
        wrapper.unmount();

        const thermal = [
            { id: 'NDVI', name: 'Normalized Difference Vegetation Index', category: 'multispectral', requiredBands: ['Red', 'NIR'], disabled: true, disabledReason: 'Requires bands: RN' },
            { id: 'CELSIUS', name: 'Celsius Temperature', category: 'thermal', requiredBands: ['Thermal'] },
            { id: 'KELVIN', name: 'Kelvin Temperature', category: 'thermal', requiredBands: ['Thermal'] }
        ];
        await renderWith(CLEAN_STATS, { algorithms: thermal, pick: '' });
        expect(options()).toEqual(['None (bands only)', 'CELSIUS – Celsius Temperature', 'KELVIN – Kelvin Temperature']);
    });

    it('lists both kinds on a raster with multispectral and thermal bands (MicaSense Altum, Landsat with its thermal band)', async () => {
        const altum = [
            { id: 'NDVI', name: 'Normalized Difference Vegetation Index', category: 'multispectral', requiredBands: ['Red', 'NIR'] },
            { id: 'VARI', name: 'Visual Atmospheric Resistance Index', category: 'rgb', requiredBands: ['Red', 'Green', 'Blue'] },
            { id: 'CELSIUS', name: 'Celsius Temperature', category: 'thermal', requiredBands: ['Thermal'] },
            { id: 'KELVIN', name: 'Kelvin Temperature', category: 'thermal', requiredBands: ['Thermal'], disabled: true, disabledReason: 'Requires bands: T' }
        ];
        await renderWith(CLEAN_STATS, { algorithms: altum, pick: '' });
        expect(options()).toEqual([
            'None (bands only)',
            'NDVI – Normalized Difference Vegetation Index',
            'VARI – Visual Atmospheric Resistance Index',
            'CELSIUS – Celsius Temperature',
            'KELVIN – Kelvin Temperature ✗'
        ]);
    });

    it('lists the reflectance formulas, disabled with their reason, on a raster that can compute none', async () => {
        const none = [
            { id: 'NDVI', name: 'Normalized Difference Vegetation Index', category: 'multispectral', disabled: true, disabledReason: 'Requires bands: RN' },
            { id: 'VARI', name: 'Visual Atmospheric Resistance Index', category: 'rgb', disabled: true, disabledReason: 'Requires bands: RGB' },
            { id: 'CELSIUS', name: 'Celsius Temperature', category: 'thermal', disabled: true, disabledReason: 'Requires bands: T' }
        ];
        await renderWith(CLEAN_STATS, { algorithms: none, pick: '' });
        expect(options()).toEqual([
            'None (bands only)',
            'NDVI – Normalized Difference Vegetation Index ✗',
            'VARI – Visual Atmospheric Resistance Index ✗'
        ]);
    });

    it('lists every formula when the server sends no category', async () => {
        await renderWith(CLEAN_STATS, { algorithms: [{ id: 'NDVI', name: 'NDVI' }, { id: 'CELSIUS', name: 'Celsius' }], pick: '' });
        expect(options()).toEqual(['None (bands only)', 'NDVI – NDVI', 'CELSIUS – Celsius']);
    });

    it('gives the reason of a disabled formula as its title, and a hint that the select is described by', async () => {
        await renderWith(CLEAN_STATS, { algorithms: LIST, pick: '' });
        const vari = wrapper.get('[data-testid="plant-health-formula"]').findAll('option')[2];
        expect(vari.attributes('disabled')).toBeDefined();
        expect(vari.attributes('title')).toBe('Requires bands: RGB');
        const hint = wrapper.get('[data-testid="plant-health-formula-hint"]');
        expect(wrapper.get('[data-testid="plant-health-formula"]').attributes('aria-describedby')).toBe(hint.attributes('id'));
        expect(hint.text()).toContain('1 formula is not available for this raster');
    });

    it('has no hint when every formula can be computed', async () => {
        await renderWith(CLEAN_STATS, { algorithms: [LIST[0]], pick: '' });
        expect(wrapper.find('[data-testid="plant-health-formula-hint"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="plant-health-formula"]').attributes('aria-describedby')).toBeUndefined();
    });
});

// FR-RAS-19: the tiles of a formula the raster cannot compute
describe('PlantHealthPanel formula error', () => {
    const REFUSED = [
        { id: 'NDVI', name: 'Normalized Difference Vegetation Index', category: 'multispectral', disabled: true, disabledReason: 'Requires bands: RN' },
        { id: 'VARI', name: 'Visual Atmospheric Resistance Index', category: 'rgb' }
    ];

    it('says that the formula cannot be computed when the raster metadata disables it, whatever its tiles', async () => {
        await renderWith(CLEAN_STATS, { algorithms: REFUSED, initialParams: { formula: 'NDVI' }, pick: '' });
        expect(wrapper.get('[data-testid="plant-health-formula-error"]').text()).toBe('This formula cannot be computed for this image.');
    });

    it('does not say it for failed tiles of a formula the metadata enables (a timeout, a 5xx, a lost session)', async () => {
        await renderWith(CLEAN_STATS, { props: { formulaError: true } });
        expect(wrapper.find('[data-testid="plant-health-formula-error"]').exists()).toBe(false);
    });

    it('falls back to the failed tiles for a formula the metadata does not list', async () => {
        await renderWith(CLEAN_STATS, { algorithms: [], initialParams: { formula: 'NDVI' }, pick: '', props: { formulaError: true } });
        expect(wrapper.get('[data-testid="plant-health-formula-error"]').text()).toBe('This formula cannot be computed for this image.');
        await wrapper.setProps({ formulaError: false });
        expect(wrapper.find('[data-testid="plant-health-formula-error"]').exists()).toBe(false);
    });

    it('says nothing without a formula chosen', async () => {
        await renderWith(CLEAN_STATS, { props: { formulaError: true }, pick: '' });
        expect(wrapper.find('[data-testid="plant-health-formula-error"]').exists()).toBe(false);
    });
});

// FR-RAS-23: the actions are the footer of the panel
describe('PlantHealthPanel footer', () => {
    it('has Reset, Original, Copy Link and the export control in the footer', async () => {
        await renderWith(CLEAN_STATS);
        const footer = wrapper.get('[data-testid="panel-actions"]');
        expect(footer.findAll('button').map(b => b.text())).toEqual(['Reset', 'Original', 'Copy Link', 'Export', 'Visible extent']);
        expect(footer.find('[data-testid="raster-export"]').exists()).toBe(true);
        expect(wrapper.get('.panel-body').find('.actions-grid').exists()).toBe(false);
    });
});


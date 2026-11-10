/**
 * The Raster Analysis panel: Area draws a rectangle (the host does) and the panel shows the
 * statistics of its values in the raster's unit, with the pixels without data; the last value
 * read with Inspect is shown with where it was read. The values of an elevation model are in
 * metres, those of a raster of raw values have no unit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// A server that exports a window (libddb 2.3, rasterExportWindow of /sys/features)
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => null, get: name => name === 'rasterExportWindow' } } }));

const { default: RasterAnalysisControls } = await import('./RasterAnalysisControls.vue');
const { ESTIMATE_DELAY_MS } = await import('@/composables/useRasterExport');

const STATS = {
    min: 196.96, max: 197.71, mean: 197.2133, median: 197.19, stddev: 0.1692,
    pixelCount: 9000, bounds: { x0: 1000, y0: 1000, x1: 1099, y1: 1099 }, unit: '', isThermal: false
};

// As libddb's raster value info answers them: a DSM without a unit type, and an airborne thermal
// mosaic of raw digital numbers (odx/hat-creek) that libddb does not see as thermal
const DSM_INFO = { valueMin: 194.7, valueMax: 229.5, bandCount: 1, dataType: 'Float32', isThermal: false, unit: '' };
const RAW_INFO = { valueMin: 145, valueMax: 402, bandCount: 2, dataType: 'UInt16', isThermal: false, unit: '' };

let wrapper;
async function render(props = {}, info = DSM_INFO) {
    const dataset = { getRasterValueInfo: vi.fn(async () => ({ ...info })) };
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
            `Pixels: ${(9000).toLocaleString(navigator.language)}`, `No data: ${(1000).toLocaleString(navigator.language)}`
        ]);
    });

    it('has no no-data row when every pixel has a value', async () => {
        await render({ areaStats: { ...STATS, pixelCount: 10000 } });
        expect(statRows().some(r => r.startsWith('No data'))).toBe(false);
    });

    // D-022: ddb answers in the unit of the selected formula, the panel adds nothing to the numbers
    it('shows the values of a thermal area as the server sends them, in the unit of the selected formula', async () => {
        await render();
        wrapper.vm.rasterInfo = { valueMin: 20, valueMax: 40, isThermal: true, calibration: {} };
        wrapper.vm.selectedFormula = 'KELVIN';
        await wrapper.setProps({ areaStats: { ...STATS, min: 293.15, stddev: 1.25, isThermal: true } });
        expect(statRows()).toContain('Min: 293.2 K');
        expect(statRows()).toContain('Std dev: 1.3 K');
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

describe('RasterAnalysisControls unit', () => {
    it('is none for the raw values of a raster that is not an elevation model', async () => {
        await render({ areaStats: { ...STATS, min: 145, max: 402 }, filePath: 'Airborne_thermal_infrared_mosaic.tif' }, RAW_INFO);
        expect(statRows()).toContain('Min: 145');
        expect(statRows()).toContain('Max: 402');
        expect(statRows().join(' ')).not.toMatch(/ m\b/);
    });

    it('is the own unit of the raster when it has one', async () => {
        await render({ areaStats: STATS }, { ...DSM_INFO, unit: 'ft' });
        expect(statRows()).toContain('Min: 196.96 ft');
    });
});

describe('RasterAnalysisControls spot value', () => {
    it('shows where a georeferenced value was read as latitude, longitude', async () => {
        await render({ spotInfo: { value: 197.111, x: 1280, y: 1280, hasGeo: true, geoX: 21.43055029, geoY: 50.98112738 } });
        expect(byId('raster-spot-value').text()).toContain('197.11 m');
        expect(byId('raster-spot-value').text()).toContain('50.981127, 21.430550');
    });

    // Spot coordinates are the clicked point (FR-RAS-02): the server answers with it
    it('shows the clicked point, not the centre of its pixel', async () => {
        await render({ spotInfo: { value: 12.9, x: 50, y: 50, hasGeo: true, geoX: 15.0012848, geoY: 45.152568, lon: 15.0012849, lat: 45.1525681 } });
        expect(byId('raster-spot-value').text()).toContain('45.152568, 15.001285');
    });

    it('shows the pixel of a value without georeference', async () => {
        await render({ spotInfo: { value: 3, x: 4, y: 5, hasGeo: false } });
        expect(byId('raster-spot-value').text()).toContain('pixel 4, 5');
    });
});

describe('RasterAnalysisControls elevation model', () => {
    const CANDIDATES = [{ path: 'odm_dem/dtm.tif', label: 'dtm.tif' }, { path: 'odm_dem/dsm.tif', label: 'dsm.tif' }];
    const select = () => wrapper.find('[data-testid="analysis-target-select"]');

    it('shows the selector with two rasters to work on, and the current one', async () => {
        await render({ filePath: 'odm_dem/dsm.tif', targetCandidates: CANDIDATES, targetPath: 'odm_dem/dsm.tif' });
        // Any raster can be analysed, so the label is neutral (FR-RAS-25); only the stockpile tool takes elevation models
        expect(wrapper.find('.analysis-target label').text()).toBe('Raster');
        expect(wrapper.text()).not.toContain('Elevation model');
        expect(select().findAll('option').map(o => o.text())).toEqual(['dtm.tif', 'dsm.tif']);
        expect(select().element.value).toBe('odm_dem/dsm.tif');
    });

    it('shows none with one raster', async () => {
        await render({ targetCandidates: [CANDIDATES[0]], targetPath: CANDIDATES[0].path });
        expect(select().exists()).toBe(false);
    });

    it('asks for the raster that was picked', async () => {
        await render({ targetCandidates: CANDIDATES, targetPath: 'odm_dem/dsm.tif' });
        await select().setValue('odm_dem/dtm.tif');
        expect(wrapper.emitted('selectTarget')).toEqual([['odm_dem/dtm.tif']]);
    });
});

// FR-RAS-10: Rescale is two number fields; a range that is not valid shows its error at the field and the map does not change
describe('RasterAnalysisControls rescale fields', () => {
    const min = () => wrapper.find('#raster-analysis-controls-rescale-min');
    const max = () => wrapper.find('#raster-analysis-controls-rescale-max');
    const changes = () => (wrapper.emitted('vizParamsChanged') || []).length;
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 400)); await flushPromises(); };

    it('starts from the observed range of the raster, in two fields', async () => {
        await render();
        expect(min().element.value).toBe('194.7');
        expect(max().element.value).toBe('229.5');
    });

    // The fields are typed in the order that never makes a valid range on the way (a valid one is applied)
    it.each([
        [[['min', 'abc'], ['max', '10']], 'min', 'Min must be a number'],
        [[['max', ''], ['min', '0']], 'max', 'Enter Max, or empty both fields for an automatic range'],
        [[['max', '10'], ['min', '40']], 'min', 'Min must be less than Max']
    ])('typing %j shows the error at the %s field and sends no vizParamsChanged', async (steps, field, message) => {
        await render();
        await settle();
        const before = changes();
        for (const [name, value] of steps) await (name === 'min' ? min() : max()).setValue(value);
        await settle();
        expect(changes()).toBe(before);
        expect(wrapper.find(`[data-testid="rescale-${field}-error"]`).text()).toBe(message);
        expect((field === 'min' ? min() : max()).attributes('aria-invalid')).toBe('true');
    });

    it('reads "12,5" as 12.5 and sends the machine value', async () => {
        await render();
        await settle();
        await min().setValue('0');
        await max().setValue('12,5');
        await settle();
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0].rescale).toBe('0,12.5');
    });
});

// FR-RAS-31: the NoData value of the panel goes with the vizParams of the layer, and the file's own is explained
describe('RasterAnalysisControls NoData value', () => {
    const input = () => byId('raster-nodata-input');

    it('is sent with the vizParams of the layer, and the value info is read with it', async () => {
        await render();
        const dataset = wrapper.props('dataset');
        await input().setValue('0');
        await input().trigger('change');
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenLastCalledWith('odm_dem/dsm.tif', { nodata: 0 });
        const params = wrapper.emitted('vizParamsChanged').at(-1)[0];
        expect(params.nodata).toBe(0);
    });

    it('is not in the vizParams without a value', async () => {
        await render();
        expect(wrapper.emitted('vizParamsChanged').at(-1)[0]).not.toHaveProperty('nodata');
    });

    it('refuses text that is not a number, without a request', async () => {
        await render();
        const dataset = wrapper.props('dataset');
        const before = dataset.getRasterValueInfo.mock.calls.length;
        await input().setValue('abc');
        await input().trigger('change');
        await flushPromises();
        expect(byId('raster-nodata-error').text()).toContain('must be a number');
        expect(dataset.getRasterValueInfo.mock.calls.length).toBe(before);
    });

    it('explains a NoData value of the file that its data type cannot hold', async () => {
        await render({}, { ...RAW_INFO, nodata: 65536, nodataInvalid: true, nodataOverridden: false });
        expect(byId('raster-nodata-invalid').text()).toContain('(65536)');
    });

    it('shows the NoData value of the file as the placeholder', async () => {
        await render({}, { ...DSM_INFO, nodata: -9999, nodataInvalid: false, nodataOverridden: false });
        expect(input().attributes('placeholder')).toContain('-9999');
    });
});


// FR-RAS-01, FR-RAS-17, FR-RAS-24: the default style is the one function (defaultVizParams) over the value info of the
// server; a panel that is closed styles nothing, and closing it keeps the style of the layer
describe('RasterAnalysisControls default style', () => {
    // The value info of LisbonElevation.tif: negative heights, no NoData value, the stretch of ddb (D-041)
    const LISBON = { valueMin: -6.3, valueMax: 216, bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', stretch: [{ min: -6.3, max: 216 }] };
    const last = () => wrapper.emitted('vizParamsChanged').at(-1)[0];
    const unitInput = () => wrapper.find('#raster-analysis-controls-unit-name');
    // The Rescale range of the two fields (U-401 RescaleFields) as the panel's machine value "min,max", '' when both are empty
    const rescaleShown = () => {
        const min = wrapper.find('#raster-analysis-controls-rescale-min').element.value;
        const max = wrapper.find('#raster-analysis-controls-rescale-max').element.value;
        return min === '' && max === '' ? '' : `${min},${max}`;
    };
    const setRescale = async (min, max) => {
        await wrapper.find('#raster-analysis-controls-rescale-min').setValue(min);
        await wrapper.find('#raster-analysis-controls-rescale-max').setValue(max);
    };
    const resetButton = () => wrapper.find('button[title="Reset all visualization parameters to their defaults"]');

    it('opens with a ramp stretched to the stretch of the value info, without a formula', async () => {
        await render({}, LISBON);
        expect(last()).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
        expect(rescaleShown()).toBe('-6.3,216');
    });

    it('takes the range of the values when the value info has no stretch', async () => {
        await render({}, { ...LISBON, stretch: undefined });
        expect(last()).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
    });

    it('has the formula only for a thermal raster that has a calibration', async () => {
        await render({}, { ...LISBON, isThermal: true, calibration: { a: 1 }, stretch: [{ min: 12.76, max: 35.27 }] });
        expect(last()).toEqual({ formula: 'CELSIUS', colormap: 'ironbow', rescale: '12.76,35.27' });
    });

    it('closing it keeps the style of the layer: nothing is emitted but the close', async () => {
        await render({}, LISBON);
        const before = wrapper.emitted('vizParamsChanged').length;
        wrapper.vm.close();
        await flushPromises();
        expect(wrapper.emitted('vizParamsChanged')).toHaveLength(before);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('opens with the style the layer has, and emits it unchanged', async () => {
        await render({ initialParams: { colormap: 'magma', rescale: '0,100' } }, LISBON);
        expect(last()).toEqual({ colormap: 'magma', rescale: '0,100' });
    });

    it('takes the style of the layer again when it opens again', async () => {
        await render({ initialParams: { colormap: 'magma', rescale: '0,100' } }, LISBON);
        await wrapper.setProps({ visible: false });
        await wrapper.setProps({ visible: true, initialParams: { colormap: 'plasma', rescale: '1,2' } });
        await flushPromises();
        expect(last()).toEqual({ colormap: 'plasma', rescale: '1,2' });
    });

    // FR-RAS-17: Stockpile Volume takes the raster with the panel closed
    it('reads and styles nothing while it is closed, whatever raster the other tools take', async () => {
        await render({ visible: false, filePath: null }, LISBON);
        const dataset = wrapper.props('dataset');
        await wrapper.setProps({ filePath: 'landfill/DTM22ok2025.tif' });
        await flushPromises();
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
        expect(wrapper.emitted('vizParamsChanged')).toBeUndefined();

        await wrapper.setProps({ visible: true });
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenCalledTimes(1);
        expect(last()).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
    });

    it('Reset sets the Unit back to the default and emits the default style', async () => {
        await render({ filePath: 'hatcreek/mosaic.tif' }, RAW_INFO);
        await unitInput().setValue('dC');
        expect(wrapper.find('.temp-range').text()).toContain('145 dC');
        await setRescale('0', '5');
        await resetButton().trigger('click');
        await flushPromises();
        expect(unitInput().element.value).toBe('');
        expect(wrapper.find('.temp-range').text()).not.toContain('dC');
        expect(rescaleShown()).toBe('145,402');
        expect(last()).toEqual({ colormap: 'viridis', rescale: '145,402' });
    });

    it('Reset puts the unit of an elevation model back to metres and clears the NoData value', async () => {
        await render({}, LISBON);
        await unitInput().setValue('ft');
        await byId('raster-nodata-input').setValue('0');
        await resetButton().trigger('click');
        await flushPromises();
        expect(unitInput().element.value).toBe('m');
        expect(byId('raster-nodata-input').element.value).toBe('');
        expect(last()).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
    });

    // FR-RAS-24: without value info there is no range: Reset keeps the server's own stretch, not the 0-65535 fallback
    it('Reset after a value info that failed to load sets no rescale', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const dataset = { getRasterValueInfo: vi.fn(async () => { throw new Error('500'); }) };
        wrapper = mount(RasterAnalysisControls, {
            props: { visible: true, dataset, filePath: 'odm_dem/dsm.tif' },
            global: { stubs: { RasterProfileChart: true, ColormapDropdown: true } }
        });
        await flushPromises();
        expect(last()).toEqual({ colormap: 'viridis' });
        await setRescale('0', '5');
        await resetButton().trigger('click');
        await flushPromises();
        expect(rescaleShown()).toBe('');
        expect(last()).toEqual({ colormap: 'viridis' });
        expect(last().rescale).toBeUndefined();
    });
});

// FR-RAS-28: one format for a value and its unit
describe('RasterAnalysisControls value format', () => {
    it('writes a Celsius value with one decimal and the symbol after a space', async () => {
        await render({ spotInfo: { value: 29.06, x: 1, y: 1, hasGeo: false } },
            { valueMin: 12.76, valueMax: 35.27, isThermal: true, calibration: {}, unit: 'Celsius' });
        expect(byId('raster-spot-value').text()).toContain('29.1 °C');
        expect(wrapper.find('.temp-range').text()).toContain('12.8 °C');
        expect(wrapper.find('.temp-range').text()).toContain('35.3 °C');
    });
});

// FR-RAS-16: the export of Raster Analysis is the one export control (a task), not a direct download; one over the limit is a
// button that can be focused with its reason as visible text
describe('RasterAnalysisControls export', () => {
    it('refuses an export over the limit with a focusable button and the reason as text, from the value info of the Registry', async () => {
        await render({}, { ...DSM_INFO, estimatedExportBytes: 9985798963, exportLimitBytes: 1073741824 });
        const button = byId('raster-export-whole');
        expect(button.element.tagName).toBe('BUTTON');
        expect(button.attributes('disabled')).toBeUndefined();
        expect(button.attributes('aria-disabled')).toBe('true');
        const reason = byId('raster-export-whole-reason');
        expect(reason.text()).toContain('Too large to export: about 9.3 GB > 1 GB limit');
        expect(button.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
        // The visible extent stays available to export it in parts (the map says the extent), once the estimate of the
        // window (read with the window) is within the limit; until then it waits and says why
        wrapper.props().dataset.getRasterValueInfo.mockImplementation(async (_path, options = {}) => (options.bbox
            ? { estimatedExportBytes: 200 * 1024 * 1024, exportLimitBytes: 1073741824 }
            : { ...DSM_INFO, estimatedExportBytes: 9985798963, exportLimitBytes: 1073741824 }));
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            await wrapper.setProps({ visibleBbox: [15, 45, 15.5, 45.5] });
            expect(byId('raster-export-extent').attributes('aria-disabled')).toBe('true');
            expect(byId('raster-export-extent-reason').text()).toBe('Checking size…');
            await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        } finally {
            vi.useRealTimers();
        }
        await flushPromises();
        expect(wrapper.props().dataset.getRasterValueInfo).toHaveBeenCalledWith('odm_dem/dsm.tif', { nodata: undefined, bbox: [15, 45, 15.5, 45.5] });
        expect(byId('raster-export-extent').attributes('aria-disabled')).toBeUndefined();
    });

    it('offers the export of the whole raster when it is within the limit', async () => {
        await render({}, { ...DSM_INFO, estimatedExportBytes: 1000, exportLimitBytes: 1073741824 });
        expect(byId('raster-export-whole').attributes('aria-disabled')).toBeUndefined();
        expect(byId('raster-export-whole-reason').exists()).toBe(false);
    });

    it('has no direct download of the export any more', async () => {
        const dataset = { getRasterValueInfo: vi.fn(async () => ({ ...DSM_INFO })), exportUrl: vi.fn(), registry: { fetchRaw: vi.fn() } };
        wrapper = mount(RasterAnalysisControls, {
            props: { visible: true, dataset, filePath: 'odm_dem/dsm.tif' },
            global: { stubs: { RasterProfileChart: true, ColormapDropdown: true } }
        });
        await flushPromises();
        await byId('raster-export-whole').trigger('click');
        await flushPromises();
        expect(dataset.exportUrl).not.toHaveBeenCalled();
        expect(dataset.registry.fetchRaw).not.toHaveBeenCalled();
    });
});

// FR-RAS-25: a raster that is not an elevation model has values and no elevations
describe('RasterAnalysisControls Contours button wording', () => {
    const contours = () => byId('raster-contours-btn');

    it('speaks of an elevation raster for an elevation model', async () => {
        await render();
        expect(contours().attributes('title')).toBe('Generate contour lines from this elevation raster');
    });

    it('speaks of the values of the raster for any other one', async () => {
        await render({}, RAW_INFO);
        expect(contours().attributes('title')).toBe('Generate contour lines from the values of this raster');
    });

    it('passes the raster info on, which says whether it is an elevation model', async () => {
        await render({}, RAW_INFO);
        await contours().trigger('click');
        expect(wrapper.emitted('openContourDialog')[0][0]).toMatchObject({ bandCount: 2, dataType: 'UInt16' });
    });
});

// FR-RAS-23: the action grid is the footer of the panel, not part of the body that scrolls
describe('RasterAnalysisControls footer', () => {
    it('has its actions in the footer of the panel', async () => {
        await render();
        const footer = wrapper.get('[data-testid="panel-actions"]');
        expect(footer.findAll('button').map(b => b.text()).filter(Boolean)).toEqual(['Profile', 'Inspect', 'Area', 'Contours', 'Reset', 'Original', 'Export', 'Visible extent']);
        expect(footer.find('[data-testid="raster-export"]').exists()).toBe(true);
        expect(wrapper.get('.panel-body').find('[data-testid="raster-area-stats-btn"]').exists()).toBe(false);
    });

    it('has no footer while the raster info is loading', () => {
        wrapper = mount(RasterAnalysisControls, {
            props: { visible: true, dataset: { getRasterValueInfo: () => new Promise(() => {}) }, filePath: 'odm_dem/dsm.tif' },
            global: { stubs: { RasterProfileChart: true, ColormapDropdown: true } }
        });
        expect(wrapper.find('[data-testid="panel-actions"]').exists()).toBe(false);
    });
});

// The thermal units (FR-RAS-03, FR-RAS-06, D-022, AC-011): the panel shows the values of ddb in the unit of its Unit select,
// which starts at the unit of the band. As libddb's raster value info answers a Float32 GeoTIFF in K, one in degrees Celsius,
// and the raw counts of a sensor.
describe('RasterAnalysisControls thermal units', () => {
    const KELVIN = { isThermal: true, isDirectValue: true, bandCount: 1, dataType: 'Float32', unit: 'K', sensorId: '',
        valueMin: 280.1, valueMax: 308.4, stretch: [{ min: 280.1, max: 308.4 }] };
    const CELSIUS = { ...KELVIN, unit: 'Celsius', valueMin: 6.95, valueMax: 35.25, stretch: [{ min: 6.95, max: 35.25 }] };
    const RAW_COUNTS = { isThermal: true, isDirectValue: false, bandCount: 1, dataType: 'UInt16', unit: '°C', sensorId: 'flir',
        valueMin: 14000, valueMax: 16000, stretch: [{ min: 14000, max: 16000 }] };
    // What ddb answers for the value info of the Kelvin raster in each unit
    const KELVIN_IN = {
        CELSIUS: { ...KELVIN, unit: '°C', valueMin: 6.95, valueMax: 35.25, stretch: [{ min: 6.95, max: 35.25 }] },
        FAHRENHEIT: { ...KELVIN, unit: '°F', valueMin: 44.51, valueMax: 95.45, stretch: [{ min: 44.51, max: 95.45 }] },
        KELVIN
    };

    // The info by the formula that was asked: the file's own without one
    async function mountThermal(info, inUnit = {}, props = {}) {
        const getRasterValueInfo = vi.fn(async (path, options = {}) => ({ ...(options.formula && inUnit[options.formula] ? inUnit[options.formula] : info) }));
        wrapper = mount(RasterAnalysisControls, {
            props: { visible: true, dataset: { getRasterValueInfo }, filePath: 'hatcreek/clip.tif', ...props },
            global: { stubs: { RasterProfileChart: true, ColormapDropdown: true } }
        });
        await flushPromises();
        return { getRasterValueInfo };
    }
    const select = () => wrapper.find('#raster-analysis-controls-unit');
    const last = () => wrapper.emitted('vizParamsChanged').at(-1)[0];
    const range = () => wrapper.findAll('.temp-range span').map(span => span.text()).join(' ');
    // The Rescale range of the two fields (U-401 RescaleFields) as the panel's machine value "min,max"
    const rescaleShown = () => `${wrapper.find('#raster-analysis-controls-rescale-min').element.value},${wrapper.find('#raster-analysis-controls-rescale-max').element.value}`;
    // The user types a range and leaves the field (the commit the panel applies)
    const typeRescale = async (min, max) => {
        await wrapper.find('#raster-analysis-controls-rescale-min').setValue(min);
        await wrapper.find('#raster-analysis-controls-rescale-max').setValue(max);
        await wrapper.find('#raster-analysis-controls-rescale-max').trigger('change');
    };
    const rescaleLabel = () => wrapper.find('#raster-analysis-controls-rescale-label').text();
    const chooseUnit = async formula => { await select().setValue(formula); await flushPromises(); };

    it('opens a Kelvin raster in K, with the formula of the band and no 273.15 added', async () => {
        await mountThermal(KELVIN, KELVIN_IN);
        expect(select().element.value).toBe('KELVIN');
        expect(range()).toBe('280.1 K - 308.4 K');
        expect(last()).toEqual({ formula: 'KELVIN', colormap: 'ironbow', rescale: '280.1,308.4' });
        expect(wrapper.vm.formatValue(284.6)).toBe('284.6 K');
        expect(wrapper.vm.formatSpread(1.25)).toBe('1.3 K');
    });

    it('shows the values in °C once the user selects it: ddb converts, the panel only formats', async () => {
        const { getRasterValueInfo } = await mountThermal(KELVIN, KELVIN_IN);
        await chooseUnit('CELSIUS');
        // The value info is asked again in the unit
        expect(getRasterValueInfo).toHaveBeenLastCalledWith('hatcreek/clip.tif', { nodata: undefined, formula: 'CELSIUS' });
        expect(range()).toBe('7.0 °C - 35.3 °C');
        expect(wrapper.vm.formatValue(11.5)).toBe('11.5 °C');
    });

    it('the Unit select offers °C, K and °F, and °F sends the Fahrenheit formula', async () => {
        const { getRasterValueInfo } = await mountThermal(KELVIN, KELVIN_IN);
        expect(select().findAll('option').map(o => `${o.element.value} ${o.text()}`)).toEqual([
            'CELSIUS Celsius (°C)', 'KELVIN Kelvin (K)', 'FAHRENHEIT Fahrenheit (°F)'
        ]);
        await chooseUnit('FAHRENHEIT');
        expect(getRasterValueInfo).toHaveBeenLastCalledWith('hatcreek/clip.tif', { nodata: undefined, formula: 'FAHRENHEIT' });
        expect(last().formula).toBe('FAHRENHEIT');
        expect(range()).toBe('44.5 °F - 95.5 °F');
    });

    // D-022: a rescale keeps its temperatures when the unit changes: it goes with the unit it was written in
    it('sends the rescale with the unit it was written in after the unit changed', async () => {
        await mountThermal(KELVIN, KELVIN_IN);
        expect(rescaleLabel()).toBe('Rescale (K)');
        await chooseUnit('CELSIUS');
        expect(last()).toEqual({ formula: 'CELSIUS', colormap: 'ironbow', rescale: '280.1,308.4', rescaleUnit: 'K' });
        expect(rescaleLabel()).toBe('Rescale (K)');

        // A rescale typed now is in °C: it needs no unit of its own
        await typeRescale('10', '30');
        await new Promise(resolve => setTimeout(resolve, 350));
        expect(last()).toEqual({ formula: 'CELSIUS', colormap: 'ironbow', rescale: '10,30' });
        expect(rescaleLabel()).toBe('Rescale (°C)');
    });

    it('Reset goes back to the unit of the band and to its stretch', async () => {
        await mountThermal(KELVIN, KELVIN_IN);
        await chooseUnit('FAHRENHEIT');
        await typeRescale('50', '90');
        await wrapper.find('button[title="Reset all visualization parameters to their defaults"]').trigger('click');
        await flushPromises();
        expect(select().element.value).toBe('KELVIN');
        expect(rescaleShown()).toBe('280.1,308.4');
        expect(range()).toBe('280.1 K - 308.4 K');
        expect(last()).toEqual({ formula: 'KELVIN', colormap: 'ironbow', rescale: '280.1,308.4' });
    });

    it('opens with the unit and the rescale of the layer, with the unit the rescale was written in', async () => {
        const { getRasterValueInfo } = await mountThermal(KELVIN, KELVIN_IN,
            { initialParams: { formula: 'FAHRENHEIT', colormap: 'ironbow', rescale: '280,310', rescaleUnit: 'K' } });
        expect(select().element.value).toBe('FAHRENHEIT');
        expect(getRasterValueInfo).toHaveBeenLastCalledWith('hatcreek/clip.tif', { nodata: undefined, formula: 'FAHRENHEIT' });
        expect(last()).toEqual({ formula: 'FAHRENHEIT', colormap: 'ironbow', rescale: '280,310', rescaleUnit: 'K' });
    });

    it('a vegetation index of Plant Health on the same file is no unit', async () => {
        await mountThermal(KELVIN, KELVIN_IN, { initialParams: { formula: 'NDVI', colormap: 'rdylgn', rescale: '0,1' } });
        expect(select().element.value).toBe('KELVIN');
    });

    // FR-RAS-06
    it('says that the values of a raster in degrees Celsius are in the file, with its Unit select and no notice', async () => {
        await mountThermal(CELSIUS);
        expect(wrapper.find('[data-testid="raster-thermal-notice"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="raster-thermal-file-unit"]').text()).toBe('Values in °C from the file.');
        expect(select().exists()).toBe(true);
        expect(select().element.value).toBe('CELSIUS');
        expect(last().formula).toBe('CELSIUS');
        expect(range()).toBe('7.0 °C - 35.3 °C');
    });

    it('has the notice only for the raw counts of a sensor, and then no Unit select and no formula', async () => {
        await mountThermal(RAW_COUNTS);
        expect(wrapper.find('[data-testid="raster-thermal-notice"]').text()).toContain('No thermal calibration data: Showing raw values.');
        expect(wrapper.find('[data-testid="raster-thermal-file-unit"]').exists()).toBe(false);
        expect(select().exists()).toBe(false);
        expect(last()).toEqual({ colormap: 'ironbow', rescale: '14000,16000' });
        expect(range()).toMatch(/^14[,.\s\u00a0\u202f]?000 - 16[,.\s\u00a0\u202f]?000$/);
    });

    it('a calibrated raster has its Unit select, no notice and no "from the file" text', async () => {
        await mountThermal({ ...RAW_COUNTS, calibration: { planckB: 1501 }, unit: '', valueMin: 12.76, valueMax: 35.27 });
        expect(wrapper.find('[data-testid="raster-thermal-notice"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="raster-thermal-file-unit"]').exists()).toBe(false);
        expect(select().element.value).toBe('CELSIUS');
    });

    // The numbers are labelled with the unit the server says they are in: a server that did not apply the formula answers
    // the Kelvin raster in K to a request in °C, and a value read before the unit changed is in the unit it was read in
    it('labels each value with the unit of the answer, not with the unit selected', async () => {
        await mountThermal(KELVIN, { CELSIUS: KELVIN });
        await chooseUnit('CELSIUS');
        expect(select().element.value).toBe('CELSIUS');
        expect(range()).toBe('280.1 K - 308.4 K');

        await wrapper.setProps({
            areaStats: { ...STATS, min: 293.15, max: 295.4, mean: 294.0, median: 294.1, stddev: 1.25, unit: 'K', isThermal: true },
            spotInfo: { value: 284.6, unit: 'K', x: 4, y: 5, hasGeo: false },
            profile: { unit: 'K', samples: [{ distance: 0, value: 284.6 }] }
        });
        expect(statRows()).toContain('Min: 293.2 K');
        expect(statRows()).toContain('Std dev: 1.3 K');
        expect(byId('raster-spot-value').text()).toContain('284.6 K');
        expect(wrapper.findComponent({ name: 'RasterProfileChart' }).props('unit')).toBe('K');

        // An answer without a unit is in the unit selected
        await wrapper.setProps({ spotInfo: { value: 11.5, x: 4, y: 5, hasGeo: false }, profile: { samples: [] } });
        expect(byId('raster-spot-value').text()).toContain('11.5 °C');
        expect(wrapper.findComponent({ name: 'RasterProfileChart' }).props('unit')).toBe('°C');
    });

    it('labels no raw count of a sensor with a temperature unit, whatever the answer says', async () => {
        await mountThermal(RAW_COUNTS);
        await wrapper.setProps({ areaStats: { ...STATS, min: 14000, unit: '°C', isThermal: true } });
        expect(statRows().find(row => row.startsWith('Min'))).toMatch(/^Min: 14[,.\s\u00a0\u202f]?000$/);
    });

    // F5: the value info in the new unit fails: the panel says so and goes back to the unit it shows, with no unhandled error
    it('goes back to the unit it shows when the value info in the selected unit fails', async () => {
        const failure = new Error('Unknown formula: FAHRENHEIT');
        const getRasterValueInfo = vi.fn(async (path, options = {}) => {
            if (options.formula === 'FAHRENHEIT') throw failure;
            return { ...(options.formula ? KELVIN_IN[options.formula] : KELVIN) };
        });
        const notifyError = vi.fn();
        const errorHandler = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            wrapper = mount(RasterAnalysisControls, {
                props: { visible: true, dataset: { getRasterValueInfo }, filePath: 'hatcreek/clip.tif' },
                global: {
                    stubs: { RasterProfileChart: true, ColormapDropdown: true },
                    mocks: { $notify: { error: notifyError } },
                    config: { errorHandler }
                }
            });
            await flushPromises();
            await chooseUnit('CELSIUS');
            const emitted = wrapper.emitted('vizParamsChanged').length;

            await chooseUnit('FAHRENHEIT');
            expect(getRasterValueInfo).toHaveBeenLastCalledWith('hatcreek/clip.tif', { nodata: undefined, formula: 'FAHRENHEIT' });
            expect(notifyError).toHaveBeenCalledWith(failure, { summary: 'Unit' });
            expect(errorHandler).not.toHaveBeenCalled();
            expect(select().element.value).toBe('CELSIUS');
            expect(range()).toBe('7.0 °C - 35.3 °C');
            // The style of the layer is not changed to a unit the panel does not show
            expect(wrapper.emitted('vizParamsChanged').length).toBe(emitted);
            expect(last().formula).toBe('CELSIUS');
        } finally {
            consoleError.mockRestore();
        }
    });
});

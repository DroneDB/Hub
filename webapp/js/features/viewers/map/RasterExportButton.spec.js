/**
 * The one export control of Raster Analysis and Plant Health (FR-RAS-16, FR-PRC-15, FR-RAS-26, D-023): the styled raster as the
 * raster-export task with 'Queued…', 'Exporting n %' and Cancel, a toast and the download when it is ready, the visible
 * extent as a window, and a refusal for the size that is a focusable button with its reason as visible text. The sizes are
 * the examples of the SPEC (about 9.3 GB over a 1 GB limit), as literals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

const runHeavyTask = vi.fn();
const heavyTasks = ref({});
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask, heavyTasks }) }));
const confirmCancel = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirmCancel }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { forceRefresh: vi.fn().mockResolvedValue(undefined) } }));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('@/libs/notify', () => ({ notify }));
const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/libs/download', () => ({ downloadBlob }));
// The server features: the export limit, and whether the server exports a window (libddb 2.3)
const flags = vi.hoisted(() => ({ rasterExportWindow: true }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => 1073741824, get: name => flags[name] === true } } }));

const { default: RasterExportButton } = await import('./RasterExportButton.vue');
const { ESTIMATE_DELAY_MS } = await import('@/composables/useRasterExport');

const GIB = 1073741824;
const BBOX = [15.001865, 45.152744, 15.003662, 45.154011];
const SMALL = { estimatedExportBytes: 300 * 1024 * 1024, exportLimitBytes: GIB };
const HUGE = { estimatedExportBytes: 9985798963, exportLimitBytes: GIB };

let wrapper;
function makeDataset() {
    return {
        getRasterValueInfo: vi.fn(async () => ({ ...SMALL })),
        taskResult: vi.fn(async () => new Blob(['tif'])),
        cancelTask: vi.fn().mockResolvedValue({ deleted: true })
    };
}
function mountControl(props = {}, dataset = makeDataset()) {
    wrapper = mount(RasterExportButton, {
        props: { dataset, filePath: 'hatcreek/mosaic.tif', vizParams: { colormap: 'ironbow', rescale: '10,40', stretch: 'percentile' }, bbox: BBOX, info: SMALL, readEstimate: false, ...props },
        global: { plugins: [PrimeVue] }
    });
    return { wrapper, dataset };
}
const whole = () => wrapper.find('[data-testid="raster-export-whole"]');
const extent = () => wrapper.find('[data-testid="raster-export-extent"]');
const status = () => wrapper.find('[data-testid="heavy-task-status"]');

beforeEach(() => {
    flags.rasterExportWindow = true;
    runHeavyTask.mockReset();
    confirmCancel.mockReset();
    notify.success.mockClear();
    downloadBlob.mockClear();
    heavyTasks.value = {};
});
afterEach(() => {
    wrapper?.unmount();
    vi.useRealTimers();
});

/** A run whose task the test moves through its states, and ends */
function controlledRun() {
    let settle;
    runHeavyTask.mockImplementation((_dataset, _tool, options) => new Promise((resolve, reject) => {
        heavyTasks.value = { t1: { taskId: 't1', toolId: 'raster-export', state: 'Enqueued', percent: 0 } };
        options.onSubmitted({ taskId: 't1' });
        settle = {
            progress: entry => { heavyTasks.value = { t1: { taskId: 't1', toolId: 'raster-export', ...entry } }; },
            succeed: () => { const entry = { taskId: 't1', state: 'Succeeded', percent: 100 }; heavyTasks.value = { t1: entry }; resolve(entry); },
            end: entry => { heavyTasks.value = { t1: entry }; reject(Object.assign(new Error(`Task ${entry.state}`), { task: entry })); }
        };
    }));
    return () => settle;
}

describe('RasterExportButton the export of the whole raster', () => {
    it('says what the file is: the scaled bands without a formula, a styled image with one or with a colormap on one band, in the CRS of the file, not the values (FR-RAS-26)', async () => {
        // The default style of the tests has a colormap and no formula, on a raster not known to have one band: ddb scales the bands to 8 bits and applies no colormap
        mountControl();
        const bands = 'Export scaled bands (8-bit GeoTIFF, in the CRS of the file)';
        expect(whole().attributes('aria-label')).toBe(bands);
        expect(whole().attributes('title')).toBe(bands);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe(`${bands}: the bands scaled to 8 bits, not the values.`);
        expect(extent().attributes('aria-label')).toBe('Export visible extent');

        // A formula makes the RGBA image; the label follows the style as it changes
        const styled = 'Export styled image (RGBA GeoTIFF, in the CRS of the file)';
        await wrapper.setProps({ vizParams: { formula: 'CELSIUS', colormap: 'ironbow' } });
        expect(whole().attributes('aria-label')).toBe(styled);
        expect(whole().attributes('title')).toBe(styled);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe(`${styled}: the picture of the style, not the values.`);

        await wrapper.setProps({ vizParams: { colormap: 'ironbow' } });
        expect(whole().attributes('aria-label')).toBe(bands);

        // A colormap on a raster of one data band is the styled image too (ddb 2.3.1), several bands of it are not
        await wrapper.setProps({ singleBand: true });
        expect(whole().attributes('aria-label')).toBe(styled);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe(`${styled}: the picture of the style, not the values.`);
        await wrapper.setProps({ vizParams: { colormap: 'ironbow', bands: '1,2' } });
        expect(whole().attributes('aria-label')).toBe(bands);
    });

    it('folds its note behind an info button on a phone (U-415): the note stays the description of the buttons, the button shows it', async () => {
        mountControl({ vizParams: { formula: 'CELSIUS', colormap: 'ironbow' } });
        const note = wrapper.find('[data-testid="raster-export-note"]');
        const toggle = wrapper.find('[data-testid="raster-export-note-toggle"]');
        expect(toggle.attributes('aria-controls')).toBe(note.attributes('id'));
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(toggle.attributes('aria-label')).toBe('What the export writes');
        expect(note.classes()).not.toContain('is-open');
        // Folded or not it is in the page, and the buttons name it as their description
        expect(whole().attributes('aria-describedby')).toContain(note.attributes('id'));
        expect(extent().attributes('aria-describedby')).toContain(note.attributes('id'));

        await toggle.trigger('click');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(toggle.attributes('aria-label')).toBe('Hide what the export writes');
        expect(note.classes()).toContain('is-open');
        await toggle.trigger('click');
        expect(note.classes()).not.toContain('is-open');
    });

    it('folds the note only below the phone breakpoint: the button is hidden and the note shown on a wider screen', () => {
        const source = readSource(__dirname, 'RasterExportButton.vue');
        const style = source.slice(source.indexOf('<style scoped>'));
        const phone = mediaBlock(style, 'max-width: 767.98px');
        expect(ruleOf(style, '.export-note-toggle')).toMatch(/display:\s*none/);
        expect(ruleOf(phone, '.export-note-toggle')).toMatch(/display:\s*inline-flex/);
        expect(ruleOf(phone, '.export-note:not(.is-open)')).toMatch(/clip:\s*rect\(0, 0, 0, 0\)/);
        expect(ruleOf(phone, '.export-note:not(.is-open)')).not.toMatch(/display:\s*none/);
        // Outside the media query nothing hides the note
        expect(style.slice(0, style.indexOf('@media'))).not.toContain(':not(.is-open)');
    });

    it('submits the raster-export task with the style (not the stretch of the panel) and the file name, without a toast of its own', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        const { dataset } = mountControl();
        await whole().trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [passed, toolId, options] = runHeavyTask.mock.calls[0];
        expect(passed.taskResult).toBe(dataset.taskResult);
        expect(toolId).toBe('raster-export');
        expect(options).toMatchObject({
            path: 'hatcreek/mosaic.tif', notify: false,
            params: { path: 'hatcreek/mosaic.tif', colormap: 'ironbow', rescale: '10,40', fileName: 'mosaic_export.tif' }
        });
        expect(options.params).not.toHaveProperty('stretch');
        expect(options.params).not.toHaveProperty('bbox');
    });

    it('shows Queued…, then Exporting n %, then downloads the file and says it is ready (FR-PRC-15)', async () => {
        const run = controlledRun();
        const { dataset } = mountControl();
        await whole().trigger('click');
        await flushPromises();
        expect(status().text()).toContain('Queued…');

        run().progress({ state: 'Processing', phase: 'loading', percent: 0 });
        await flushPromises();
        expect(status().text()).toContain('Exporting');

        run().progress({ state: 'Processing', phase: 'rendering', percent: 42 });
        await flushPromises();
        expect(status().text()).toContain('Exporting');
        expect(status().text()).toContain('42%');
        expect(wrapper.find('.p-progressbar').exists()).toBe(true);

        run().progress({ state: 'Processing', waitingForNode: true, percent: 0 });
        await flushPromises();
        expect(status().text()).toContain('Queued…');

        run().succeed();
        await flushPromises();
        expect(dataset.taskResult).toHaveBeenCalledWith('t1');
        expect(downloadBlob).toHaveBeenCalledOnce();
        expect(downloadBlob.mock.calls[0][1]).toBe('mosaic_export.tif');
        expect(notify.success).toHaveBeenCalledWith('Export ready: mosaic_export.tif');
    });

    it('offers Cancel while it runs, asks, cancels the task and unlocks when it ends (FR-PRC-10)', async () => {
        confirmCancel.mockResolvedValue(true);
        const run = controlledRun();
        const { dataset } = mountControl();
        await whole().trigger('click');
        await flushPromises();
        // Busy: both exports wait, and say why
        expect(whole().attributes('aria-disabled')).toBe('true');
        expect(extent().attributes('aria-disabled')).toBe('true');

        await wrapper.find('[data-testid="heavy-task-cancel"]').trigger('click');
        await flushPromises();
        expect(confirmCancel).toHaveBeenCalledOnce();
        expect(dataset.cancelTask).toHaveBeenCalledWith('t1');

        run().end({ taskId: 't1', state: 'Deleted', cancelledBy: 'ann', percent: 0 });
        await flushPromises();
        expect(status().text()).toContain('Cancelled');
        expect(whole().attributes('aria-disabled')).toBeUndefined();
        expect(downloadBlob).not.toHaveBeenCalled();
        expect(notify.success).not.toHaveBeenCalledWith(expect.stringContaining('Export ready'));
    });

    it('shows the failure of the task and does not download', async () => {
        const run = controlledRun();
        mountControl();
        await whole().trigger('click');
        await flushPromises();
        run().end({ taskId: 't1', state: 'Failed', error: 'Cannot read the raster', percent: 10 });
        await flushPromises();
        expect(wrapper.find('[data-testid="heavy-task-error"]').text()).toBe('Cannot read the raster');
        expect(downloadBlob).not.toHaveBeenCalled();
    });

    it('starts one task on a double click', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        mountControl();
        await whole().trigger('click');
        await whole().trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
    });

    it('shows the refusal of the submit as the control words it, with the estimate and the limit of the Registry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        runHeavyTask.mockRejectedValue(Object.assign(new Error('Export output exceeds maximum allowed size (9.3 GB > 1 GB).'),
            { status: 400, estimatedExportBytes: 9985798963, exportLimitBytes: GIB }));
        mountControl();
        await whole().trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-testid="heavy-task-error"]').text()).toBe('Too large to export: about 9.3 GB > 1 GB limit');
        expect(whole().attributes('aria-disabled')).toBeUndefined();
    });
});

describe('RasterExportButton the visible extent', () => {
    it('submits the window of the map at the native resolution, under its own file name', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        mountControl();
        await extent().trigger('click');
        await flushPromises();
        const options = runHeavyTask.mock.calls[0][2];
        expect(options.params).toEqual({
            path: 'hatcreek/mosaic.tif', colormap: 'ironbow', rescale: '10,40', bbox: BBOX, fileName: 'mosaic_extent_export.tif'
        });
        expect(notify.success).toHaveBeenCalledWith('Export ready: mosaic_extent_export.tif');
    });

    it('stays available when the whole raster is over the limit, and exports in parts', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockResolvedValue({ estimatedExportBytes: 200 * 1024 * 1024, exportLimitBytes: GIB });
        vi.useFakeTimers();
        mountControl({ info: HUGE }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        await flushPromises();

        // The estimate of the window is read with the window
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('hatcreek/mosaic.tif', { nodata: undefined, bbox: BBOX });
        expect(whole().attributes('aria-disabled')).toBe('true');
        expect(extent().attributes('aria-disabled')).toBeUndefined();
        await extent().trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
    });

    it('is refused with the estimate of the window when the window is over the limit too', async () => {
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockResolvedValue({ estimatedExportBytes: 1503238554, exportLimitBytes: GIB });
        vi.useFakeTimers();
        mountControl({ info: HUGE }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        await flushPromises();

        expect(extent().attributes('aria-disabled')).toBe('true');
        expect(wrapper.find('[data-testid="raster-export-extent-reason"]').text()).toBe(
            'Too large to export the visible extent: about 1.4 GB > 1 GB limit. Zoom in to export less.');
        await extent().trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('does not read the estimate of the window when the whole raster fits (it is smaller)', async () => {
        const dataset = makeDataset();
        vi.useFakeTimers();
        mountControl({ info: SMALL }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
    });

    it('waits, with its reason, until the map says what it shows', async () => {
        mountControl({ bbox: null });
        expect(extent().attributes('aria-disabled')).toBe('true');
        expect(wrapper.find('[data-testid="raster-export-extent-reason"]').text()).toBe('The visible extent of the map is not known yet');
        await extent().trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();
    });
});

describe('RasterExportButton the visible extent while its estimate is read', () => {
    it('keeps the last estimate, says Checking size… and waits until the estimate of the new extent arrives', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockResolvedValue({ estimatedExportBytes: 200 * 1024 * 1024, exportLimitBytes: GIB });
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        mountControl({ info: HUGE }, dataset);
        // The first estimate is read: until then the button waits, with its reason
        expect(extent().attributes('aria-disabled')).toBe('true');
        expect(wrapper.find('[data-testid="raster-export-extent-reason"]').text()).toBe('Checking size…');
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        await flushPromises();
        expect(extent().attributes('aria-disabled')).toBeUndefined();
        expect(wrapper.find('[data-testid="raster-export-extent-reason"]').exists()).toBe(false);

        // The map moves: the new estimate is not read yet, so the button is not enabled on the old one, and does not flicker
        let answer;
        dataset.getRasterValueInfo.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
        await wrapper.setProps({ bbox: [15.0, 45.15, 15.01, 45.16] });
        for (const step of [0, ESTIMATE_DELAY_MS / 2, ESTIMATE_DELAY_MS + 50]) {
            await vi.advanceTimersByTimeAsync(step);
            expect(extent().attributes('aria-disabled')).toBe('true');
            const reason = wrapper.find('[data-testid="raster-export-extent-reason"]');
            expect(reason.text()).toBe('Checking size…');
            expect(extent().attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
        }
        await extent().trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();

        // The estimate of the new extent arrives: over the limit, with its size
        answer({ estimatedExportBytes: 1503238554, exportLimitBytes: GIB });
        await flushPromises();
        expect(wrapper.find('[data-testid="raster-export-extent-reason"]').text()).toBe(
            'Too large to export the visible extent: about 1.4 GB > 1 GB limit. Zoom in to export less.');
        expect(extent().attributes('aria-disabled')).toBe('true');
    });
});

describe('RasterExportButton on a server that exports no window (FR-XC-22)', () => {
    for (const [name, value] of [['false', false], ['missing (an older server)', undefined]]) {
        it(`keeps Visible extent focusable and disabled with the visible reason when the feature is ${name}, and never submits it`, async () => {
            flags.rasterExportWindow = value;
            const dataset = makeDataset();
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            mountControl({ info: HUGE }, dataset);
            await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
            await flushPromises();

            const button = extent();
            expect(button.element.tagName).toBe('BUTTON');
            expect(button.attributes('disabled')).toBeUndefined();
            expect(button.attributes('tabindex')).toBeUndefined();
            expect(button.attributes('aria-disabled')).toBe('true');
            const reason = wrapper.find('[data-testid="raster-export-extent-reason"]');
            expect(reason.text()).toBe('Needs a newer server (libddb 2.3)');
            expect(button.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
            expect(button.attributes('title')).toBe('Export visible extent: Needs a newer server (libddb 2.3)');
            // The whole raster over the limit does not point to an export this server cannot do
            expect(wrapper.find('[data-testid="raster-export-whole-reason"]').text()).toBe('Too large to export: about 9.3 GB > 1 GB limit.');
            // No estimate of a window is read
            expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();

            await button.trigger('click');
            await flushPromises();
            expect(runHeavyTask).not.toHaveBeenCalled();
        });
    }

    it('still exports the whole raster', async () => {
        flags.rasterExportWindow = false;
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        mountControl();
        expect(extent().attributes('aria-disabled')).toBe('true');
        await whole().trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(runHeavyTask.mock.calls[0][2].params).not.toHaveProperty('bbox');
    });
});

describe('RasterExportButton an export refused for its size (FR-XC-22)', () => {
    it('is a button that can be focused, with the reason as visible text and as its description', async () => {
        mountControl({ info: HUGE });
        const button = whole();
        expect(button.element.tagName).toBe('BUTTON');
        expect(button.attributes('disabled')).toBeUndefined();
        expect(button.attributes('tabindex')).toBeUndefined();
        expect(button.attributes('aria-disabled')).toBe('true');

        const reason = wrapper.find('[data-testid="raster-export-whole-reason"]');
        expect(reason.text()).toBe('Too large to export: about 9.3 GB > 1 GB limit. Use Visible extent to export it in parts.');
        expect(button.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
        expect(button.attributes('title')).toContain('Too large to export: about 9.3 GB > 1 GB limit');

        await button.trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('has no reason without a limit', () => {
        mountControl({ info: { estimatedExportBytes: 9985798963, exportLimitBytes: null } });
        expect(whole().attributes('aria-disabled')).toBeUndefined();
        expect(wrapper.find('[data-testid="raster-export-whole-reason"]').exists()).toBe(false);
    });

    it('falls back to the limit of the server features for a value info that has none', () => {
        mountControl({ info: { estimatedExportBytes: 9985798963 } });
        expect(wrapper.find('[data-testid="raster-export-whole-reason"]').text()).toContain('about 9.3 GB > 1 GB limit');
    });
});

describe('RasterExportButton the estimate of a panel that has no value info', () => {
    it('reads it once the control has rested, with the NoData value of the style', async () => {
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockResolvedValue({ ...HUGE });
        vi.useFakeTimers();
        mountControl({ info: null, readEstimate: true, vizParams: { colormap: 'rdylgn', nodata: 0 } }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS - 100);
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(150);
        vi.useRealTimers();
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('hatcreek/mosaic.tif', { nodata: 0 });
        expect(whole().attributes('aria-disabled')).toBe('true');
        expect(wrapper.find('[data-testid="raster-export-whole-reason"]').text()).toContain('Too large to export: about 9.3 GB > 1 GB limit');
    });

    it('lets the submit decide when the estimate cannot be read', async () => {
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockRejectedValue(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
        mountControl({ info: null, readEstimate: true }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        await flushPromises();
        expect(whole().attributes('aria-disabled')).toBeUndefined();
    });
});

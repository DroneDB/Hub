/**
 * The one export control of Raster Analysis and Plant Health (FR-RAS-16, FR-PRC-15, FR-RAS-26, D-023): an Export button with a
 * menu of the two exports, which run the styled raster as the raster-export task with 'Queued…', 'Exporting n %' and Cancel, a toast and the download when it is ready, the visible
 * extent as a window, and a refusal for the size that is a focusable button with its reason as visible text. The sizes are
 * the examples of the SPEC (about 9.3 GB over a 1 GB limit), as literals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { readSource, ruleOf } from '@/specs/cssSource';

const runHeavyTask = vi.fn();
const heavyTasks = ref({});
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask, heavyTasks }) }));
const confirmCancel = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirmCancel }));
vi.mock('@/libs/tasks/taskMonitor', () => import('@/specs/taskMonitorMock'));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('@/libs/notify', () => ({ notify }));
const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/libs/download', () => ({ downloadBlob }));
// The server features: the export limit
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => 1073741824 } } }));

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
        global: { plugins: [PrimeVue] },
        // In the page, so that the focus the menu moves can be read
        attachTo: document.body
    });
    return { wrapper, dataset };
}
/** Mounts the control with its menu open, as the items are only there while it is */
async function mountOpen(props = {}, dataset = makeDataset()) {
    const mounted = mountControl(props, dataset);
    await openMenu();
    return mounted;
}
/** The whole raster is over the limit and the estimate of the visible extent is in: the first item is off, the second is on */
async function mountWholeOff() {
    const dataset = makeDataset();
    dataset.getRasterValueInfo.mockResolvedValue({ estimatedExportBytes: 200 * 1024 * 1024, exportLimitBytes: GIB });
    vi.useFakeTimers();
    mountControl({ info: HUGE }, dataset);
    await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
    vi.useRealTimers();
    await flushPromises();
    expect(trigger().exists()).toBe(true);
}
const trigger = () => wrapper.find('[data-testid="raster-export-menu-btn"]');
const menu = () => wrapper.find('[role="menu"]');
// nextTick, not flushPromises: some tests run on fake timers, which the latter waits on
const openMenu = async () => { await trigger().trigger('click'); await nextTick(); await nextTick(); };
/**
 * A key as a browser handles it: the keydown, then, on a button, the click that Enter and Space are (unless the keydown
 * was taken). jsdom does not make that click, and a menu that took Enter or Space would answer twice in a browser.
 */
async function press(element, key) {
    const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    element.dispatchEvent(down);
    if (!down.defaultPrevented && (key === 'Enter' || key === ' ')) element.click();
    await flushPromises();
}
const whole = () => wrapper.find('[data-testid="raster-export-whole"]');
const extent = () => wrapper.find('[data-testid="raster-export-extent"]');
const status = () => wrapper.find('[data-testid="heavy-task-status"]');

beforeEach(() => {
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
        await mountOpen();
        const bands = 'Export scaled bands (8-bit GeoTIFF, in the CRS of the file)';
        expect(whole().attributes('aria-label')).toBe(bands);
        expect(whole().attributes('title')).toBe(bands);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe('The bands scaled to 8 bits, not the values.');
        expect(extent().attributes('aria-label')).toBe('Export visible extent');

        // A formula makes the RGBA image; the label follows the style as it changes
        const styled = 'Export styled image (RGBA GeoTIFF, in the CRS of the file)';
        await wrapper.setProps({ vizParams: { formula: 'CELSIUS', colormap: 'ironbow' } });
        expect(whole().attributes('aria-label')).toBe(styled);
        expect(whole().attributes('title')).toBe(styled);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe('The picture of the style, not the values.');

        await wrapper.setProps({ vizParams: { colormap: 'ironbow' } });
        expect(whole().attributes('aria-label')).toBe(bands);

        // A colormap on a raster of one data band is the styled image too (the rule of ddb), several bands of it are not
        await wrapper.setProps({ singleBand: true });
        expect(whole().attributes('aria-label')).toBe(styled);
        expect(wrapper.find('[data-testid="raster-export-note"]').text()).toBe('The picture of the style, not the values.');
        await wrapper.setProps({ vizParams: { colormap: 'ironbow', bands: '1,2' } });
        expect(whole().attributes('aria-label')).toBe(bands);
    });

    it('submits the raster-export task with the style (not the stretch of the panel) and the file name, without a toast of its own', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        const { dataset } = await mountOpen();
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
        const { dataset } = await mountOpen();
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
        const { dataset } = await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        // Busy: both exports wait, and say why; the menu closed when the export was chosen, and the status is outside it
        expect(menu().exists()).toBe(false);
        await openMenu();
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
        await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        run().end({ taskId: 't1', state: 'Failed', error: 'Cannot read the raster', percent: 10 });
        await flushPromises();
        expect(wrapper.find('[data-testid="heavy-task-error"]').text()).toBe('Cannot read the raster');
        expect(downloadBlob).not.toHaveBeenCalled();
    });

    it('starts one task on a double click', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        // The menu is shut; opened again, the export that runs keeps both items off
        await openMenu();
        await whole().trigger('click');
        await extent().trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(menu().exists()).toBe(true);
    });

    it('shows the refusal of the submit as the control words it, with the estimate and the limit of the Registry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        runHeavyTask.mockRejectedValue(Object.assign(new Error('Export output exceeds maximum allowed size (9.3 GB > 1 GB).'),
            { status: 400, estimatedExportBytes: 9985798963, exportLimitBytes: GIB }));
        await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-testid="heavy-task-error"]').text()).toBe('Too large to export: about 9.3 GB > 1 GB limit');
        await openMenu();
        expect(whole().attributes('aria-disabled')).toBeUndefined();
    });
});

describe('RasterExportButton the visible extent', () => {
    it('submits the window of the map at the native resolution, under its own file name', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        await mountOpen();
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
        await mountOpen({ info: HUGE }, dataset);
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
        await mountOpen({ info: HUGE }, dataset);
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
        await mountOpen({ info: SMALL }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
    });

    it('waits, with its reason, until the map says what it shows', async () => {
        await mountOpen({ bbox: null });
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
        await mountOpen({ info: HUGE }, dataset);
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

describe('RasterExportButton an export refused for its size (FR-XC-22)', () => {
    it('is a button that can be focused, with the reason as visible text and as its description', async () => {
        await mountOpen({ info: HUGE });
        const button = whole();
        expect(button.element.tagName).toBe('BUTTON');
        expect(button.attributes('disabled')).toBeUndefined();
        // Out of the tab order like every item of a menu (the arrows reach it), but not out of reach: it is not `disabled`
        expect(button.attributes('tabindex')).toBe('-1');
        expect(button.attributes('aria-disabled')).toBe('true');

        const reason = wrapper.find('[data-testid="raster-export-whole-reason"]');
        expect(reason.text()).toBe('Too large to export: about 9.3 GB > 1 GB limit. Use Visible extent to export it in parts.');
        expect(button.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
        expect(button.attributes('title')).toContain('Too large to export: about 9.3 GB > 1 GB limit');

        await button.trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('has no reason without a limit', async () => {
        await mountOpen({ info: { estimatedExportBytes: 9985798963, exportLimitBytes: null } });
        expect(whole().attributes('aria-disabled')).toBeUndefined();
        expect(wrapper.find('[data-testid="raster-export-whole-reason"]').exists()).toBe(false);
    });

    it('falls back to the limit of the server features for a value info that has none', async () => {
        await mountOpen({ info: { estimatedExportBytes: 9985798963 } });
        expect(wrapper.find('[data-testid="raster-export-whole-reason"]').text()).toContain('about 9.3 GB > 1 GB limit');
    });
});

describe('RasterExportButton the estimate of a panel that has no value info', () => {
    it('reads it once the control has rested, with the NoData value of the style', async () => {
        const dataset = makeDataset();
        dataset.getRasterValueInfo.mockResolvedValue({ ...HUGE });
        vi.useFakeTimers();
        await mountOpen({ info: null, readEstimate: true, vizParams: { colormap: 'rdylgn', nodata: 0 } }, dataset);
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
        await mountOpen({ info: null, readEstimate: true }, dataset);
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 50);
        vi.useRealTimers();
        await flushPromises();
        expect(whole().attributes('aria-disabled')).toBeUndefined();
    });
});

describe('RasterExportButton the menu button', () => {
    it('is the Export button of the footer row, with a menu that is not in the page until it is opened', async () => {
        mountControl();
        expect(wrapper.find('[data-testid="raster-export"]').classes()).toContain('raster-export');
        expect(trigger().element.tagName).toBe('BUTTON');
        expect(trigger().classes()).toEqual(expect.arrayContaining(['panel-btn', 'panel-btn--primary', 'footer-btn', 'footer-btn--end']));
        expect(trigger().find('.footer-label').text()).toBe('Export');
        expect(trigger().attributes('aria-haspopup')).toBe('menu');
        expect(trigger().attributes('aria-expanded')).toBe('false');
        expect(trigger().attributes('aria-controls')).toBeUndefined();
        expect(menu().exists()).toBe(false);
        expect(whole().exists()).toBe(false);

        await openMenu();
        expect(trigger().attributes('aria-expanded')).toBe('true');
        expect(trigger().attributes('aria-controls')).toBe(menu().attributes('id'));
        expect(wrapper.findAll('[role="menuitem"]').map(item => item.attributes('data-testid')))
            .toEqual(['raster-export-whole', 'raster-export-extent']);

        await openMenu();
        expect(trigger().attributes('aria-expanded')).toBe('false');
        expect(menu().exists()).toBe(false);
    });

    it('gives each item a visible name that is its accessible name, and a line that says how much it exports', async () => {
        await mountOpen({ vizParams: { formula: 'CELSIUS', colormap: 'ironbow' } });
        const styled = 'Export styled image (RGBA GeoTIFF, in the CRS of the file)';
        expect(whole().find('.export-item-name').text()).toBe(styled);
        expect(whole().attributes('aria-label')).toBe(styled);
        expect(whole().find('.export-item-detail').text()).toBe('The whole file');
        expect(extent().find('.export-item-name').text()).toBe('Export visible extent');
        expect(extent().attributes('aria-label')).toBe('Export visible extent');
        expect(extent().find('.export-item-detail').text()).toBe('What the map shows now');
        // The name follows the style, and stays the accessible name
        await wrapper.setProps({ vizParams: { colormap: 'ironbow' } });
        const bands = 'Export scaled bands (8-bit GeoTIFF, in the CRS of the file)';
        expect(whole().find('.export-item-name').text()).toBe(bands);
        expect(whole().attributes('aria-label')).toBe(bands);
    });

    it('shows why both items are off while an export runs, as their description', async () => {
        controlledRun();
        await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        await openMenu();
        for (const [item, testid] of [[whole(), 'raster-export-whole-unavailable'], [extent(), 'raster-export-extent-unavailable']]) {
            expect(item.attributes('aria-disabled')).toBe('true');
            const reason = item.find(`[data-testid="${testid}"]`);
            expect(reason.text()).toBe('An export is running');
            expect(item.attributes('aria-describedby').split(' ')).toContain(reason.attributes('id'));
        }
    });

    it('shows why both items are off without a raster', async () => {
        await mountOpen({ filePath: null });
        expect(whole().find('[data-testid="raster-export-whole-unavailable"]').text()).toBe('No raster to export');
        expect(extent().find('[data-testid="raster-export-extent-unavailable"]').text()).toBe('No raster to export');
    });

    it('shows the note of what the export writes as text at the foot of the menu, not behind a button', async () => {
        await mountOpen({ vizParams: { formula: 'CELSIUS', colormap: 'ironbow' } });
        const note = wrapper.find('[data-testid="raster-export-note"]');
        expect(note.text()).toBe('The picture of the style, not the values.');
        expect(wrapper.find('[data-testid="raster-export-menu"]').element.lastElementChild).toBe(note.element);
        expect(wrapper.find('[data-testid="raster-export-note-toggle"]').exists()).toBe(false);
        // The items name it as their description
        expect(whole().attributes('aria-describedby').split(' ')).toContain(note.attributes('id'));
        expect(extent().attributes('aria-describedby').split(' ')).toContain(note.attributes('id'));
    });

    it('shows the reason of an item that is off inside the item', async () => {
        await mountOpen({ info: HUGE });
        const reason = whole().find('[data-testid="raster-export-whole-reason"]');
        expect(reason.exists()).toBe(true);
        expect(reason.text()).toBe('Too large to export: about 9.3 GB > 1 GB limit. Use Visible extent to export it in parts.');
        expect(whole().classes()).toContain('is-disabled');
    });

    it('closes when an export is chosen, runs it, and gives the focus back to the button', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        await mountOpen();
        await extent().trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(menu().exists()).toBe(false);
        expect(trigger().attributes('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger().element);
    });
});

describe('RasterExportButton the keyboard', () => {
    it('opens on Enter, on Space and on the down arrow, with the first item that is on focused', async () => {
        for (const key of ['Enter', ' ', 'ArrowDown']) {
            // The whole raster is over the limit: the first item that is on is the visible extent
            await mountWholeOff();
            trigger().element.focus();
            await press(trigger().element, key);
            expect(menu().exists(), key).toBe(true);
            expect(trigger().attributes('aria-expanded'), key).toBe('true');
            expect(document.activeElement, key).toBe(extent().element);
            wrapper.unmount();
        }
    });

    it('focuses the first item when the first is on', async () => {
        mountControl();
        await press(trigger().element, 'ArrowDown');
        expect(document.activeElement).toBe(whole().element);
    });

    it('focuses the first item when none is on, so that its reason is read', async () => {
        mountControl({ info: HUGE, bbox: null });
        await press(trigger().element, 'ArrowDown');
        expect(whole().attributes('aria-disabled')).toBe('true');
        expect(extent().attributes('aria-disabled')).toBe('true');
        expect(document.activeElement).toBe(whole().element);
    });

    it('moves between the items with the arrows, around the ends, and with Home and End', async () => {
        await mountOpen();
        expect(document.activeElement).toBe(whole().element);
        await press(menu().element, 'ArrowDown');
        expect(document.activeElement).toBe(extent().element);
        await press(extent().element, 'ArrowDown');
        expect(document.activeElement).toBe(whole().element);
        await press(whole().element, 'ArrowUp');
        expect(document.activeElement).toBe(extent().element);
        await press(extent().element, 'Home');
        expect(document.activeElement).toBe(whole().element);
        await press(whole().element, 'End');
        expect(document.activeElement).toBe(extent().element);
    });

    it('reaches an item that is off with the arrows, and Enter on it does nothing', async () => {
        await mountWholeOff();
        await openMenu();
        expect(document.activeElement).toBe(extent().element);
        await press(extent().element, 'ArrowDown');
        expect(document.activeElement).toBe(whole().element);
        expect(whole().attributes('aria-disabled')).toBe('true');

        await press(whole().element, 'Enter');
        await press(whole().element, ' ');
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(menu().exists()).toBe(true);
        expect(document.activeElement).toBe(whole().element);
    });

    it('runs the export of the item that has the focus on Enter and on Space, and closes', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        await mountOpen();
        await press(whole().element, 'Enter');
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(menu().exists()).toBe(false);

        await press(trigger().element, 'ArrowDown');
        await press(menu().element, 'ArrowDown');
        expect(document.activeElement).toBe(extent().element);
        await press(extent().element, ' ');
        expect(runHeavyTask).toHaveBeenCalledTimes(2);
        expect(runHeavyTask.mock.calls[1][2].params.bbox).toEqual(BBOX);
        expect(menu().exists()).toBe(false);
    });

    it('closes on Escape, gives the focus back to the button, and does not pass the key on', async () => {
        const outside = vi.fn();
        document.addEventListener('keydown', outside);
        try {
            await mountOpen();
            await press(whole().element, 'Escape');
            expect(menu().exists()).toBe(false);
            expect(trigger().attributes('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger().element);
            expect(outside).not.toHaveBeenCalled();
        } finally {
            document.removeEventListener('keydown', outside);
        }
    });

    it('closes when the focus leaves it (Tab), not while it moves inside it', async () => {
        await mountOpen();
        await whole().trigger('focusout', { relatedTarget: extent().element });
        expect(menu().exists()).toBe(true);
        await extent().trigger('focusout', { relatedTarget: trigger().element });
        expect(menu().exists()).toBe(true);
        await extent().trigger('focusout', { relatedTarget: document.body });
        expect(menu().exists()).toBe(false);
    });

    it('closes on a press outside, not on one inside', async () => {
        await mountOpen();
        whole().element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(menu().exists()).toBe(true);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(menu().exists()).toBe(false);
    });

    it('focuses an item without scrolling the panel to it', async () => {
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');
        try {
            mountControl();
            await press(trigger().element, 'ArrowDown');
            expect(focus).toHaveBeenCalledWith({ preventScroll: true });
            expect(focus.mock.contexts).toContain(whole().element);
        } finally {
            focus.mockRestore();
        }
    });
});

describe('RasterExportButton the status of the export with the menu shut', () => {
    it('shows the task and Cancel in a status item of the footer row, and the spinner on the button, while the menu is closed', async () => {
        const run = controlledRun();
        await mountOpen();
        expect(trigger().find('.fa-spinner').exists()).toBe(false);
        expect(wrapper.find('.footer-status').classes()).toContain('is-idle');

        await whole().trigger('click');
        await flushPromises();
        expect(menu().exists()).toBe(false);
        const footerStatus = wrapper.find('.footer-status');
        expect(footerStatus.classes()).not.toContain('is-idle');
        expect(footerStatus.find('[data-testid="heavy-task-status"]').text()).toContain('Queued…');
        expect(footerStatus.find('[data-testid="heavy-task-cancel"]').exists()).toBe(true);
        expect(trigger().find('.fa-spinner').exists()).toBe(true);
        expect(trigger().find('.fa-download').exists()).toBe(false);

        run().succeed();
        await flushPromises();
        expect(trigger().find('.fa-spinner').exists()).toBe(false);
    });

    it('shows the error with the menu closed', async () => {
        const run = controlledRun();
        await mountOpen();
        await whole().trigger('click');
        await flushPromises();
        run().end({ taskId: 't1', state: 'Failed', error: 'Cannot read the raster', percent: 10 });
        await flushPromises();
        expect(menu().exists()).toBe(false);
        expect(wrapper.find('.footer-status [data-testid="heavy-task-error"]').text()).toBe('Cannot read the raster');
    });
});

describe('RasterExportButton in the footer row', () => {
    const style = readSource(__dirname, 'RasterExportButton.vue').split('<style scoped>')[1];

    it('has no box of its own: its parts are items of the footer row', () => {
        expect(ruleOf(style, '.raster-export')).toMatch(/display:\s*contents/);
    });

    it('draws the menu as a row of the footer above the button, in the flow, wrapping its text, never outside the panel', () => {
        const rule = ruleOf(style, '.export-menu');
        expect(rule).toMatch(/flex:\s*0 0 100%/);
        expect(rule).toMatch(/order:\s*-2/);
        expect(rule).toMatch(/min-width:\s*0/);
        for (const selector of ['.export-menu', '.export-item', '.export-item-text', '.export-item-detail', '.export-item-reason', '.export-note']) {
            expect(ruleOf(style, selector), selector).not.toMatch(/position:|white-space:\s*nowrap|(?<!-)width:\s*[\d.]+(px|rem|em)/);
        }
        expect(style).not.toMatch(/orange|ff9800/i);
    });
});

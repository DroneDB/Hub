import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import SplatTrainingExportDialog from './SplatTrainingExportDialog.vue';

const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
vi.mock('@/libs/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const startFileDownload = vi.fn();
vi.mock('@/features/viewers/splat/splatDownloads', () => ({ startFileDownload: (...args) => startFileDownload(...args) }));

const WindowStub = {
    props: ['confirmLabel', 'confirmDisabled', 'cancelLabel', 'busy'],
    emits: ['confirm', 'close'],
    template: '<div><slot /><button data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button><span data-cancel>{{ cancelLabel }}</span></div>'
};

const makeDataset = (children = [{ path: 'odm/cameras.json', type: ddb.entry.type.GENERIC }]) => ({
    list: vi.fn(async () => children),
    taskResultUrl: vi.fn(id => `/orgs/o/ds/d/tasks/${id}/result`)
});

function open(dataset = makeDataset(), entry = { path: 'odm', type: ddb.entry.type.DIRECTORY }) {
    return mount(SplatTrainingExportDialog, {
        props: { file: { entry }, dataset },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
}

describe('SplatTrainingExportDialog', () => {
    beforeEach(() => { runHeavyTask.mockReset(); startFileDownload.mockReset(); });
    afterEach(() => vi.clearAllMocks());

    it('starts from the defaults and the name of the folder, and warns when the folder is not an ODM project', async () => {
        const w = open(makeDataset([{ path: 'odm/a.tif', type: ddb.entry.type.GENERIC }]));
        await flushPromises();
        expect(w.find('#training-max-image-size').element.value).toBe('1600');
        expect(w.find('#training-max-points').element.value).toBe('100000');
        expect(w.find('#training-file-name').element.value).toBe('odm-training-data.zip');
        expect(w.text()).toContain('does not look like an ODM project');
    });

    it('does not warn for an ODM project', async () => {
        const w = open();
        await flushPromises();
        expect(w.text()).not.toContain('does not look like an ODM project');
    });

    it('submits the folder and the options, forced and without a toast of its own', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1', logTail: [] });
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [, toolId, options] = runHeavyTask.mock.calls[0];
        expect(toolId).toBe('splat-training-export');
        expect(options).toMatchObject({
            path: 'odm', force: true, notify: false,
            params: { maxImageSize: 1600, maxPoints: 100000, fileName: 'odm-training-data.zip' }
        });
    });

    it('submits the root of the dataset without a path', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1', logTail: [] });
        const w = open(makeDataset(), { path: '', type: ddb.entry.type.DRONEDB });
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        expect(runHeavyTask.mock.calls[0][2].path).toBeUndefined();
        expect(w.find('#training-file-name').element.value).toBe('dataset-training-data.zip');
    });

    it('does not submit options out of range and says which one', async () => {
        const w = open();
        await flushPromises();
        await w.find('#training-file-name').setValue('a/b.zip');
        expect(w.find('[data-confirm]').element.disabled).toBe(true);
        expect(w.text()).toContain('A file name, without folders.');
        await w.find('[data-confirm]').trigger('click');
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('shows the warnings of the log and offers the download when the task is done', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't9', logTail: ['Phase: images', 'Warning: 3 images have no pose', 'Warning: the flight looks straight down'] });
        const dataset = makeDataset();
        const w = open(dataset);
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(w.findAll('.warnings li').map(li => li.text())).toEqual(['3 images have no pose', 'the flight looks straight down']);
        expect(w.find('[data-confirm]').text()).toBe('Download');
        expect(w.find('a[href="/orgs/o/ds/d/tasks/t9/result"]').exists()).toBe(true);
        await w.find('[data-confirm]').trigger('click');
        expect(startFileDownload).toHaveBeenCalledWith('/orgs/o/ds/d/tasks/t9/result', 'odm-training-data.zip');
        expect(runHeavyTask).toHaveBeenCalledOnce();
    });

    it('shows the live warnings while the task runs', async () => {
        let progress;
        runHeavyTask.mockImplementation((_d, _t, options) => new Promise(() => { progress = options.onProgress; }));
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        progress({ percent: 42, phase: 'images', logTail: ['Warning: early'] });
        await flushPromises();
        expect(w.text()).toContain('early');
        expect(w.text()).toContain('images');
    });

    it('shows a failed task as a message and a toast, and lets the user try again', async () => {
        const { notify } = await import('@/libs/notify');
        runHeavyTask.mockRejectedValueOnce(new Error('cameras.json is missing'));
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(w.text()).toContain('cameras.json is missing');
        expect(notify.error).toHaveBeenCalled();
        expect(w.find('[data-confirm]').text()).toBe('Export');
        expect(w.find('[data-confirm]').element.disabled).toBe(false);
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import SplatTrainingExportDialog from './SplatTrainingExportDialog.vue';

const runHeavyTask = vi.fn();
const heavyTasks = ref({});
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask, heavyTasks }) }));

// The cancel question and what it reaches: answered by the test, the poller not asked
const confirmCancel = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirmCancel }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { forceRefresh: vi.fn().mockResolvedValue(undefined) } }));
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
    beforeEach(() => { runHeavyTask.mockReset(); startFileDownload.mockReset(); heavyTasks.value = {}; });
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

    it('submits the folder and the options, not forced (the Registry dedups it) and without a toast of its own', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1', logTail: [] });
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [, toolId, options] = runHeavyTask.mock.calls[0];
        expect(toolId).toBe('splat-training-export');
        expect(options).toMatchObject({
            path: 'odm', notify: false,
            params: { maxImageSize: 1600, maxPoints: 100000, fileName: 'odm-training-data.zip' }
        });
        expect(options.force).toBeUndefined();
    });

    it('starts one task on a double click, and is busy while it runs (FR-PRC-02)', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        const w = open();
        await flushPromises();
        // Two confirms in the same tick: the second one finds the dialog busy
        const window = w.findComponent(WindowStub);
        window.vm.$emit('confirm');
        window.vm.$emit('confirm');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(window.props('busy')).toBe(true);
        expect(w.find('[data-confirm]').element.disabled).toBe(true);
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
        let options;
        runHeavyTask.mockImplementation((_d, _t, o) => new Promise(() => { options = o; progress = o.onProgress; }));
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        heavyTasks.value = { t1: { taskId: 't1', state: 'Processing', percent: 42, phase: 'images' } };
        options.onSubmitted({ taskId: 't1' });
        progress({ percent: 42, phase: 'images', logTail: ['Warning: early'] });
        await flushPromises();
        expect(w.text()).toContain('early');
        expect(w.find('[data-testid="heavy-task-status"]').text()).toContain('images');
        expect(w.find('[data-testid="heavy-task-status"]').text()).toContain('42%');
    });

    it('shows a failed task as a message, with no toast while the dialog is open, and lets the user try again', async () => {
        const { notify } = await import('@/libs/notify');
        runHeavyTask.mockRejectedValueOnce(new Error('cameras.json is missing'));
        const w = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(w.text()).toContain('cameras.json is missing');
        expect(notify.error).not.toHaveBeenCalled();
        expect(w.find('[data-testid="heavy-task-status"]').text()).toContain('Failed');
        expect(w.find('[data-confirm]').text()).toBe('Export');
        expect(w.find('[data-confirm]').element.disabled).toBe(false);
    });
});

// ---- Cancel of a task that waits for a node or runs (FR-PRC-10, FR-XC-15) --------------------------------

describe('SplatTrainingExportDialog cancel', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmCancel.mockReset();
        heavyTasks.value = {};
    });

    /** A run that stays queued on a node, and its end: what the poller does when the task is cancelled */
    function queued() {
        let end;
        runHeavyTask.mockImplementation((_dataset, _tool, options) => new Promise((_resolve, reject) => {
            heavyTasks.value = { t1: { taskId: 't1', toolId: 'splat-training-export', state: 'Processing', waitingForNode: true, percent: 0 } };
            options.onSubmitted({ taskId: 't1' });
            end = () => {
                const entry = { taskId: 't1', state: 'Deleted', cancelledBy: 'ann', percent: 0 };
                heavyTasks.value = { t1: entry };
                reject(Object.assign(new Error('Task Deleted'), { task: entry }));
            };
        }));
        return () => end();
    }
    const cancelButton = w => w.find('[data-testid="heavy-task-cancel"]');

    async function start() {
        const end = queued();
        const dataset = Object.assign(makeDataset(), { cancelTask: vi.fn().mockResolvedValue({ deleted: true }) });
        const w = open(dataset);
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        return { w, dataset, end };
    }

    it('offers Cancel on a busy dialog whose task waits for a node, asks, cancels the task and unlocks when it ends', async () => {
        confirmCancel.mockResolvedValue(true);
        const { w, dataset, end } = await start();
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
        expect(w.find('[data-testid="heavy-task-status"]').text()).toContain('Queued…');

        await cancelButton(w).trigger('click');
        await flushPromises();

        expect(confirmCancel).toHaveBeenCalledOnce();
        expect(confirmCancel.mock.calls[0][0]).toMatchObject({ title: 'Cancel Task', danger: true });
        expect(confirmCancel.mock.calls[0][0].message).toContain('Splat training export');
        expect(dataset.cancelTask).toHaveBeenCalledWith('t1');

        end();
        await flushPromises();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
        expect(cancelButton(w).exists()).toBe(false);
        expect(w.find('[data-testid="heavy-task-status"]').text()).toContain('Cancelled');
    });

    it('cancels nothing when the user does not confirm, and the dialog stays busy', async () => {
        confirmCancel.mockResolvedValue(false);
        const { w, dataset } = await start();
        await cancelButton(w).trigger('click');
        await flushPromises();
        expect(dataset.cancelTask).not.toHaveBeenCalled();
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
    });
});

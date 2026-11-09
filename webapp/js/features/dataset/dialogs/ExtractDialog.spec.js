/**
 * Extract Archive (FR-PRC-02): one click starts one task, not forced, so the Registry's dedup and
 * output checks apply; the dialog is busy while it runs, and a refusal (409) shows the server's message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import ExtractDialog from './ExtractDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const runHeavyTask = vi.fn();
const heavyTasks = ref({});
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask, heavyTasks }) }));

// The cancel question and what it reaches: answered by the test, the poller not asked
const confirmCancel = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirmCancel }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { forceRefresh: vi.fn().mockResolvedValue(undefined) } }));

const WindowStub = {
    props: ['confirmLabel', 'confirmDisabled', 'busy'],
    emits: ['confirm', 'close'],
    template: '<div><slot /><button data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

function open() {
    const dataset = { list: vi.fn(async () => [{ path: 'archives', type: ddb.entry.type.DIRECTORY }]) };
    const w = mount(ExtractDialog, {
        props: { file: { entry: { path: 'archives/a.zip' } }, dataset },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub, FolderPicker: true } }
    });
    return { w, dataset };
}

describe('ExtractDialog submit', () => {
    beforeEach(() => { runHeavyTask.mockReset(); heavyTasks.value = {}; });

    it('starts one task on a double click, without force, and is busy while it runs', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        const { w } = open();
        await flushPromises();

        const window = w.findComponent(WindowStub);
        window.vm.$emit('confirm');
        window.vm.$emit('confirm');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [, toolId, options] = runHeavyTask.mock.calls[0];
        expect(toolId).toBe('archive-extract');
        expect(options.force).toBeUndefined();
        expect(options.params).toMatchObject({ sourcePath: 'archives/a.zip', destPath: 'archives', overwrite: false });
        // The task is named by the tool's label (FR-PRC-22): no path is sent only for that
        expect(options.path).toBeUndefined();
        expect(window.props('busy')).toBe(true);
    });

    it('shows the message of a refusal and submits nothing more', async () => {
        runHeavyTask.mockRejectedValue(new ApiError("A file or folder named 'a.txt' already exists in this folder", 409,
            { conflictPath: 'archives/a.txt' }));
        const { w } = open();
        await flushPromises();

        await w.find('[data-confirm]').trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(w.text()).toContain("A file or folder named 'a.txt' already exists in this folder");
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
    });

    // FR-PRC-30: the skipped entries are read from the log of the task and handed to the page that shows the toast
    it('closes with the entries the extraction skipped, named with their reason', async () => {
        runHeavyTask.mockResolvedValue({
            taskId: 't1',
            logTail: ['[10:00:02] Skipped: vectors/tool.exe (file type not allowed)\nExtraction complete: 8 extracted, 1 skipped']
        });
        const { w } = open();
        await flushPromises();

        await w.find('[data-confirm]').trigger('click');
        await flushPromises();

        const [action, result] = w.emitted('close')[0];
        expect(action).toBe('extracted');
        expect(result.destPath).toBe('archives');
        expect(result.summary).toEqual({
            extracted: 8,
            skipped: 1,
            entries: [{ path: 'vectors/tool.exe', reason: 'file type not allowed' }],
            more: 0
        });
    });

    it('closes with an empty summary when the task has no log', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't1' });
        const { w } = open();
        await flushPromises();

        await w.find('[data-confirm]').trigger('click');
        await flushPromises();

        expect(w.emitted('close')[0][1].summary.skipped).toBe(0);
    });
});

describe('ExtractDialog task status', () => {
    beforeEach(() => { runHeavyTask.mockReset(); heavyTasks.value = {}; });
    const status = w => w.find('[data-testid="heavy-task-status"]');

    it('shows the task queued, then the phase in words with the percent', async () => {
        runHeavyTask.mockImplementation((_dataset, _tool, options) => {
            heavyTasks.value = { t1: { taskId: 't1', state: 'Enqueued', percent: 0 } };
            options.onSubmitted({ taskId: 't1' });
            return new Promise(() => {});
        });
        const { w } = open();
        await flushPromises();
        expect(status(w).exists()).toBe(false);

        w.findComponent(WindowStub).vm.$emit('confirm');
        await flushPromises();
        expect(status(w).text()).toContain('Queued…');

        heavyTasks.value = { t1: { taskId: 't1', state: 'Processing', phase: 'extracting', percent: 30 } };
        await flushPromises();
        expect(status(w).text()).toContain('Extracting files…');
        expect(status(w).text()).toContain('30%');
    });

    it('shows the reason of a failed task, and the dialog stays open and free', async () => {
        runHeavyTask.mockImplementation((_dataset, _tool, options) => {
            const entry = { taskId: 't1', state: 'Failed', percent: 100, error: 'The archive is damaged' };
            heavyTasks.value = { t1: entry };
            options.onSubmitted({ taskId: 't1' });
            return Promise.reject(Object.assign(new Error(entry.error), { task: entry }));
        });
        const { w } = open();
        await flushPromises();
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();

        expect(status(w).text()).toContain('The archive is damaged');
        expect(w.emitted('close')).toBeUndefined();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
    });
});

// ---- Cancel of a task that waits for a node or runs (FR-PRC-10, FR-XC-15) --------------------------------

describe('ExtractDialog cancel', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmCancel.mockReset();
        heavyTasks.value = {};
    });

    /** A run that stays queued on a node, and its end: what the poller does when the task is cancelled */
    function queued() {
        let end;
        runHeavyTask.mockImplementation((_dataset, _tool, options) => new Promise((_resolve, reject) => {
            heavyTasks.value = { t1: { taskId: 't1', toolId: 'archive-extract', state: 'Processing', waitingForNode: true, percent: 0 } };
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
        const { w, dataset } = open();
        dataset.cancelTask = vi.fn().mockResolvedValue({ deleted: true });
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
        expect(confirmCancel.mock.calls[0][0]).toMatchObject({ title: 'Cancel Task', danger: true, warningMessage: 'The files extracted so far are deleted.' });
        expect(confirmCancel.mock.calls[0][0].message).toContain('Extract archive');
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

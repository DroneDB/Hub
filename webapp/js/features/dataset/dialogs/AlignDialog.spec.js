/**
 * Align (FR-PRC-02, FR-PRC-04): one click starts one align task, not forced, and the dialog is busy
 * while it runs; the proposed output is a free name, an existing name is announced and replaced only
 * after the user confirmed it (also after a 409 with conflictPath, once), and the source or the
 * reference is not accepted as output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import AlignDialog from './AlignDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const runHeavyTask = vi.fn();
const heavyTasks = ref({});
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask, heavyTasks }) }));
const confirmReplace = vi.fn();
vi.mock('@/composables/useConfirmReplace', async importOriginal => ({
    ...(await importOriginal()), useConfirmReplace: () => confirmReplace
}));

// The cancel question and what it reaches: answered by the test, the poller not asked
const confirmCancel = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirmCancel }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { forceRefresh: vi.fn().mockResolvedValue(undefined) } }));

const WindowStub = { props: ['busy'], template: '<div><slot /><slot name="footer" /></div>' };
const SOURCE = 'align/sheffield_shifted.tif';
const REFERENCE = 'align/sheffield_ref.tif';
const raster = path => ({ entry: { path, type: ddb.entry.type.GEORASTER } });

// entries: what the listing in view shows; folder: what the Registry lists (dataset.list), read after a 409
async function open({ entries = [], folder = [] } = {}) {
    const dataset = {
        validateAlignRaster: vi.fn().mockResolvedValue({ ok: true, summary: { overlapPercent: 90, sourceGsdM: 0.05 } }),
        list: vi.fn().mockResolvedValue(folder)
    };
    const w = mount(AlignDialog, {
        props: { sourceEntry: raster(SOURCE), dataset, allEntries: [raster(SOURCE), raster(REFERENCE), ...entries] },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    w.vm.selectedReference = REFERENCE;
    await w.vm.validate();
    await flushPromises();
    return w;
}

const alignButton = w => w.findAll('button').find(b => b.text().includes('Align'));
const output = w => w.find('#align-dialog-output-file-name');
const alignCalls = () => runHeavyTask.mock.calls.filter(c => c[1] === 'align-raster');
const conflict = path => new ApiError(`A file or folder named '${path}' already exists in this folder`, 409, { conflictPath: path });

describe('AlignDialog submit', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmReplace.mockReset();
        heavyTasks.value = {};
    });

    it('starts one task on a double click, without force, and is busy while it runs', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        const w = await open();

        const button = alignButton(w);
        button.trigger('click');
        button.trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [, toolId, options] = runHeavyTask.mock.calls[0];
        expect(toolId).toBe('align-raster');
        expect(options.force).toBeUndefined();
        expect(options.params).toEqual({
            sourcePath: SOURCE, referencePath: REFERENCE, outputPath: 'align/sheffield_shifted_aligned.tif',
            mode: 'similarity', overwrite: false
        });
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
        expect(alignButton(w).element.disabled).toBe(true);
    });

    it('proposes a free name, and warns when the typed name exists', async () => {
        const w = await open({ entries: [raster('align/Sheffield_Shifted_Aligned.tif')] });

        expect(output(w).element.value).toBe('align/sheffield_shifted_aligned (2).tif');
        expect(w.text()).not.toContain('This file exists and will be replaced');

        await output(w).setValue('align/sheffield_shifted_aligned.tif');
        expect(w.text()).toContain('This file exists and will be replaced');
        expect(alignButton(w).element.disabled).toBe(false);
    });

    it('marks the source or the reference as output invalid, and does not submit them', async () => {
        const w = await open();

        await output(w).setValue('align/SHEFFIELD_shifted.tif');
        expect(w.find('.hint-error').text()).toBe('The output cannot be the source file');
        expect(output(w).classes()).toContain('p-invalid');
        expect(alignButton(w).element.disabled).toBe(true);

        await output(w).setValue(REFERENCE);
        expect(w.find('.hint-error').text()).toBe('The output cannot be the reference file');
        await w.vm.startAlign();
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('replaces an existing file only after the user confirmed it', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't', state: 'Succeeded', logTail: [] });
        confirmReplace.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const w = await open({ entries: [raster('align/out.tif')] });
        await output(w).setValue('align/OUT.tif');

        await alignButton(w).trigger('click');
        await flushPromises();
        expect(confirmReplace).toHaveBeenCalledWith('align/out.tif');
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);

        await alignButton(w).trigger('click');
        await flushPromises();
        expect(alignCalls()).toHaveLength(1);
        expect(alignCalls()[0][2].params).toMatchObject({ outputPath: 'align/OUT.tif', overwrite: true });
        // The Registry wrote the existing entry: the build and the page use its path
        const build = runHeavyTask.mock.calls.find(c => c[1] === 'build')[2];
        expect(build).toMatchObject({ path: 'align/out.tif', params: { path: 'align/out.tif' } });
        expect(w.emitted('aligned')[0]).toEqual([{ outputPath: 'align/out.tif', result: null }]);
        expect(w.emitted('close')).toBeUndefined();
    });

    it('asks once when the Registry finds the file at the submit (409 conflictPath), then resubmits with overwrite', async () => {
        runHeavyTask.mockRejectedValueOnce(conflict('align/Sheffield_Shifted_Aligned.tif'))
            .mockResolvedValue({ taskId: 't', state: 'Succeeded', logTail: [] });
        confirmReplace.mockResolvedValue(true);
        const w = await open({ folder: [{ path: 'align/Sheffield_Shifted_Aligned.tif', type: ddb.entry.type.GEORASTER }] });

        await alignButton(w).trigger('click');
        await flushPromises();

        expect(confirmReplace).toHaveBeenCalledOnce();
        expect(confirmReplace).toHaveBeenCalledWith('align/Sheffield_Shifted_Aligned.tif');
        expect(alignCalls()).toHaveLength(2);
        expect(alignCalls()[0][2].params.overwrite).toBe(false);
        expect(alignCalls()[1][2].params.overwrite).toBe(true);
        expect(runHeavyTask.mock.calls.find(c => c[1] === 'build')[2].path).toBe('align/Sheffield_Shifted_Aligned.tif');
        expect(w.emitted('aligned')[0]).toEqual([{ outputPath: 'align/Sheffield_Shifted_Aligned.tif', result: null }]);
        expect(w.emitted('close')).toBeUndefined();
    });

    it('does not offer to replace a folder the Registry found at the submit: it shows the clash', async () => {
        runHeavyTask.mockRejectedValue(conflict('align/sheffield_shifted_aligned.tif'));
        const w = await open({ folder: [{ path: 'align/sheffield_shifted_aligned.tif', type: ddb.entry.type.DIRECTORY }] });

        await alignButton(w).trigger('click');
        await flushPromises();

        expect(confirmReplace).not.toHaveBeenCalled();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(w.text()).toContain("A file or folder named 'align/sheffield_shifted_aligned.tif' already exists in this folder");
    });

    it('resubmits only once, and shows a second refusal', async () => {
        runHeavyTask.mockRejectedValue(conflict('align/sheffield_shifted_aligned.tif'));
        confirmReplace.mockResolvedValue(true);
        const w = await open();

        await alignButton(w).trigger('click');
        await flushPromises();

        expect(alignCalls()).toHaveLength(2);
        expect(w.text()).toContain("A file or folder named 'align/sheffield_shifted_aligned.tif' already exists in this folder");
        expect(w.emitted('close')).toBeUndefined();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
    });

    it('shows the message of another 409 or a 503 without asking', async () => {
        runHeavyTask.mockRejectedValueOnce(new ApiError('The dataset is busy: try again', 503));
        const w = await open();

        await alignButton(w).trigger('click');
        await flushPromises();

        expect(w.text()).toContain('The dataset is busy: try again');
        expect(confirmReplace).not.toHaveBeenCalled();
        expect(runHeavyTask).toHaveBeenCalledOnce();
    });
});

// ---- The result stays until the user closes the window (FR-PRC-11, FR-XC-15) ---------------------------

const RESULT_LINE = '[14:22:01] ' + JSON.stringify({ success: true, tx: -3, ty: 2, thetaDeg: 0, scale: 1, confidence: 1 });
const status = w => w.findAll('[data-testid="heavy-task-status"]');

/** A run whose align and build both succeed: the entries are the ones useHeavyTask keeps */
function succeeds() {
    runHeavyTask.mockImplementation(async (_dataset, tool, options) => {
        const entry = tool === 'build'
            ? { taskId: 'b1', state: 'Succeeded', percent: 100, logTail: [] }
            : { taskId: 'a1', state: 'Succeeded', percent: 100, logTail: ['Phase: align', RESULT_LINE] };
        heavyTasks.value = { ...heavyTasks.value, [entry.taskId]: entry };
        options.onSubmitted({ taskId: entry.taskId });
        return entry;
    });
}

describe('AlignDialog result', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmReplace.mockReset();
        heavyTasks.value = {};
    });

    it('stays open with the result after both tasks succeed, tells the page, and closes only on Close', async () => {
        succeeds();
        const w = await open();
        await alignButton(w).trigger('click');
        await flushPromises();

        expect(w.emitted('close')).toBeUndefined();
        expect(w.emitted('aligned')).toEqual([[{
            outputPath: 'align/sheffield_shifted_aligned.tif',
            result: { success: true, tx: -3, ty: 2, thetaDeg: 0, scale: 1, confidence: 1 }
        }]]);
        expect(w.find('[data-testid="align-result"]').text())
            .toBe('Aligned - tx=-3.000 m, ty=2.000 m, θ=0.000°, s=1.00000, conf=1.00');
        expect(w.find('[data-testid="align-done"]').text()).toBe('Output saved as align/sheffield_shifted_aligned.tif');
        // The align and the build rows show the state of their task
        expect(status(w).map(row => row.text())).toEqual(['AlignDone', 'BuildDone']);
        const close = w.findAll('button').find(b => b.text() === 'Close');
        expect(close.element.disabled).toBe(false);
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);

        await close.trigger('click');
        expect(w.emitted('close')).toEqual([['close']]);
    });

    it('offers Open on map once done, which closes the window with the output', async () => {
        succeeds();
        const w = await open();
        expect(w.findAll('button').some(b => b.text() === 'Open on map')).toBe(false);
        await alignButton(w).trigger('click');
        await flushPromises();

        await w.findAll('button').find(b => b.text() === 'Open on map').trigger('click');
        expect(w.emitted('close')).toEqual([['map', { outputPath: 'align/sheffield_shifted_aligned.tif' }]]);
    });

    it('shows the build as running while the align result is already there, and keeps the window busy', async () => {
        runHeavyTask.mockImplementation(async (_dataset, tool, options) => {
            if (tool === 'build') {
                heavyTasks.value = { ...heavyTasks.value, b1: { taskId: 'b1', state: 'Processing', percent: 0, phase: 'Indexing' } };
                options.onSubmitted({ taskId: 'b1' });
                return new Promise(() => {});
            }
            const entry = { taskId: 'a1', state: 'Succeeded', percent: 100, logTail: [RESULT_LINE] };
            heavyTasks.value = { ...heavyTasks.value, a1: entry };
            options.onSubmitted({ taskId: 'a1' });
            return entry;
        });
        const w = await open();
        await alignButton(w).trigger('click');
        await flushPromises();

        expect(status(w).map(row => row.text())).toEqual(['AlignDone', 'BuildIndexingCancel']);
        expect(w.emitted('aligned')).toBeUndefined();
        expect(w.find('[data-testid="align-done"]').exists()).toBe(false);
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
        expect(w.findAll('button').find(b => b.text() === 'Close').element.disabled).toBe(true);
    });

    it('shows a failed build in its row, keeps the result and still tells the page about the output', async () => {
        runHeavyTask.mockImplementation(async (_dataset, tool, options) => {
            const failed = tool === 'build';
            const entry = failed
                ? { taskId: 'b1', state: 'Failed', percent: 100, error: 'Cannot build the tiles', logTail: [] }
                : { taskId: 'a1', state: 'Succeeded', percent: 100, logTail: [RESULT_LINE] };
            heavyTasks.value = { ...heavyTasks.value, [entry.taskId]: entry };
            options.onSubmitted({ taskId: entry.taskId });
            if (failed) throw Object.assign(new Error(entry.error), { task: entry });
            return entry;
        });
        const w = await open();
        await alignButton(w).trigger('click');
        await flushPromises();

        expect(status(w)[1].text()).toContain('Cannot build the tiles');
        expect(status(w)[1].text()).not.toContain('100%');
        expect(w.find('[data-testid="align-result"]').exists()).toBe(true);
        expect(w.emitted('aligned')).toHaveLength(1);
        expect(w.emitted('close')).toBeUndefined();
    });

    it('shows a failed align in its row with the reason, and no result', async () => {
        runHeavyTask.mockImplementation(async (_dataset, _tool, options) => {
            const entry = { taskId: 'a1', state: 'Failed', percent: 100, error: 'The rasters do not overlap' };
            heavyTasks.value = { a1: entry };
            options.onSubmitted({ taskId: 'a1' });
            throw Object.assign(new Error(entry.error), { task: entry });
        });
        const w = await open();
        await alignButton(w).trigger('click');
        await flushPromises();

        expect(status(w).map(row => row.text())).toEqual(['AlignFailedThe rasters do not overlap']);
        expect(w.find('[data-testid="align-result"]').exists()).toBe(false);
        expect(w.emitted('aligned')).toBeUndefined();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
    });

    it('scrolls the result into view when it appears', async () => {
        succeeds();
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        try {
            const w = await open();
            await alignButton(w).trigger('click');
            await flushPromises();
            expect(scrollIntoView).toHaveBeenCalledOnce();
            expect(scrollIntoView.mock.contexts[0]).toBe(w.find('[data-testid="align-result"]').element);
        } finally {
            delete Element.prototype.scrollIntoView;
        }
    });

    it('scrolls the result into view as soon as it is there, while the build still runs', async () => {
        runHeavyTask.mockImplementation(async (_dataset, tool, options) => {
            if (tool === 'build') {
                options.onSubmitted({ taskId: 'b1' });
                return new Promise(() => {});
            }
            options.onSubmitted({ taskId: 'a1' });
            return { taskId: 'a1', state: 'Succeeded', percent: 100, logTail: [RESULT_LINE] };
        });
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        try {
            const w = await open();
            await alignButton(w).trigger('click');
            await flushPromises();
            // The build has not ended: the window is busy, and the result is already in view
            expect(w.findComponent(WindowStub).props('busy')).toBe(true);
            expect(w.find('[data-testid="align-done"]').exists()).toBe(false);
            expect(scrollIntoView).toHaveBeenCalledOnce();
            expect(scrollIntoView.mock.contexts[0]).toBe(w.find('[data-testid="align-result"]').element);
        } finally {
            delete Element.prototype.scrollIntoView;
        }
    });

    it('forgets the result when another reference is chosen', async () => {
        succeeds();
        const w = await open();
        await alignButton(w).trigger('click');
        await flushPromises();
        expect(w.find('[data-testid="align-result"]').exists()).toBe(true);

        w.vm.onReferenceChange();
        await flushPromises();
        expect(w.find('[data-testid="align-result"]').exists()).toBe(false);
        expect(status(w)).toHaveLength(0);
        expect(w.findAll('button').some(b => b.text() === 'Open on map')).toBe(false);
    });
});

// ---- Cancel of a task that waits for a node or runs (FR-PRC-10, FR-XC-15) --------------------------------

describe('AlignDialog cancel', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmCancel.mockReset();
        heavyTasks.value = {};
    });

    /** A run that stays queued, and its end: what the poller does when the task is cancelled */
    function queued() {
        let end;
        runHeavyTask.mockImplementation((_dataset, _tool, options) => new Promise((_resolve, reject) => {
            heavyTasks.value = { t1: { taskId: 't1', toolId: 'align-raster', state: 'Processing', waitingForNode: true, percent: 0 } };
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

    async function startAlign() {
        const end = queued();
        const w = await open();
        w.props('dataset').cancelTask = vi.fn().mockResolvedValue({ deleted: true });
        await alignButton(w).trigger('click');
        await flushPromises();
        return { w, end };
    }

    it('offers Cancel on a busy dialog whose task waits for a node, asks, cancels the task and unlocks when it ends', async () => {
        confirmCancel.mockResolvedValue(true);
        const { w, end } = await startAlign();
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);

        await cancelButton(w).trigger('click');
        await flushPromises();

        expect(confirmCancel.mock.calls[0][0]).toMatchObject({ title: 'Cancel Task', danger: true, warningMessage: 'The output written so far is deleted.' });
        expect(confirmCancel.mock.calls[0][0].message).toContain('Align GeoTIFF');
        expect(w.props('dataset').cancelTask).toHaveBeenCalledWith('t1');

        end();
        await flushPromises();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
        expect(alignButton(w).element.disabled).toBe(false);
        expect(w.emitted('aligned')).toBeUndefined();
    });

    it('cancels nothing when the user does not confirm', async () => {
        confirmCancel.mockResolvedValue(false);
        const { w } = await startAlign();
        await cancelButton(w).trigger('click');
        await flushPromises();
        expect(w.props('dataset').cancelTask).not.toHaveBeenCalled();
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
    });

});

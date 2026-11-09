/**
 * Align (FR-PRC-02, FR-PRC-04): one click starts one align task, not forced, and the dialog is busy
 * while it runs; the proposed output is a free name, an existing name is announced and replaced only
 * after the user confirmed it (also after a 409 with conflictPath, once), and the source or the
 * reference is not accepted as output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import AlignDialog from './AlignDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
const confirmReplace = vi.fn();
vi.mock('@/composables/useConfirmReplace', async importOriginal => ({
    ...(await importOriginal()), useConfirmReplace: () => confirmReplace
}));

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
        expect(w.emitted('close')[0]).toEqual(['aligned', { outputPath: 'align/out.tif' }]);
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
        expect(w.emitted('close')[0]).toEqual(['aligned', { outputPath: 'align/Sheffield_Shifted_Aligned.tif' }]);
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

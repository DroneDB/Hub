import { describe, it, expect, vi } from 'vitest';
import { exportReportPdf, publishedCopyExists } from '@/libs/reports/pdf/pdfExport';

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const model = { name: 'North Pit' };
const FILE = 'north-pit-2026-11-05.pdf';
const blob = new Blob(['%PDF']);

function setup({ existing = [], dataset: extra = {}, generate } = {}) {
    const dataset = {
        list: vi.fn(async () => existing.map(path => ({ path }))),
        writeObj: vi.fn(async () => ({})),
        ...extra
    };
    const save = vi.fn();
    const confirmReplace = vi.fn(async () => true);
    const controller = new AbortController();
    const make = generate ?? vi.fn(async () => blob);
    const run = (mode, more = {}) => exportReportPdf({ mode, model, uid: 'r_1', dataset, signal: controller.signal, now: NOW, generate: make, save, confirmReplace, ...more });
    return { dataset, save, confirmReplace, controller, make, run };
}

const conflict = () => Object.assign(new Error('exists'), { status: 409 });

describe('the download', () => {
    it('saves the PDF under <slug>-<date>.pdf', async () => {
        const { run, save, dataset } = setup();
        expect(await run('download')).toEqual({ status: 'downloaded', fileName: FILE });
        expect(save).toHaveBeenCalledWith(blob, FILE);
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(dataset.list).not.toHaveBeenCalled();
    });

    it('saves nothing when it is cancelled while the PDF is made', async () => {
        const controller = new AbortController();
        const generate = vi.fn(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError'); });
        const { save } = setup({ generate });
        const result = await exportReportPdf({ mode: 'download', model, uid: 'r_1', dataset: {}, signal: controller.signal, now: NOW, generate, save });
        expect(result.status).toBe('cancelled');
        expect(save).not.toHaveBeenCalled();
    });

    it('saves nothing when the cancel comes just as the PDF is done', async () => {
        const controller = new AbortController();
        const generate = vi.fn(async () => { controller.abort(); return blob; });
        const { save } = setup({ generate });
        const result = await exportReportPdf({ mode: 'download', model, uid: 'r_1', dataset: {}, signal: controller.signal, now: NOW, generate, save });
        expect(result.status).toBe('cancelled');
        expect(save).not.toHaveBeenCalled();
    });

    it('passes a failure that is no cancel on', async () => {
        const { run } = setup({ generate: vi.fn(async () => { throw new Error('out of memory'); }) });
        await expect(run('download')).rejects.toThrow('out of memory');
    });

    it('tells when the PDF starts to be made, and gives the generator the progress callback', async () => {
        const { run, make } = setup();
        const onGenerating = vi.fn();
        const onProgress = vi.fn();
        await run('download', { onGenerating, onProgress });
        expect(onGenerating).toHaveBeenCalledTimes(1);
        expect(make.mock.calls[0][1].onProgress).toBe(onProgress);
    });

    it('names the PDF by the uid when the name makes no slug', async () => {
        const { save } = setup();
        const result = await exportReportPdf({ mode: 'download', model: { name: ' ' }, uid: 'r_k3x9q2m7', dataset: {}, signal: new AbortController().signal, now: NOW, generate: async () => blob, save });
        expect(result.fileName).toBe('r_k3x9q2m7-2026-11-05.pdf');
    });
});

describe('Publish PDF', () => {
    it('writes reports/<file> at the root of the dataset, replacing nothing', async () => {
        const { run, dataset, confirmReplace, save } = setup();
        expect(await run('publish')).toEqual({ status: 'published', fileName: FILE, path: `reports/${FILE}` });
        expect(dataset.list).toHaveBeenCalledWith('reports');
        expect(dataset.writeObj).toHaveBeenCalledWith(`reports/${FILE}`, blob, { overwrite: false });
        expect(confirmReplace).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });

    it('publishes when the reports folder is not there yet', async () => {
        const { run, dataset } = setup({ dataset: { list: vi.fn(async () => { throw Object.assign(new Error('nf'), { status: 404 }); }) } });
        expect((await run('publish')).status).toBe('published');
        expect(dataset.writeObj).toHaveBeenCalled();
    });

    it('asks Replace or Cancel when the file is there, before it makes the PDF', async () => {
        const { run, confirmReplace, make, dataset } = setup({ existing: [`reports/${FILE}`] });
        await run('publish');
        expect(confirmReplace).toHaveBeenCalledWith(`reports/${FILE}`);
        expect(confirmReplace.mock.invocationCallOrder[0]).toBeLessThan(make.mock.invocationCallOrder[0]);
        // Replace overwrites
        expect(dataset.writeObj).toHaveBeenCalledWith(`reports/${FILE}`, blob, { overwrite: true });
    });

    it('compares the name without regard to letter case, as the Registry does', async () => {
        const { run, confirmReplace } = setup({ existing: [`Reports/${FILE.toUpperCase()}`] });
        await run('publish');
        expect(confirmReplace).toHaveBeenCalled();
    });

    it('does not ask for another file of the folder', async () => {
        const { run, confirmReplace } = setup({ existing: ['reports/other-2026-11-05.pdf'] });
        await run('publish');
        expect(confirmReplace).not.toHaveBeenCalled();
    });

    it('makes nothing and writes nothing when the answer is Cancel', async () => {
        const { run, confirmReplace, make, dataset } = setup({ existing: [`reports/${FILE}`] });
        confirmReplace.mockResolvedValue(false);
        expect(await run('publish')).toEqual({ status: 'cancelled', fileName: FILE });
        expect(make).not.toHaveBeenCalled();
        expect(dataset.writeObj).not.toHaveBeenCalled();
    });

    it('writes nothing when it is cancelled while the PDF is made', async () => {
        const controller = new AbortController();
        const generate = vi.fn(async () => { controller.abort(); return blob; });
        const dataset = { list: vi.fn(async () => []), writeObj: vi.fn() };
        const result = await exportReportPdf({ mode: 'publish', model, uid: 'r_1', dataset, signal: controller.signal, now: NOW, generate });
        expect(result.status).toBe('cancelled');
        expect(dataset.writeObj).not.toHaveBeenCalled();
    });

    it('asks once more when another session published the name meanwhile (the write is refused with a conflict)', async () => {
        const { run, dataset, confirmReplace } = setup();
        dataset.writeObj.mockRejectedValueOnce(conflict());
        expect((await run('publish')).status).toBe('published');
        expect(confirmReplace).toHaveBeenCalledTimes(1);
        expect(dataset.writeObj).toHaveBeenLastCalledWith(`reports/${FILE}`, blob, { overwrite: true });
    });

    it('writes nothing more when the user cancels while the second question is open, whatever its answer', async () => {
        const { run, dataset, confirmReplace, controller } = setup();
        dataset.writeObj.mockRejectedValueOnce(conflict());
        confirmReplace.mockImplementation(async () => { controller.abort(); return true; });
        expect((await run('publish')).status).toBe('cancelled');
        expect(dataset.writeObj).toHaveBeenCalledTimes(1);
    });

    it('does not ask again when the user cancelled while the refused write was sent', async () => {
        const { run, dataset, confirmReplace, controller } = setup();
        dataset.writeObj.mockImplementationOnce(async () => { controller.abort(); throw conflict(); });
        expect((await run('publish')).status).toBe('cancelled');
        expect(confirmReplace).not.toHaveBeenCalled();
        expect(dataset.writeObj).toHaveBeenCalledTimes(1);
    });

    it('tells when the write starts, after the PDF is made and before each write: from then on there is nothing to cancel', async () => {
        const events = [];
        const { run, dataset } = setup({ generate: vi.fn(async () => { events.push('generate'); return blob; }) });
        dataset.writeObj.mockImplementationOnce(async () => { events.push('write'); throw conflict(); });
        dataset.writeObj.mockImplementationOnce(async () => { events.push('write'); return {}; });
        expect((await run('publish', { onWriting: () => events.push('writing') })).status).toBe('published');
        expect(events).toEqual(['generate', 'writing', 'write', 'writing', 'write']);
    });

    it('does not tell of a write for a download', async () => {
        const onWriting = vi.fn();
        const { run } = setup();
        await run('download', { onWriting });
        expect(onWriting).not.toHaveBeenCalled();
    });

    it('leaves the other file alone when the answer to that question is Cancel', async () => {
        const { run, dataset, confirmReplace } = setup();
        dataset.writeObj.mockRejectedValueOnce(conflict());
        confirmReplace.mockResolvedValue(false);
        expect((await run('publish')).status).toBe('cancelled');
        expect(dataset.writeObj).toHaveBeenCalledTimes(1);
    });

    it('does not answer a conflict of a dataset that is busy with a question about the file', async () => {
        const { run, dataset, confirmReplace } = setup();
        const busy = Object.assign(new Error('busy'), { status: 409, datasetBusy: 'import', taskId: 't' });
        dataset.writeObj.mockRejectedValueOnce(busy);
        await expect(run('publish')).rejects.toThrow('busy');
        expect(confirmReplace).not.toHaveBeenCalled();
    });

    it('does not ask again after the user said Replace', async () => {
        const { run, dataset, confirmReplace } = setup({ existing: [`reports/${FILE}`] });
        dataset.writeObj.mockRejectedValue(conflict());
        await expect(run('publish')).rejects.toThrow('exists');
        expect(confirmReplace).toHaveBeenCalledTimes(1);
    });
});

describe('publishedCopyExists', () => {
    it('lets any other failure of the listing through', async () => {
        const dataset = { list: async () => { throw Object.assign(new Error('boom'), { status: 500 }); } };
        await expect(publishedCopyExists(dataset, FILE)).rejects.toThrow('boom');
    });
});

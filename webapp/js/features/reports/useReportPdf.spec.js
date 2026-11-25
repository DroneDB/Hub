import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const m = vi.hoisted(() => ({ notify: { success: vi.fn(), error: vi.fn() }, openInNewTab: vi.fn(), openInNewTabIfAllowed: vi.fn(() => true) }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => m.notify }));
vi.mock('@/libs/views/viewLinks', () => ({ openInNewTab: m.openInNewTab, openInNewTabIfAllowed: m.openInNewTabIfAllowed }));

const { useReportPdf } = await import('./useReportPdf');
const { default: ReportPdfProgressDialog } = await import('./ReportPdfProgressDialog.vue');

/** A dialog registry that keeps what was opened and lets the specs answer it. */
function fakeDialogs() {
    const opened = [];
    return {
        opened,
        open: vi.fn((component, props) => {
            let finish;
            const promise = new Promise(resolve => { finish = resolve; });
            promise.close = result => finish(result);
            opened.push({ component, props, answer: finish, promise });
            return promise;
        })
    };
}

/** An export that waits for the spec to finish it, and stops when the signal aborts. */
function pendingExport() {
    const state = { requests: [] };
    state.fn = vi.fn(request => new Promise((resolve, reject) => {
        state.requests.push(request);
        request.onGenerating?.();
        request.signal.addEventListener('abort', () => resolve({ status: 'cancelled', fileName: 'x.pdf' }));
        state.finish = result => resolve(result);
        state.fail = error => reject(error);
    }));
    return state;
}

let dialogs;
const make = (exportPdf, { canWrite = true } = {}) => useReportPdf({
    model: ref({ name: 'North pit' }), dataset: DATASET, uid: ref('r_1'), canWrite: ref(canWrite), dialogs, exportPdf
});
/** The dataset of the page: its download URL as dataset.js makes it, for the published copy. */
const DATASET = {
    id: 'ds',
    downloadUrl: (/** @type {string} */ path, /** @type {any} */ { inline, version } = {}) => `/download/${path}?inline=${inline ? 1 : 0}&v=${version}`
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    dialogs = fakeDialogs();
    m.notify.success.mockReset();
    m.notify.error.mockReset();
    m.openInNewTab.mockReset();
    m.openInNewTabIfAllowed.mockReset().mockReturnValue(true);
});

describe('useReportPdf', () => {
    it('makes the PDF of the model the page shows, for the uid of the report', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('download');
        await flush();
        expect(pdf.requests[0]).toMatchObject({ mode: 'download', model: { name: 'North pit' }, uid: 'r_1', dataset: DATASET });
        pdf.finish({ status: 'downloaded', fileName: 'x.pdf' });
        await run;
        expect(actions.running.value).toBe(false);
    });

    it('shows the progress dialog while the PDF is made, with what has been rendered, and closes it after', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('download');
        await flush();
        expect(dialogs.opened).toHaveLength(1);
        expect(dialogs.opened[0].component).toBe(ReportPdfProgressDialog);
        pdf.requests[0].onProgress({ done: 2, total: 5 });
        expect(dialogs.opened[0].props()).toEqual({ mode: 'download', done: 2, total: 5, writing: false });
        pdf.finish({ status: 'downloaded', fileName: 'x.pdf' });
        await run;
        // the dialog was closed with 'done', which is not a cancel
        expect(await dialogs.opened[0].promise).toBe('done');
    });

    it('offers no Cancel once the PDF is being written to the dataset, where a cancel could not stop the write', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        expect(dialogs.opened[0].props().writing).toBe(false);
        pdf.requests[0].onWriting();
        expect(dialogs.opened[0].props()).toMatchObject({ mode: 'publish', writing: true });
        expect(actions.writing.value).toBe(true);
        pdf.finish({ status: 'published', fileName: 'x.pdf', path: 'reports/x.pdf' });
        await run;
        expect(actions.writing.value).toBe(false);
        expect(m.notify.success).toHaveBeenCalledWith('Published as reports/x.pdf', { summary: 'PDF published' });
    });

    it('is one PDF at a time: a second one asked for while one runs is not started', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const first = actions.run('download');
        await flush();
        expect(actions.running.value).toBe(true);
        await actions.run('publish');
        await actions.run('download');
        expect(pdf.fn).toHaveBeenCalledTimes(1);
        pdf.finish({ status: 'downloaded', fileName: 'x.pdf' });
        await first;
        // free again: the next one is started
        const next = actions.run('download');
        await flush();
        expect(pdf.fn).toHaveBeenCalledTimes(2);
        actions.cancel();
        await next;
    });

    it('cancels from the dialog: the signal aborts and nothing is announced', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('download');
        await flush();
        expect(pdf.requests[0].signal.aborted).toBe(false);
        dialogs.opened[0].answer('cancel');
        await run;
        expect(pdf.requests[0].signal.aborted).toBe(true);
        expect(m.notify.success).not.toHaveBeenCalled();
        expect(m.notify.error).not.toHaveBeenCalled();
        expect(actions.running.value).toBe(false);
    });

    it('cancels when the dialog is closed without an answer (Escape, the close button)', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('download');
        await flush();
        dialogs.opened[0].answer(undefined);
        await run;
        expect(pdf.requests[0].signal.aborted).toBe(true);
    });

    it('cancels on cancel()', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('download');
        await flush();
        actions.cancel();
        await run;
        expect(pdf.requests[0].signal.aborted).toBe(true);
    });

    it('does not publish for a user who cannot write', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn, { canWrite: false });
        await actions.run('publish');
        expect(pdf.fn).not.toHaveBeenCalled();
        expect(actions.running.value).toBe(false);
    });

    it('says where the PDF was published', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        pdf.finish({ status: 'published', fileName: 'x.pdf', path: 'reports/x.pdf' });
        await run;
        expect(m.notify.success).toHaveBeenCalledWith('Published as reports/x.pdf', { summary: 'PDF published' });
    });

    it('opens the published copy in a new tab, shown in place, its URL naming the version written', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        pdf.finish({ status: 'published', fileName: 'x.pdf', path: 'reports/x.pdf', hash: 'ab12' });
        await run;
        expect(m.openInNewTabIfAllowed).toHaveBeenCalledWith('/download/reports/x.pdf?inline=1&v=ab12');
        // the tab opened: the message has no Open PDF
        expect(m.notify.success).toHaveBeenCalledWith('Published as reports/x.pdf', { summary: 'PDF published' });
    });

    it('offers Open PDF in the message when the browser blocked the tab, which opens it on a click', async () => {
        m.openInNewTabIfAllowed.mockReturnValue(false);
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        pdf.finish({ status: 'published', fileName: 'x.pdf', path: 'reports/x.pdf', hash: 'ab12' });
        await run;
        const [message, options] = m.notify.success.mock.calls[0];
        expect(message).toBe('Published as reports/x.pdf');
        expect(options).toMatchObject({ summary: 'PDF published', action: { label: 'Open PDF' } });
        expect(m.openInNewTab).not.toHaveBeenCalled();
        options.action.run();
        expect(m.openInNewTab).toHaveBeenCalledWith('/download/reports/x.pdf?inline=1&v=ab12');
    });

    it('opens no tab for a download, nor for a publish that was cancelled', async () => {
        for (const [mode, result] of /** @type {const} */ ([['download', { status: 'downloaded', fileName: 'x.pdf' }], ['publish', { status: 'cancelled', fileName: 'x.pdf' }]])) {
            const pdf = pendingExport();
            const actions = make(pdf.fn);
            const run = actions.run(mode);
            await flush();
            pdf.finish(result);
            await run;
        }
        expect(m.openInNewTabIfAllowed).not.toHaveBeenCalled();
        expect(m.notify.success).not.toHaveBeenCalled();
    });

    it('says what went wrong, and is free again', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        pdf.fail(new Error('The server answered 500'));
        await run;
        expect(m.notify.error).toHaveBeenCalledWith('The server answered 500', { summary: 'Cannot publish the PDF' });
        expect(actions.running.value).toBe(false);
        error.mockRestore();
    });

    it('asks Replace or Cancel in a dialog of its own and answers the export with the choice', async () => {
        const pdf = pendingExport();
        const actions = make(pdf.fn);
        const run = actions.run('publish');
        await flush();
        const asked = pdf.requests[0].confirmReplace('reports/x.pdf');
        await flush();
        // the second dialog is the question: Replace / Cancel
        const question = dialogs.opened.at(-1);
        expect(question.props).toMatchObject({ title: 'Replace reports/x.pdf', confirmText: 'Replace', cancelText: 'Cancel' });
        question.answer('confirm');
        expect(await asked).toBe(true);
        const second = pdf.requests[0].confirmReplace('reports/x.pdf');
        await flush();
        dialogs.opened.at(-1).answer('cancel');
        expect(await second).toBe(false);
        pdf.finish({ status: 'cancelled', fileName: 'x.pdf' });
        await run;
    });
});

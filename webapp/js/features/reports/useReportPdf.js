// @ts-check
/**
 * useReportPdf - the PDF actions of the live page: Download PDF and Publish PDF. One PDF at a time: while one is made
 * both are disabled, its progress shows (rendered items out of all of them) with Cancel, and a cancel ends with no file
 * downloaded or written. Publish is for writers; when the published copy is there it asks Replace or Cancel. Once the
 * PDF is being written to the dataset a cancel could not take the write back, so the dialog offers none. A published
 * PDF opens in a new tab to be read; when the browser blocks that tab (it opens one without asking only within a few
 * seconds of the click, and a PDF takes longer), the message that it was published has Open PDF instead.
 *
 *   const pdf = useReportPdf({ model, dataset, uid, canWrite, dialogs });
 *   await pdf.run('download');
 */
import { computed, ref, shallowRef } from 'vue';
import { useChoice } from '@/composables/useConfirm';
import { useNotify } from '@/composables/useNotify';
import { openInNewTab, openInNewTabIfAllowed } from '@/libs/views/viewLinks';
import ReportPdfProgressDialog from './ReportPdfProgressDialog.vue';

/** The code that makes the PDF is a chunk of its own: it loads when the first PDF is asked for. @type {(request: any) => Promise<any>} */
const exportLazily = async request => (await import(/* webpackChunkName: "report-pdf" */ '@/libs/reports/pdf/pdfExport')).exportReportPdf(request);

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.model  the report model the page shows
 * @param {any} ctx.dataset
 * @param {import('vue').Ref<string> | (() => string)} ctx.uid  of the report definition
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {{ open: Function }} ctx.dialogs
 * @param {(request: any) => Promise<any>} [ctx.exportPdf]  how the PDF is made and saved (a spec stands in)
 */
export function useReportPdf({ model, dataset, uid, canWrite, dialogs, exportPdf = exportLazily }) {
    const choose = useChoice(dialogs);
    const notify = useNotify();

    const mode = shallowRef(/** @type {'download' | 'publish' | null} */ (null));
    const progress = ref({ done: 0, total: 0 });
    const writing = ref(false);
    const running = computed(() => mode.value !== null);
    /** @type {AbortController | null} */
    let controller = null;

    /** Stops the PDF that is being made: nothing is downloaded or published. */
    const cancel = () => controller?.abort();

    /** @param {string} path */
    const confirmReplace = async path => (await choose({
        title: `Replace ${path}`,
        message: 'A PDF with this name is already published in the reports folder. Replace it with this one?',
        confirmText: 'Replace',
        cancelText: 'Cancel'
    })) === 'confirm';

    /**
     * Opens the published copy in a new tab, shown in place; the hash in the URL keeps the browser from showing a copy it
     * kept of a PDF it replaced. Says where it was published, with Open PDF when the browser blocked the tab.
     * @param {{ path: string, hash?: string }} published
     */
    function showPublished({ path, hash }) {
        const url = dataset.downloadUrl(path, { inline: true, version: hash });
        const opened = openInNewTabIfAllowed(url);
        notify.success(`Published as ${path}`, {
            summary: 'PDF published',
            ...(opened ? {} : { action: { label: 'Open PDF', run: () => openInNewTab(url) } })
        });
    }

    /** @param {'download' | 'publish'} requested */
    async function run(requested) {
        if (running.value || !model.value) return;
        if (requested === 'publish' && !canWrite.value) return;
        controller = new AbortController();
        mode.value = requested;
        progress.value = { done: 0, total: 0 };
        writing.value = false;
        /** @type {any} */
        let shown = null;
        try {
            const result = await exportPdf({
                mode: requested,
                model: model.value,
                uid: typeof uid === 'function' ? uid() : uid.value,
                dataset,
                signal: controller.signal,
                onProgress: next => { progress.value = next; },
                onWriting: () => { writing.value = true; },
                confirmReplace,
                onGenerating: () => {
                    shown = dialogs.open(ReportPdfProgressDialog, () => ({ mode: requested, done: progress.value.done, total: progress.value.total, writing: writing.value }));
                    // Cancel, the close button and Escape all answer 'cancel'
                    shown.then((/** @type {string | undefined} */ answer) => { if (answer !== 'done') cancel(); });
                }
            });
            if (result.status === 'published') showPublished(result);
        } catch (/** @type {any} */ e) {
            console.error('Cannot make the PDF:', e);
            notify.error(e?.message || String(e), { summary: requested === 'publish' ? 'Cannot publish the PDF' : 'Cannot make the PDF' });
        } finally {
            shown?.close('done');
            mode.value = null;
            writing.value = false;
            controller = null;
        }
    }

    return { run, cancel, running, mode, progress, writing };
}

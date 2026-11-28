// @ts-check
/**
 * The worker that lays the pages of a report PDF out, so that the page stays responsive while the library works (a
 * large report takes it tens of seconds) and Cancel can stop it (the page ends the worker).
 *
 * It says `{ type: 'ready' }` once it runs, then answers the one job it is sent (pdfLayoutJob) with
 * `{ type: 'blob', blob }` or `{ type: 'error', message }`.
 */
import { loadPdfMake } from '@/libs/reports/pdf/pdfLibrary';
import { runPdfLayoutJob } from '@/libs/reports/pdf/pdfLayoutJob';

const scope = /** @type {any} */ (globalThis);

scope.onmessage = async (/** @type {MessageEvent} */ event) => {
    try {
        const blob = await runPdfLayoutJob(event.data, await loadPdfMake());
        scope.postMessage({ type: 'blob', blob });
    } catch (e) {
        scope.postMessage({ type: 'error', message: /** @type {any} */ (e)?.message || String(e) });
    }
};

scope.postMessage({ type: 'ready' });

// @ts-check
/**
 * The pages of a report PDF laid out in a worker (pdfWorker): the page stays responsive meanwhile, and a cancel ends the
 * worker at once, whatever the library is doing. One worker per PDF, ended when its PDF is there.
 *
 * A worker that cannot start (the browser has none, its script did not load, the job cannot be sent to it) rejects with
 * a `WorkerUnavailable` error before any work: the caller then lays the pages out on the page, as before. Anything that
 * goes wrong once the worker runs is the PDF's error.
 */

/** The name of the error of a worker that could not start. */
export const WORKER_UNAVAILABLE = 'WorkerUnavailable';

/** Whether the browser runs workers. */
export const canLayOutInWorker = () => typeof Worker === 'function';

/** @param {unknown} cause */
const unavailable = cause => Object.assign(new Error('The PDF cannot be laid out in a worker'), { name: WORKER_UNAVAILABLE, cause });

/** The worker of the PDF: a chunk of its own, with the library, loaded when a PDF is made. */
const startWorker = () => new Worker(new URL('./pdfWorker.js', import.meta.url), { name: 'report-pdf-worker' });

/**
 * The PDF of a job, laid out in a worker.
 * @param {import('./pdfLayoutJob').PdfLayoutJob} job
 * @param {{ signal?: AbortSignal, createWorker?: () => Worker }} [options]  aborting the signal ends the worker: the promise
 *   rejects with an AbortError
 * @returns {Promise<Blob>}
 */
export function layoutInWorker(job, { signal, createWorker = startWorker } = {}) {
    return new Promise((resolve, reject) => {
        /** @type {Worker} */
        let worker;
        try {
            worker = createWorker();
        } catch (e) {
            reject(unavailable(e));
            return;
        }
        let ready = false;
        let settled = false;
        /** @param {(value: any) => void} settle @param {any} value */
        const finish = (settle, value) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            worker.terminate();
            settle(value);
        };
        const onAbort = () => finish(reject, new DOMException('The PDF was cancelled', 'AbortError'));

        worker.onmessage = (/** @type {MessageEvent} */ { data }) => {
            if (data?.type === 'ready') ready = true;
            else if (data?.type === 'blob') finish(resolve, data.blob);
            else if (data?.type === 'error') finish(reject, new Error(data.message));
        };
        // A script that did not load or did not run says so before it is ready; afterwards the error is the PDF's
        worker.onerror = (/** @type {ErrorEvent} */ event) => {
            event.preventDefault?.();
            finish(reject, ready ? new Error(event.message || 'The PDF could not be made') : unavailable(event));
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        // lifetime: paired (removed when the PDF is there, failed or cancelled)
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            // The job is waiting for the worker when it starts: it is sent at once, so a job that cannot be sent is known now
            worker.postMessage(job);
        } catch (e) {
            finish(reject, unavailable(e));
        }
    });
}

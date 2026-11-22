// @ts-check
/**
 * "Download PDF" and "Publish PDF": what happens to the PDF of a report once the page asks for it. Both make the PDF
 * from the model the page shows (generateReportPdf) and name it `<slug>-<yyyy-mm-dd>.pdf`; a download saves it, a
 * publish writes it to `reports/` at the root of the dataset, asking Replace or Cancel when that file is there.
 * A cancel (the signal aborted) ends with no file saved or written.
 */
import { downloadBlob } from '@/libs/download';
import { isNotFound, datasetBusyOf } from '@/libs/ddb/apiError';
import { generateReportPdf } from '@/libs/reports/pdf/pdfGenerator';
import { PUBLISH_FOLDER, pdfFileName, publishedPath } from '@/libs/reports/pdf/pdfFileName';

/**
 * Whether the dataset has a published copy of that name. The Registry compares names without regard to letter case
 * (a write is refused for any case), so this does too.
 * @param {any} dataset @param {string} fileName
 */
export async function publishedCopyExists(dataset, fileName) {
    try {
        const wanted = publishedPath(fileName).toLowerCase();
        return ((await dataset.list(PUBLISH_FOLDER)) || []).some((/** @type {{ path: string }} */ entry) => entry.path.toLowerCase() === wanted);
    } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
    }
}

/**
 * @typedef {object} ExportRequest
 * @property {'download' | 'publish'} mode
 * @property {any} model  the report model the page shows
 * @property {string} uid  of the definition, for the file name of a report whose name makes no slug
 * @property {any} dataset
 * @property {AbortSignal} signal
 * @property {(progress: import('./pdfAssets').Progress) => void} [onProgress]
 * @property {() => void} [onGenerating]  called when the PDF starts to be made (after the question about a published copy)
 * @property {(path: string) => Promise<boolean>} [confirmReplace]  asks whether to replace the published copy at that path
 * @property {Date} [now]
 * @property {typeof generateReportPdf} [generate]
 * @property {(blob: Blob, fileName: string) => void} [save]
 */

/**
 * @param {ExportRequest} request
 * @returns {Promise<{ status: 'downloaded' | 'published' | 'cancelled', fileName: string, path?: string }>}
 */
export async function exportReportPdf({ mode, model, uid, dataset, signal, onProgress, onGenerating, confirmReplace = async () => false, now = new Date(), generate = generateReportPdf, save = downloadBlob }) {
    const fileName = pdfFileName({ name: model.name, uid }, now);
    const path = publishedPath(fileName);
    const cancelled = /** @type {const} */ ({ status: 'cancelled', fileName });

    // Asked before the work is done: a user who says Cancel has lost nothing
    let replace = false;
    if (mode === 'publish' && await publishedCopyExists(dataset, fileName)) {
        if (!await confirmReplace(path)) return cancelled;
        replace = true;
    }

    onGenerating?.();
    let blob;
    try {
        blob = await generate(model, { dataset, signal, onProgress });
    } catch (e) {
        if (signal.aborted) return cancelled;
        throw e;
    }
    if (signal.aborted) return cancelled;

    if (mode === 'download') {
        save(blob, fileName);
        return { status: 'downloaded', fileName };
    }
    try {
        await dataset.writeObj(path, blob, { overwrite: replace });
    } catch (e) {
        // Another session published the same name while the PDF was made: the same question, answered once
        if (replace || /** @type {any} */ (e)?.status !== 409 || datasetBusyOf(e)) throw e;
        if (!await confirmReplace(path)) return cancelled;
        await dataset.writeObj(path, blob, { overwrite: true });
    }
    return { status: 'published', fileName, path };
}

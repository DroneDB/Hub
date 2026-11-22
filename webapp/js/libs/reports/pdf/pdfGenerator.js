// @ts-check
/**
 * Makes the PDF of a report in the browser: loads the PDF library, the QR encoder and the snapshot renderers when a PDF
 * is asked for (they are chunks of their own, never part of the page), makes the images one item at a time, builds the
 * document definition from the report model, and has the library write it. The progress is the items rendered out of
 * all of them; aborting the signal stops it and nothing is returned.
 */
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { loadAssets } from '@/libs/reports/pdf/pdfAssets';
import { pageLayout } from '@/libs/reports/pdf/pdfLayout';

/**
 * @typedef {object} PdfDependencies
 * @property {{ createPdf: (definition: any) => { getBlob: () => Promise<Blob> } }} pdfMake
 * @property {(text: string) => { size: number, path: string }} qr
 * @property {{ renderMapSnapshot: Function, renderProfileChart: Function, capture3dImageUrl: Function, sharedRenderQueue: { run: Function } }} renderers
 */

/**
 * The libraries of the PDF, loaded on demand. pdfmake takes its fonts from a virtual file system: Roboto (Latin, Greek and
 * Cyrillic) is embedded, and text in a script it has no glyphs for is not drawn.
 * @returns {Promise<PdfDependencies>}
 */
export async function loadPdfDependencies() {
    const [pdfmake, fonts, qr, renderers] = await Promise.all([
        import(/* webpackChunkName: "pdfmake" */ 'pdfmake/build/pdfmake'),
        import(/* webpackChunkName: "pdfmake-fonts" */ 'pdfmake/build/vfs_fonts'),
        import('@/libs/qr'),
        import('@/libs/reports/snapshots')
    ]);
    const pdfMake = /** @type {any} */ (pdfmake).default ?? pdfmake;
    pdfMake.addVirtualFileSystem(/** @type {any} */ (fonts).default ?? fonts);
    return { pdfMake, qr: qr.qrCode, renderers };
}

/**
 * The PDF of a report model.
 * @param {any} model  the report model, as the live page draws it
 * @param {object} options
 * @param {any} options.dataset
 * @param {AbortSignal} [options.signal]  aborting it stops the work: the promise rejects with an AbortError
 * @param {(progress: import('./pdfAssets').Progress) => void} [options.onProgress]
 * @param {PdfDependencies} [options.dependencies]  the libraries; loaded when none are given
 * @param {string} [options.origin]  the origin of the Hub, the only one a QR code is made for
 * @returns {Promise<Blob>}
 */
export async function generateReportPdf(model, { dataset, signal, onProgress, dependencies, origin = window.location.origin }) {
    signal?.throwIfAborted();
    const libraries = dependencies ?? await loadPdfDependencies();
    signal?.throwIfAborted();

    // The queue the live page draws its snapshots through: at most two canvases of a few megapixels exist at once
    const queue = libraries.renderers.sharedRenderQueue;
    const assets = await loadAssets(model, { dataset, layout: pageLayout(model.template), deps: { renderers: libraries.renderers, queue }, signal, onProgress });
    const definition = buildPdfDocument(model, { assets, qr: libraries.qr, origin });

    signal?.throwIfAborted();
    const blob = await libraries.pdfMake.createPdf(definition).getBlob();
    // The library cannot be stopped once it writes: a cancel that came meanwhile still gives no file
    signal?.throwIfAborted();
    return blob;
}

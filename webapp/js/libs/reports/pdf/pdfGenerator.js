// @ts-check
/**
 * Makes the PDF of a report in the browser: loads the PDF library, the QR encoder and the snapshot renderers when a PDF
 * is asked for (they are chunks of their own, never part of the page), makes the images one item at a time, builds the
 * document definition from the report model, and has the library write it. The progress is the items rendered out of
 * all of them; aborting the signal stops it and nothing is returned.
 *
 * The library lays the pages out in a worker (pdfWorkerLayout) where the browser can run one: a large report takes it
 * tens of seconds, during which the page stays responsive and a cancel stops it. Where no worker can start, the pages
 * are laid out on the page as before, which nothing interrupts: `onLayout` says which.
 *
 * Two things are decided before the work and told to the user instead of ending in a bad file or a dead tab: the photos
 * of a report that has too many are made smaller or refused (pdfBudget), and the characters no font of the PDF can draw
 * are listed for the user to accept (pdfText).
 */
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { loadPdfMake } from '@/libs/reports/pdf/pdfLibrary';
import { WORKER_UNAVAILABLE, canLayOutInWorker, layoutInWorker } from '@/libs/reports/pdf/pdfWorkerLayout';
import { loadAssets } from '@/libs/reports/pdf/pdfAssets';
import { planPhotos, reducedText, refusedText } from '@/libs/reports/pdf/pdfBudget';
import { pageLayout } from '@/libs/reports/pdf/pdfLayout';
import { unsupportedCharacters } from '@/libs/reports/pdf/pdfText';

/**
 * @typedef {object} PdfDependencies
 * @property {{ createPdf: (definition: any) => { getBlob: () => Promise<Blob> } }} [pdfMake]  the library on the page
 *   (loaded when it is needed and none is given)
 * @property {(job: import('./pdfLayoutJob').PdfLayoutJob, options: { signal?: AbortSignal }) => Promise<Blob>} [layout]
 *   lays the pages out away from the page, which a cancel stops (a worker); rejects with a `WorkerUnavailable` error when
 *   it cannot start, and the page lays them out itself
 * @property {(text: string) => { size: number, path: string }} qr
 * @property {{ renderMapSnapshot: Function, renderProfileChart: Function, capture3dImageUrl: Function, sharedRenderQueue: import('./pdfAssets').AssetDeps['queue'] }} renderers
 */

/**
 * The libraries of the PDF, loaded on demand: the PDF library itself only where the pages are laid out on the page (in
 * a worker, the worker loads it).
 * @returns {Promise<PdfDependencies>}
 */
export async function loadPdfDependencies() {
    const [qr, renderers] = await Promise.all([import('@/libs/qr'), import('@/libs/reports/snapshots')]);
    const common = { qr: qr.qrCode, renderers };
    if (canLayOutInWorker()) return { ...common, layout: layoutInWorker };
    return { ...common, pdfMake: await loadPdfMake() };
}

/** The cancel of a PDF that the user was asked about. @param {string} message */
const stopped = message => new DOMException(message, 'AbortError');

/**
 * Lets the page draw what it was just given (the dialog that says the pages are being laid out) before the library takes
 * the thread for the whole layout on the page: it cannot be interrupted, and a page that was not drawn would look frozen
 * without a word.
 * @returns {Promise<void>}
 */
function nextPaint() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') requestAnimationFrame(() => setTimeout(resolve, 0));
        else setTimeout(resolve, 0);
    });
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
 * @param {(message: string) => void} [options.onNotice]  what the user should know before the work starts (the photos are made smaller)
 * @param {(characters: string[]) => boolean | Promise<boolean>} [options.confirmUnsupported]  asked with the characters of
 *   the report that the font cannot draw; `false` stops the PDF (the promise rejects with an AbortError). None given: it goes on.
 * @param {(layout: { cancellable: boolean }) => void} [options.onLayout]  called when the library starts to lay the pages
 *   out: in a worker, which a cancel stops (`cancellable`), or on the page, which nothing interrupts
 * @returns {Promise<Blob>}
 */
export async function generateReportPdf(model, { dataset, signal, onProgress, dependencies, origin = window.location.origin, onNotice, confirmUnsupported, onLayout }) {
    signal?.throwIfAborted();
    // Decided from the model, before any image is made
    const photos = planPhotos(model);
    if (photos.refused) throw new Error(refusedText(photos));
    if (photos.reduced) onNotice?.(reducedText(photos));
    const libraries = dependencies ?? await loadPdfDependencies();
    signal?.throwIfAborted();

    // The text is the model's: the question is asked of the document without its images, before the images are made
    // (minutes for a large report), so a No costs no wait. The notes of the figures that could not be made are text
    // too: a character among them that was not asked about yet is asked about once the images are there
    /** @type {Set<string>} */
    const asked = new Set();
    /** @param {any} document */
    const accepts = async document => {
        const missing = unsupportedCharacters(document).filter(c => !asked.has(c));
        if (!missing.length || !confirmUnsupported) return;
        missing.forEach(c => asked.add(c));
        if (!await confirmUnsupported(missing)) throw stopped('The PDF was not made: its text has characters the font cannot draw');
        signal?.throwIfAborted();
    };
    await accepts(buildPdfDocument(model, { assets: { logo: null, figures: new Map(), photos: new Map() }, qr: libraries.qr, origin }));

    // The queue the live page draws its snapshots through: at most two canvases of a few megapixels exist at once
    const queue = libraries.renderers.sharedRenderQueue;
    const assets = await loadAssets(model, { dataset, layout: pageLayout(model.template), deps: { renderers: libraries.renderers, queue }, signal, onProgress, photoMaxSide: photos.maxSide });
    const definition = buildPdfDocument(model, { assets, qr: libraries.qr, origin });

    signal?.throwIfAborted();
    await accepts(definition);
    if (libraries.layout) {
        onLayout?.({ cancellable: true });
        try {
            return await libraries.layout({ model, assets, origin }, { signal });
        } catch (e) {
            if (/** @type {any} */ (e)?.name !== WORKER_UNAVAILABLE) throw e;
            console.warn('The PDF is laid out on the page: no worker could start', e);
        }
    }
    return layoutOnPage(libraries.pdfMake ?? await loadPdfMake(), definition, { signal, onLayout });
}

/**
 * The pages laid out on the page: the library takes the thread until it is done.
 * @param {{ createPdf: (definition: any) => { getBlob: () => Promise<Blob> } }} pdfMake
 * @param {any} definition
 * @param {{ signal?: AbortSignal, onLayout?: (layout: { cancellable: boolean }) => void }} options
 * @returns {Promise<Blob>}
 */
async function layoutOnPage(pdfMake, definition, { signal, onLayout }) {
    signal?.throwIfAborted();
    onLayout?.({ cancellable: false });
    await nextPaint();
    signal?.throwIfAborted();
    const blob = await pdfMake.createPdf(definition).getBlob();
    // The library cannot be stopped once it writes: a cancel that came meanwhile still gives no file
    signal?.throwIfAborted();
    return blob;
}

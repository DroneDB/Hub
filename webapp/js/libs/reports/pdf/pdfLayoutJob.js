// @ts-check
/**
 * What the worker of the PDF does with a job: the document definition of the report model, with the images of the job,
 * written by the library. The definition is made where the library writes it, because it holds functions (the header,
 * the footer and the lines of the tables are functions of the page and the row), which cannot be sent to a worker: the
 * model and the images can (the images are data URLs, and the figures are keyed by the blocks of the same model, which a
 * message keeps as one graph).
 */
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { qrCode } from '@/libs/qr';

/**
 * @typedef {object} PdfLayoutJob
 * @property {any} model  the report model
 * @property {import('./pdfAssets').PdfAssets} assets  the images of the report
 * @property {string} origin  the origin of the Hub, the only one a QR code is made for
 */

/**
 * The PDF of a job.
 * @param {PdfLayoutJob} job
 * @param {{ createPdf: (definition: any) => { getBlob: () => Promise<Blob> } }} pdfMake
 * @returns {Promise<Blob>}
 */
export function runPdfLayoutJob({ model, assets, origin }, pdfMake) {
    return pdfMake.createPdf(buildPdfDocument(model, { assets, qr: qrCode, origin })).getBlob();
}

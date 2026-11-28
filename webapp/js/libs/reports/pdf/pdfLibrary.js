// @ts-check
/**
 * The PDF library, pdfmake, loaded on demand and made ready to write a report: its virtual file system with the embedded
 * Roboto (Latin, Greek and Cyrillic; a character in a script it has no glyph for is drawn as the empty box of the font,
 * which the user is told first: unsupportedCharacters) and the font of the report's symbols. The page and the worker that
 * lays the pages out (pdfWorker) load it the same way; it is a chunk of its own, never part of the page.
 */
import { addSymbolsFont } from '@/libs/reports/pdf/pdfSymbols';

/** @returns {Promise<{ createPdf: (definition: any) => { getBlob: () => Promise<Blob> } }>} */
export async function loadPdfMake() {
    const [pdfmake, fonts] = await Promise.all([
        import(/* webpackChunkName: "pdfmake" */ 'pdfmake/build/pdfmake'),
        import(/* webpackChunkName: "pdfmake-fonts" */ 'pdfmake/build/vfs_fonts')
    ]);
    const pdfMake = /** @type {any} */ (pdfmake).default ?? pdfmake;
    pdfMake.addVirtualFileSystem(/** @type {any} */ (fonts).default ?? fonts);
    addSymbolsFont(pdfMake);
    return pdfMake;
}

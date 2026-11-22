/**
 * The definition is turned into a real PDF by pdfmake (with its embedded Roboto): the pages have the size and the
 * orientation of the template, there are as many pages as the layout needs, and the file is a PDF that opens.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { fullAssets, options, pdfModel } from '@/libs/reports/pdf/pdfDocument.fixtures';

let pdfMake;
beforeAll(async () => {
    const library = await import('pdfmake/build/pdfmake');
    const fonts = await import('pdfmake/build/vfs_fonts');
    pdfMake = library.default ?? library;
    pdfMake.addVirtualFileSystem(fonts.default ?? fonts);
}, 60000);

/** The PDF as text, with no compression, so that its objects can be read. */
async function render(model, assets) {
    const definition = { ...buildPdfDocument(model, options(model, assets)), compress: false };
    const blob = await pdfMake.createPdf(definition).getBlob();
    return { blob, text: Buffer.from(await blob.arrayBuffer()).toString('latin1') };
}
const mediaBoxes = text => [...new Set(text.match(/\/MediaBox \[[^\]]*\]/g))];
const pageCount = text => (text.match(/\/Type \/Page\b/g) || []).length;

describe('the PDF pdfmake writes', () => {
    it('is a PDF with A4 portrait pages', async () => {
        const model = pdfModel({ templateExtra: { paper: 'A4', orientation: 'portrait' } });
        const { blob, text } = await render(model, fullAssets(model));
        expect(blob.size).toBeGreaterThan(5000);
        expect(text.startsWith('%PDF-')).toBe(true);
        expect(mediaBoxes(text)).toEqual(['/MediaBox [0 0 595.28 841.89]']);
    }, 60000);

    it('has Letter landscape pages for a template that says so, and the report is longer than the cover', async () => {
        const model = pdfModel({ templateExtra: { paper: 'Letter', orientation: 'landscape' } });
        const { text } = await render(model, fullAssets(model));
        expect(mediaBoxes(text)).toEqual(['/MediaBox [0 0 792 612]']);
        // cover, contents, summary, overview, tables, three item pages, notes
        expect(pageCount(text)).toBeGreaterThanOrEqual(9);
    }, 60000);

    it('embeds a font and writes the title in the information of the file', async () => {
        const model = pdfModel();
        const { text } = await render(model, fullAssets(model));
        expect(text).toMatch(/\/FontFile2/);
        expect(text).toMatch(/\/Title \d+ 0 R/);
    }, 60000);

    it('is made with no image too (every figure is its text)', async () => {
        const model = pdfModel();
        const { blob } = await render(model, { logo: null, figures: new Map(), photos: new Map() });
        expect(blob.size).toBeGreaterThan(5000);
    }, 60000);
});

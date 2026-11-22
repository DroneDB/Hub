import { describe, it, expect, vi } from 'vitest';
import { generateReportPdf } from '@/libs/reports/pdf/pdfGenerator';
import { ORIGIN, pdfModel } from '@/libs/reports/pdf/pdfDocument.fixtures';
import { qrCode } from '@/libs/qr';

/** The libraries of the PDF, as stand-ins: the definition they are given is what the specs look at. */
function libraries({ blob = new Blob(['%PDF']) } = {}) {
    const created = [];
    return {
        created,
        dependencies: {
            pdfMake: { createPdf: vi.fn(definition => { created.push(definition); return { getBlob: async () => blob }; }) },
            qr: qrCode,
            renderers: {
                renderMapSnapshot: vi.fn(async (_b, { width, height }) => ({ image: null, width, height, note: 'Basemap not shown: provider does not allow export' })),
                renderProfileChart: vi.fn(async () => ({ image: null, width: 1, height: 1, note: null })),
                capture3dImageUrl: vi.fn(() => null),
                sharedRenderQueue: { run: vi.fn((task, options) => task(options?.signal)) }
            }
        }
    };
}
const dataset = { thumbUrl: () => '/thumb', registry: { fetchRaw: async () => ({ ok: false, status: 404 }) } };

describe('generateReportPdf', () => {
    it('is the blob the PDF library writes for the definition of the model', async () => {
        const blob = new Blob(['%PDF-made']);
        const { dependencies, created } = libraries({ blob });
        const model = pdfModel({ templateExtra: { paper: 'Letter', orientation: 'landscape' } });
        expect(await generateReportPdf(model, { dataset, dependencies, origin: ORIGIN })).toBe(blob);
        expect(created).toHaveLength(1);
        expect(created[0]).toMatchObject({ pageSize: 'LETTER', pageOrientation: 'landscape' });
    });

    it('renders through the queue the live page uses, so that both share its limit', async () => {
        const { dependencies } = libraries();
        await generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN });
        expect(dependencies.renderers.sharedRenderQueue.run).toHaveBeenCalled();
    });

    it('reports the progress of the items', async () => {
        const { dependencies } = libraries();
        const progress = vi.fn();
        await generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, onProgress: progress });
        expect(progress).toHaveBeenCalledWith({ done: 0, total: 4 });
        expect(progress).toHaveBeenLastCalledWith({ done: 4, total: 4 });
    });

    it('makes QR codes only for the origin it is given', async () => {
        const { dependencies, created } = libraries();
        await generateReportPdf(pdfModel(), { dataset, dependencies, origin: 'https://other.example' });
        expect(JSON.stringify(created[0].content)).not.toContain('"svg"');
    });

    it('writes nothing for a signal that is already aborted', async () => {
        const { dependencies } = libraries();
        const controller = new AbortController();
        controller.abort();
        await expect(generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(dependencies.pdfMake.createPdf).not.toHaveBeenCalled();
    });

    it('gives no file when it is cancelled while the library writes', async () => {
        const { dependencies } = libraries();
        const controller = new AbortController();
        dependencies.pdfMake.createPdf.mockImplementation(() => ({ getBlob: async () => { controller.abort(); return new Blob(['%PDF']); } }));
        await expect(generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('stops before the library when it is cancelled while the images are made', async () => {
        const { dependencies } = libraries();
        const controller = new AbortController();
        dependencies.renderers.renderMapSnapshot.mockImplementation(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError'); });
        await expect(generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(dependencies.pdfMake.createPdf).not.toHaveBeenCalled();
    });
});

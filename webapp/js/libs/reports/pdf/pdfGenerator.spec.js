import { describe, it, expect, vi } from 'vitest';
import { generateReportPdf } from '@/libs/reports/pdf/pdfGenerator';
import { ORIGIN, pdfModel, threeItems } from '@/libs/reports/pdf/pdfDocument.fixtures';
import { MOST_PHOTOS } from '@/libs/reports/pdf/pdfBudget';
import { PHOTO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';
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

    describe('the photos', () => {
        /** A report whose first item has this many distinct photos. */
        const withPhotos = count => {
            const [first, ...others] = threeItems();
            const photos = Array.from({ length: count }, (_, i) => ({ path: `photos/p${i}.jpg`, source: 'dataset' }));
            return pdfModel({ features: [{ ...first, properties: { ...first.properties, photos } }, ...others] });
        };
        const photosDataset = () => ({ thumbUrl: vi.fn((path, size) => `/thumb/${path}?size=${size}`), registry: { fetchRaw: async () => ({ ok: false, status: 404 }) } });

        it('are refused before anything is loaded or made when there are more than a PDF holds, with the reason', async () => {
            const { dependencies } = libraries();
            const photos = photosDataset();
            const error = await generateReportPdf(withPhotos(MOST_PHOTOS + 1), { dataset: photos, dependencies, origin: ORIGIN }).catch(e => e);
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain(`at most ${MOST_PHOTOS}`);
            expect(photos.thumbUrl).not.toHaveBeenCalled();
            expect(dependencies.renderers.renderMapSnapshot).not.toHaveBeenCalled();
            expect(dependencies.pdfMake.createPdf).not.toHaveBeenCalled();
        });

        it('are asked of the Registry at a smaller size, and the user is told, for a report above the budget', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            const { dependencies } = libraries();
            const photos = photosDataset();
            const onNotice = vi.fn();
            await generateReportPdf(withPhotos(700), { dataset: photos, dependencies, origin: ORIGIN, onNotice });
            expect(onNotice).toHaveBeenCalledTimes(1);
            expect(onNotice.mock.calls[0][0]).toContain('700 photos');
            const sizes = new Set(photos.thumbUrl.mock.calls.map(([, size]) => size));
            expect([...sizes]).toHaveLength(1);
            expect([...sizes][0]).toBeLessThan(PHOTO_MAX_SIDE);
        });

        it('are asked at the usual size, with no notice, for a report within the budget', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            const { dependencies } = libraries();
            const photos = photosDataset();
            const onNotice = vi.fn();
            await generateReportPdf(withPhotos(5), { dataset: photos, dependencies, origin: ORIGIN, onNotice });
            expect(onNotice).not.toHaveBeenCalled();
            expect(new Set(photos.thumbUrl.mock.calls.map(([, size]) => size))).toEqual(new Set([PHOTO_MAX_SIDE]));
        });
    });

    describe('the characters the font cannot draw', () => {
        const cjk = () => pdfModel({ features: threeItems().map(f => ({ ...f, properties: { ...f.properties, name: `Gate \u5165\u53e3 \u0e3f` } })) });

        it('are asked about before the library writes, and a No ends with an AbortError and no file', async () => {
            const { dependencies } = libraries();
            const confirmUnsupported = vi.fn(async () => false);
            await expect(generateReportPdf(cjk(), { dataset, dependencies, origin: ORIGIN, confirmUnsupported })).rejects.toMatchObject({ name: 'AbortError' });
            expect(confirmUnsupported).toHaveBeenCalledWith(['\u5165', '\u53e3', '\u0e3f']);
            expect(dependencies.pdfMake.createPdf).not.toHaveBeenCalled();
        });

        it('are written as empty boxes when the user says to go on', async () => {
            const { dependencies } = libraries();
            await generateReportPdf(cjk(), { dataset, dependencies, origin: ORIGIN, confirmUnsupported: async () => true });
            expect(dependencies.pdfMake.createPdf).toHaveBeenCalledTimes(1);
        });

        it('are not asked about for a report the font can draw, where it is a French one with figures of 1,000 or more', async () => {
            const { dependencies } = libraries();
            const confirmUnsupported = vi.fn(async () => false);
            vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
            await generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, confirmUnsupported });
            expect(confirmUnsupported).not.toHaveBeenCalled();
        });
    });

    describe('the layout of the pages', () => {
        it('is announced before the library takes the thread, after the questions, so that the page can say it cannot be cancelled', async () => {
            const { dependencies } = libraries();
            const order = [];
            dependencies.pdfMake.createPdf.mockImplementation(() => { order.push('createPdf'); return { getBlob: async () => new Blob(['%PDF']) }; });
            await generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, confirmUnsupported: async () => { order.push('asked'); return true; }, onLayout: () => order.push('layout') });
            expect(order).toEqual(['layout', 'createPdf']);
        });

        it('is not announced for a PDF that was stopped before it', async () => {
            const { dependencies } = libraries();
            const onLayout = vi.fn();
            const controller = new AbortController();
            dependencies.renderers.renderMapSnapshot.mockImplementation(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError'); });
            await expect(generateReportPdf(pdfModel(), { dataset, dependencies, origin: ORIGIN, signal: controller.signal, onLayout })).rejects.toMatchObject({ name: 'AbortError' });
            expect(onLayout).not.toHaveBeenCalled();
        });
    });
});

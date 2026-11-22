import { describe, it, expect, vi } from 'vitest';
import { fitWithin, prepareImage, blobToDataUrl, JPEG_QUALITY, SNAPSHOT_MAX_SIDE, PHOTO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';

describe('the limits', () => {
    it('are JPEG at 85, 2000 px for a snapshot and 1600 px for a photo', () => {
        expect(JPEG_QUALITY).toBe(0.85);
        expect(SNAPSHOT_MAX_SIDE).toBe(2000);
        expect(PHOTO_MAX_SIDE).toBe(1600);
    });
});

describe('fitWithin', () => {
    it('keeps an image that fits, and never enlarges it', () => {
        expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
        expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
    });

    it('scales the long side down to the limit with the proportions kept', () => {
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(6000, 6000, 2000)).toEqual({ width: 2000, height: 2000 });
    });

    it('never makes a side of zero pixels', () => {
        expect(fitWithin(20000, 3, 2000)).toEqual({ width: 2000, height: 1 });
    });

    it('refuses an image with no size', () => {
        expect(() => fitWithin(0, 0, 1600)).toThrow();
        expect(() => fitWithin(NaN, 10, 1600)).toThrow();
    });
});

/** A browser's decoding and canvas, as far as prepareImage uses them. */
function fakeBrowser({ width = 4000, height = 3000, jpeg = new Blob(['jpeg'], { type: 'image/jpeg' }) } = {}) {
    const calls = { closed: 0, released: 0, canvases: [], fills: [], draws: [], encoded: [] };
    const deps = {
        decode: vi.fn(async () => ({ source: 'bitmap', width, height, close: () => { calls.closed++; } })),
        canvas: vi.fn((w, h) => {
            calls.canvases.push([w, h]);
            const context = {
                fillRect: (...a) => calls.fills.push([context.fillStyle, ...a]),
                drawImage: (...a) => calls.draws.push(a)
            };
            return {
                context,
                toBlob: async (type, quality) => { calls.encoded.push([type, quality]); return jpeg; },
                release: () => { calls.released++; }
            };
        })
    };
    return { deps, calls };
}

describe('prepareImage', () => {
    it('draws a photo at 1600 px on its long side and encodes it as a JPEG at 0.85', async () => {
        const { deps, calls } = fakeBrowser({ width: 4000, height: 3000 });
        const image = await prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, deps });
        expect(calls.canvases).toEqual([[1600, 1200]]);
        expect(calls.draws[0]).toEqual(['bitmap', 0, 0, 1600, 1200]);
        expect(calls.encoded).toEqual([['image/jpeg', 0.85]]);
        expect(image).toMatchObject({ width: 1600, height: 1200 });
        expect(image.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('draws a snapshot at 2000 px on its long side', async () => {
        const { deps, calls } = fakeBrowser({ width: 5000, height: 2500 });
        await prepareImage(new Blob(['x']), { maxSide: SNAPSHOT_MAX_SIDE, deps });
        expect(calls.canvases).toEqual([[2000, 1000]]);
    });

    it('keeps a small image at its size', async () => {
        const { deps, calls } = fakeBrowser({ width: 640, height: 480 });
        const image = await prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, deps });
        expect(calls.canvases).toEqual([[640, 480]]);
        expect(image).toMatchObject({ width: 640, height: 480 });
    });

    it('paints white first: a JPEG has no transparency', async () => {
        const { deps, calls } = fakeBrowser();
        await prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, deps });
        expect(calls.fills[0]).toEqual(['#ffffff', 0, 0, 1600, 1200]);
    });

    it('frees the bitmap and the canvas', async () => {
        const { deps, calls } = fakeBrowser();
        await prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, deps });
        expect(calls.closed).toBeGreaterThan(0);
        expect(calls.released).toBe(1);
    });

    it('frees them when the image cannot be used, and says so', async () => {
        const { deps, calls } = fakeBrowser({ width: 0, height: 0 });
        await expect(prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, deps })).rejects.toThrow('no size');
        expect(calls.closed).toBeGreaterThan(0);
    });

    it('stops at once for a signal that is aborted, decoding nothing', async () => {
        const { deps } = fakeBrowser();
        const controller = new AbortController();
        controller.abort();
        await expect(prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, signal: controller.signal, deps })).rejects.toMatchObject({ name: 'AbortError' });
        expect(deps.decode).not.toHaveBeenCalled();
    });

    it('stops before encoding when it is aborted meanwhile, and frees the canvas', async () => {
        const { deps, calls } = fakeBrowser();
        const controller = new AbortController();
        deps.decode.mockImplementation(async () => {
            controller.abort();
            return { source: 'bitmap', width: 100, height: 100, close: () => { calls.closed++; } };
        });
        await expect(prepareImage(new Blob(['x']), { maxSide: PHOTO_MAX_SIDE, signal: controller.signal, deps })).rejects.toMatchObject({ name: 'AbortError' });
        expect(calls.encoded).toEqual([]);
        expect(calls.released).toBe(1);
    });
});

describe('blobToDataUrl', () => {
    it('reads a blob as a data URL', async () => {
        expect(await blobToDataUrl(new Blob(['abc'], { type: 'image/jpeg' }))).toBe('data:image/jpeg;base64,YWJj');
    });
});

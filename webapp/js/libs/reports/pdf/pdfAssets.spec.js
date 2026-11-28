import { describe, it, expect, vi } from 'vitest';
import { fetchImageBlob, loadAssets, logoRequest, planAssetWork } from '@/libs/reports/pdf/pdfAssets';
import { pageLayout, figureBox } from '@/libs/reports/pdf/pdfLayout';
import { SNAPSHOT_MAX_SIDE, PHOTO_MAX_SIDE, LOGO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';
import { pdfModel, threeItems } from '@/libs/reports/pdf/pdfDocument.fixtures';

const layout = pageLayout({ paper: 'A4', orientation: 'portrait' });
const image = tag => ({ dataUrl: `data:image/jpeg;base64,${tag}`, width: 10, height: 5 });

/** The renderers and the fetch of a dataset, answering as the real ones do. */
function fakes({ failSnapshot = false } = {}) {
    const calls = { snapshots: [], charts: [], fetched: [], prepared: [] };
    const renderers = {
        renderMapSnapshot: vi.fn(async (block, request) => {
            calls.snapshots.push({ block, request });
            if (failSnapshot) throw new Error('the map would not draw');
            return { image: new Blob(['map']), width: request.width, height: request.height, note: 'Basemap not shown: provider does not allow export' };
        }),
        renderProfileChart: vi.fn(async (block, request) => { calls.charts.push({ block, request }); return { image: null, width: 1, height: 1, note: 'No elevation layer in the cover view' }; }),
        capture3dImageUrl: vi.fn(() => null)
    };
    const queue = { run: vi.fn((task, options) => task(options?.signal)) };
    const fetchBlob = vi.fn(async (_dataset, url, options) => { calls.fetched.push({ url, ...options }); return new Blob([url]); });
    const prepare = vi.fn(async (blob, options) => { calls.prepared.push(options.maxSide); return image(String(calls.prepared.length)); });
    const dataset = { thumbUrl: (path, size) => `/thumb/${path}?size=${size}` };
    return { calls, deps: { renderers, queue, fetchBlob, prepare }, dataset };
}

const photoFeatures = () => {
    const [a, b, c] = threeItems();
    const photos = [{ path: 'photos/a.jpg', source: 'dataset' }, { path: 'photos/b.jpg', source: 'dataset' }];
    return [{ ...a, properties: { ...a.properties, photos } }, b, { ...c, properties: { ...c.properties, photos: [{ path: 'photos/a.jpg', source: 'dataset' }, { path: '../secret.jpg', source: 'dataset' }] } }];
};

describe('planAssetWork', () => {
    it('groups what needs an image by item: the cover and overview are one group, then one for each item that has some', () => {
        const model = pdfModel();
        const { groups, total } = planAssetWork(model);
        expect(total).toBe(groups.length);
        // report group, then the three items (each has a map; the first has photos too)
        expect(total).toBe(4);
        expect(groups[0].every(b => b.type === 'mapSnapshot')).toBe(true);
        expect(groups[1].map(b => b.type)).toEqual(['mapSnapshot', 'photoGrid']);
    });

    it('has no group for an item that has no image to make', () => {
        const model = pdfModel({ features: threeItems().slice(2) });
        expect(planAssetWork(model).total).toBe(2);
    });
});

describe('logoRequest', () => {
    it('is the logo of the template, fetched with the session', () => {
        expect(logoRequest({ logo: { source: 'template', url: '/orgs/a/ds/b/report-settings/logo/x' } })).toEqual({ url: '/orgs/a/ds/b/report-settings/logo/x', api: true });
    });
    it('is the logo of the organization, fetched with the session', () => {
        expect(logoRequest({ logo: { source: 'organization', url: '/orgs/a/ds/b/organization-logo?v=1' } })).toEqual({ url: '/orgs/a/ds/b/organization-logo?v=1', api: true });
    });
    it('is the logo of the instance the model resolved, fetched as a file of the site', () => {
        expect(logoRequest({ logo: { source: 'instance', url: '/images/acme.svg' } })).toEqual({ url: '/images/acme.svg', api: false });
    });
    it('is none when the model has none, whatever the instance configures', () => {
        globalThis.HubOptions = { appLogo: '/images/acme.svg' };
        try {
            expect(logoRequest({ logo: null })).toBeNull();
        } finally {
            delete globalThis.HubOptions;
        }
    });
});

describe('loadAssets', () => {
    it('renders each snapshot at the pixels of its box, and prepares it as a snapshot', async () => {
        const model = pdfModel();
        const { calls, deps, dataset } = fakes();
        const assets = await loadAssets(model, { dataset, layout, deps });
        const overview = calls.snapshots[0];
        expect(overview.request).toMatchObject({ dataset, width: figureBox(layout, overview.block).widthPx, height: figureBox(layout, overview.block).heightPx });
        for (const { request } of calls.snapshots) expect(Math.max(request.width, request.height)).toBeLessThanOrEqual(SNAPSHOT_MAX_SIDE);
        expect(calls.snapshots).toHaveLength(5);
        expect(assets.figures.get(overview.block)).toMatchObject({ image: expect.objectContaining({ dataUrl: expect.any(String) }), note: 'Basemap not shown: provider does not allow export' });
        expect(calls.prepared.filter(max => max === SNAPSHOT_MAX_SIDE)).toHaveLength(5);
    });

    it('goes through the render queue, with the signal', async () => {
        const { deps, dataset } = fakes();
        const controller = new AbortController();
        await loadAssets(pdfModel(), { dataset, layout, deps, signal: controller.signal });
        expect(deps.queue.run).toHaveBeenCalled();
        expect(deps.queue.run.mock.calls.every(([, options]) => options.signal === controller.signal)).toBe(true);
    });

    it('fetches a photo as a thumbnail of the limit size, prepares it as a photo, and reads one that two items have once', async () => {
        const { calls, deps, dataset } = fakes();
        const assets = await loadAssets(pdfModel({ features: photoFeatures() }), { dataset, layout, deps });
        const urls = calls.fetched.map(f => f.url).filter(u => u.startsWith('/thumb/'));
        expect(urls.sort()).toEqual([`/thumb/photos/a.jpg?size=${PHOTO_MAX_SIDE}`, `/thumb/photos/b.jpg?size=${PHOTO_MAX_SIDE}`]);
        expect(calls.fetched.filter(f => f.url.startsWith('/thumb/')).every(f => f.api)).toBe(true);
        expect(calls.prepared.filter(max => max === PHOTO_MAX_SIDE)).toHaveLength(2);
        expect(assets.photos.get('photos/a.jpg')).toBeTruthy();
    });

    it('asks for the photos at the size it is given, and prepares them at it (a report with many has them smaller)', async () => {
        const { calls, deps, dataset } = fakes();
        await loadAssets(pdfModel({ features: photoFeatures() }), { dataset, layout, deps, photoMaxSide: 900 });
        expect(calls.fetched.map(f => f.url).filter(u => u.startsWith('/thumb/')).sort()).toEqual(['/thumb/photos/a.jpg?size=900', '/thumb/photos/b.jpg?size=900']);
        expect(calls.prepared.filter(max => max === 900)).toHaveLength(2);
        expect(calls.prepared).not.toContain(PHOTO_MAX_SIDE);
    });

    it('never reads a path that is not a path of the dataset', async () => {
        const { calls, deps, dataset } = fakes();
        const assets = await loadAssets(pdfModel({ features: photoFeatures() }), { dataset, layout, deps });
        expect(calls.fetched.some(f => f.url.includes('secret'))).toBe(false);
        expect(assets.photos.get('../secret.jpg')).toBeNull();
    });

    it('leaves a photo that cannot be read as null, and goes on', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deps, dataset } = fakes();
        deps.fetchBlob.mockImplementation(async (_d, url) => { if (url.includes('b.jpg')) throw new Error('The server answered 404'); return new Blob(['x']); });
        const assets = await loadAssets(pdfModel({ features: photoFeatures() }), { dataset, layout, deps });
        expect(assets.photos.get('photos/b.jpg')).toBeNull();
        expect(assets.photos.get('photos/a.jpg')).toBeTruthy();
        warn.mockRestore();
    });

    it('says under the figure why a snapshot could not be made, and goes on', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deps, dataset } = fakes({ failSnapshot: true });
        const assets = await loadAssets(pdfModel(), { dataset, layout, deps });
        const notes = [...assets.figures.values()].map(f => f.note);
        expect(notes.length).toBe(5);
        expect(notes.every(n => n === 'Snapshot not available: the map would not draw')).toBe(true);
        expect([...assets.figures.values()].every(f => f.image === null)).toBe(true);
        warn.mockRestore();
    });

    it('keeps the note of a chart that has no image', async () => {
        const features = [{ type: 'Feature', id: 'p1', geometry: { type: 'LineString', coordinates: [[11, 45], [11.001, 45.001]] }, properties: { id: 'p1', ref: 1, measurementType: 'profile', name: 'Profile', createdAt: '2026-11-01T10:00:00.000Z' } }];
        const { calls, deps, dataset } = fakes();
        const assets = await loadAssets(pdfModel({ features }), { dataset, layout, deps });
        expect(calls.charts).toHaveLength(1);
        expect(assets.figures.get(calls.charts[0].block)).toEqual({ image: null, note: 'No elevation layer in the cover view' });
    });

    it('fetches the stored capture of a 3D item and prepares it as a snapshot', async () => {
        const { calls, deps, dataset } = fakes();
        deps.renderers.capture3dImageUrl.mockReturnValue('/orgs/a/ds/b/download/m/annotations/x-3d.webp?inline=1');
        const model = pdfModel({ features: [{ ...threeItems()[0], properties: { ...threeItems()[0].properties, localCoordinates: [[1, 2, 3]], snapshot: { path: 'm/annotations/a1-3d.webp', camera: { position: [0, 0, 0], target: [1, 1, 1] } } } }] });
        const assets = await loadAssets(model, { dataset, layout, deps });
        const capture = planAssetWork(model).groups.flat().find(b => b.type === 'capture3d');
        expect(capture).toBeTruthy();
        expect(calls.fetched.some(f => f.url.includes('x-3d.webp') && f.api)).toBe(true);
        expect(assets.figures.get(capture).image).toBeTruthy();
    });

    it('reports 0 of N, then each item as it is rendered, and N of N at the end', async () => {
        const { deps, dataset } = fakes();
        const progress = [];
        await loadAssets(pdfModel(), { dataset, layout, deps, onProgress: p => progress.push(p) });
        expect(progress[0]).toEqual({ done: 0, total: 4 });
        expect(progress.map(p => p.done)).toEqual([0, 1, 2, 3, 4]);
        expect(progress.at(-1)).toEqual({ done: 4, total: 4 });
    });

    it('prepares the logo as a logo, with the session for the logo of a template', async () => {
        const { calls, deps, dataset } = fakes();
        const model = { ...pdfModel(), logo: { source: 'template', url: '/orgs/a/ds/b/report-settings/logo/x' } };
        const assets = await loadAssets(model, { dataset, layout, deps });
        expect(calls.fetched[0]).toMatchObject({ url: '/orgs/a/ds/b/report-settings/logo/x', api: true });
        expect(calls.prepared[0]).toBe(LOGO_MAX_SIDE);
        expect(assets.logo).toBeTruthy();
    });

    it('stops when the signal is aborted: nothing more is rendered and the promise rejects', async () => {
        const { calls, deps, dataset } = fakes();
        const controller = new AbortController();
        deps.renderers.renderMapSnapshot.mockImplementation(async (block, request) => {
            calls.snapshots.push({ block, request });
            controller.abort();
            return { image: new Blob(['x']), note: null };
        });
        await expect(loadAssets(pdfModel(), { dataset, layout, deps, signal: controller.signal })).rejects.toBeDefined();
        // the first group (the cover and the overview) ran; no item after it
        expect(calls.snapshots.length).toBeLessThanOrEqual(2);
    });

    it('does not treat a cancel as the failure of an image', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deps, dataset } = fakes();
        const controller = new AbortController();
        deps.renderers.renderMapSnapshot.mockImplementation(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError'); });
        await expect(loadAssets(pdfModel(), { dataset, layout, deps, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('fetchImageBlob', () => {
    it('uses the Registry client for its own endpoints, so that the session goes with the request', async () => {
        const blob = new Blob(['x']);
        const dataset = { registry: { fetchRaw: vi.fn(async () => ({ ok: true, blob: async () => blob })) } };
        expect(await fetchImageBlob(dataset, '/orgs/a/ds/b/thumb?path=x', { api: true })).toBe(blob);
        expect(dataset.registry.fetchRaw).toHaveBeenCalledWith('/orgs/a/ds/b/thumb?path=x', { signal: undefined });
    });

    it('uses fetch for any other address', async () => {
        const blob = new Blob(['x']);
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => blob });
        expect(await fetchImageBlob({}, '/images/logo.svg', { api: false })).toBe(blob);
        fetchSpy.mockRestore();
    });

    it('says what the server answered when it does not give the image', async () => {
        const dataset = { registry: { fetchRaw: vi.fn(async () => ({ ok: false, status: 404 })) } };
        await expect(fetchImageBlob(dataset, '/x', { api: true })).rejects.toThrow('404');
    });
});

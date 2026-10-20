/**
 * HUB-06 baseline: the Registry client performs one HTTP round trip per call, with
 * no in-flight de-duplication, no short-lived read cache and no cancellation hook.
 *
 * Run with: npx vitest run webapp/js/ImprovementBaselines/registryClient.baseline.spec.js
 *
 * HUB-06 landed: the former baselines are inverted into regression tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Registry from '@/libs/ddb/registry';

function jsonResponse(body) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('HUB-06 Registry client request behaviour', () => {
    let fetchMock;
    beforeEach(() => {
        // The read cache is shared per origin: every test starts from an empty one
        new Registry('http://registry.test').invalidateCache();
        fetchMock = vi.fn(async (url) => jsonResponse({ url: String(url), t: Date.now() }));
        vi.stubGlobal('fetch', fetchMock);
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    it('dataset info is reused for a few seconds instead of re-fetched on every navigation', async () => {
        const reg = new Registry('http://registry.test');
        const ds = reg.Organization('admin').Dataset('photos');
        await ds.info(); await ds.info(); await ds.info();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clients of the same origin share one read cache (features are loaded once)', async () => {
        const a = new Registry('http://registry.test');
        const b = new Registry('http://registry.test');   // e.g. a helper creating its own client
        await a.loadFeatures(); await b.loadFeatures();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(Registry.forUrl('http://registry.test')).toBe(Registry.forUrl('http://registry.test'));
    });

    it('a write drops the cached reads; listings, which are reads sent as POST, do not', async () => {
        const reg = new Registry('http://registry.test');
        const ds = reg.Organization('admin').Dataset('photos');
        await ds.info();
        await ds.list('folder');
        await ds.info();
        expect(fetchMock).toHaveBeenCalledTimes(2); // info, list

        await ds.update('New name');
        await ds.info();
        expect(fetchMock).toHaveBeenCalledTimes(4); // + update, + info again
    });

    it('callers get their own copy of a shared answer', async () => {
        const reg = new Registry('http://registry.test');
        const [a, b] = await Promise.all([reg.getRequest('/orgs/admin/'), reg.getRequest('/orgs/admin/')]);
        a.changed = true;
        expect(b.changed).toBeUndefined();
    });

    it('a 304 answers with the body kept from the previous 200', async () => {
        const reg = new Registry('http://registry.test');
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify([{ id: 1 }]),
            { status: 200, headers: { 'Content-Type': 'application/json', ETag: 'W/"v1"' } }));
        fetchMock.mockImplementationOnce(async (url, opts) => {
            expect(opts.headers['If-None-Match']).toBe('W/"v1"');
            return new Response(null, { status: 304 });
        });
        expect(await reg.getRequest('/orgs/admin/ds/photos/tasks?take=200')).toEqual([{ id: 1 }]);
        expect(await reg.getRequest('/orgs/admin/ds/photos/tasks?take=200')).toEqual([{ id: 1 }]);
    });

    it('target: concurrent identical GETs are coalesced into one request', async () => {
        const reg = new Registry('http://registry.test');
        await Promise.all([reg.getRequest('/orgs/admin/'), reg.getRequest('/orgs/admin/')]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('target: a GET accepts an AbortSignal and aborts the underlying fetch', async () => {
        const reg = new Registry('http://registry.test');
        const ac = new AbortController();
        let seenSignal = null;
        fetchMock.mockImplementation(async (url, opts) => { seenSignal = opts?.signal; return jsonResponse({}); });
        await reg.getRequest('/orgs/admin/ds/photos/list', { signal: ac.signal });
        // The caller's signal is combined with the request timeout: aborting it aborts the fetch
        expect(seenSignal.aborted).toBe(false);
        ac.abort();
        expect(seenSignal.aborted).toBe(true);
    });

    it('an aborted request rejects with an AbortError', async () => {
        const reg = new Registry('http://registry.test');
        const ac = new AbortController();
        fetchMock.mockImplementation((url, opts) => new Promise((_, reject) =>
            opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
        const p = reg.getRequest('/orgs/admin/ds/photos/list', { signal: ac.signal });
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('target: descriptors asked with a signal are still shared, and an abort stops only that caller', async () => {
        const reg = new Registry('http://registry.test');
        let release;
        fetchMock.mockImplementation(() => new Promise(resolve => { release = () => resolve(jsonResponse({ slug: 'photos' })); }));
        const leaving = new AbortController();
        const first = reg.getRequest('/orgs/admin/ds/photos', { signal: leaving.signal });
        const second = reg.getRequest('/orgs/admin/ds/photos', { signal: new AbortController().signal });
        leaving.abort();
        release();

        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        await expect(second).resolves.toEqual({ slug: 'photos' });
        // Files -> Map -> Files: the dataset info comes from the cache the second time
        await expect(reg.getRequest('/orgs/admin/ds/photos', { signal: new AbortController().signal })).resolves.toEqual({ slug: 'photos' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('a GET made after a write does not reuse a read that started before it', async () => {
        const reg = new Registry('http://registry.test');
        const ds = reg.Organization('admin').Dataset('photos');
        let release;
        fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(jsonResponse({ name: 'old' })); }));
        const before = ds.info();
        await ds.update('new');
        fetchMock.mockImplementationOnce(async () => jsonResponse({ name: 'new' }));
        const after = ds.info();
        release();

        await expect(before).resolves.toEqual({ name: 'old' });
        await expect(after).resolves.toEqual({ name: 'new' });
        expect(fetchMock).toHaveBeenCalledTimes(3); // info, update, info again
    });

    it('a dataset page without X-Total-Count counts its items', async () => {
        const reg = new Registry('http://registry.test');
        fetchMock.mockImplementationOnce(async () => jsonResponse([{ slug: 'a' }, { slug: 'b' }]));
        const page = await reg.Organization('admin').datasetsPage({ skip: 0, take: 10 });
        expect(page.total).toBe(2);
    });

    it('a dataset page reads its total from X-Total-Count', async () => {
        const reg = new Registry('http://registry.test');
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify([{ slug: 'a' }]),
            { status: 200, headers: { 'Content-Type': 'application/json', 'X-Total-Count': '42' } }));
        const page = await reg.Organization('admin').datasetsPage({ skip: 0, take: 1 });
        expect(page.total).toBe(42);
    });
});

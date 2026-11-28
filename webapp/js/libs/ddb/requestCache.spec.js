/**
 * RequestCache: single flight, the short read cache, conditional requests and what a write drops.
 */
import { describe, it, expect, vi } from 'vitest';
import RequestCache from './requestCache';

const FEATURES = '/sys/features';   // reused for 30 s

describe('RequestCache copies', () => {
    it('gives the caller that started the request its own copy, as it does the ones that joined', async () => {
        const cache = new RequestCache();
        const stored = { items: [1, 2] };
        const load = vi.fn(async () => ({ value: stored }));

        const [first, second] = await Promise.all([cache.get(FEATURES, load), cache.get(FEATURES, load)]);
        first.items.push('changed by the first caller');

        // What is kept, and what the other caller got, is not what the first caller changed
        expect(stored.items).toEqual([1, 2]);
        expect(second.items).toEqual([1, 2]);
        expect((await cache.get(FEATURES, load)).items).toEqual([1, 2]);
        expect(load).toHaveBeenCalledOnce();
    });

    it('gives a copy of a cached answer, too', async () => {
        const cache = new RequestCache();
        const a = await cache.get(FEATURES, async () => ({ value: { n: 1 } }));
        a.n = 99;
        expect(await cache.get(FEATURES, async () => ({ value: { n: 2 } }))).toEqual({ n: 1 });
    });
});

describe('RequestCache single flight and TTL', () => {
    it('shares one request between identical GETs in flight', async () => {
        const cache = new RequestCache();
        let resolve;
        const load = vi.fn(() => new Promise(r => { resolve = r; }));
        const a = cache.get('/x', load);
        const b = cache.get('/x', load);
        resolve({ value: { ok: true } });
        expect(await a).toEqual({ ok: true });
        expect(await b).toEqual({ ok: true });
        expect(load).toHaveBeenCalledOnce();
    });

    it('keeps only the endpoints of the allow-list, until their TTL ends', async () => {
        let now = 1000;
        const cache = new RequestCache(() => now);
        const load = vi.fn(async () => ({ value: { n: 1 } }));

        await cache.get('/orgs/a/ds/b', load);     // 5 s
        await cache.get('/orgs/a/ds/b', load);
        expect(load).toHaveBeenCalledTimes(1);
        now += 5001;
        await cache.get('/orgs/a/ds/b', load);
        expect(load).toHaveBeenCalledTimes(2);

        await cache.get('/not/listed', load);
        await cache.get('/not/listed', load);
        expect(load).toHaveBeenCalledTimes(4);
    });
});

describe('RequestCache conditional requests', () => {
    it('sends the ETag back and returns the kept body on a 304', async () => {
        const cache = new RequestCache();
        const load = vi.fn()
            .mockResolvedValueOnce({ value: { tasks: [1] }, etag: '"v1"' })
            .mockResolvedValueOnce({ notModified: true });
        expect(await cache.get('/tasks', load)).toEqual({ tasks: [1] });
        expect(await cache.get('/tasks', load)).toEqual({ tasks: [1] });
        expect(load.mock.calls[0][0]).toEqual({ etag: undefined });
        expect(load.mock.calls[1][0]).toEqual({ etag: '"v1"' });
    });
});

describe('RequestCache writes', () => {
    it('drops the answers, all or those that start with a prefix', async () => {
        const cache = new RequestCache();
        const load = vi.fn(async () => ({ value: 1 }));
        await cache.get('/orgs/a/', load);
        await cache.get('/orgs/b/', load);
        cache.invalidate('/orgs/a');
        await cache.get('/orgs/a/', load);
        await cache.get('/orgs/b/', load);
        expect(load).toHaveBeenCalledTimes(3);
        cache.invalidate();
        await cache.get('/orgs/b/', load);
        expect(load).toHaveBeenCalledTimes(4);
    });

    it('does not keep, nor hand to a later GET, an answer whose request started before the drop', async () => {
        const cache = new RequestCache();
        let resolveOld;
        const old = cache.get(FEATURES, () => new Promise(r => { resolveOld = r; }));
        cache.invalidate();

        const fresh = await cache.get(FEATURES, async () => ({ value: { v: 'new' } }));
        resolveOld({ value: { v: 'old' } });
        expect(await old).toEqual({ v: 'old' });

        expect(fresh).toEqual({ v: 'new' });
        expect(await cache.get(FEATURES, async () => ({ value: { v: 'third' } }))).toEqual({ v: 'new' });
    });

    it('does not keep an answer that arrives after a second drop, the one a write makes when it ends', async () => {
        const cache = new RequestCache();
        let resolveRead;
        // A read that starts while a write runs (after the drop at its start)
        cache.invalidate();
        const read = cache.get(FEATURES, () => new Promise(r => { resolveRead = r; }));
        cache.invalidate();   // the write ended
        resolveRead({ value: { v: 'seen before the write ended' } });
        await read;

        expect(await cache.get(FEATURES, async () => ({ value: { v: 'after' } }))).toEqual({ v: 'after' });
    });
});

describe('RequestCache abortable reads', () => {
    it('stops waiting for the caller that aborts, the shared request runs on', async () => {
        const cache = new RequestCache();
        let resolve;
        const load = vi.fn(() => new Promise(r => { resolve = r; }));
        const controller = new AbortController();
        const waiting = cache.getAbortable(FEATURES, load, controller.signal).catch(e => e);
        controller.abort();
        expect((await waiting).name).toBe('AbortError');

        resolve({ value: { ok: 1 } });
        expect(await cache.get(FEATURES, load)).toEqual({ ok: 1 });
        expect(load).toHaveBeenCalledOnce();
    });

    it('rejects at once for a signal that is aborted already', async () => {
        const cache = new RequestCache();
        const load = vi.fn();
        await expect(cache.getAbortable(FEATURES, load, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
        expect(load).not.toHaveBeenCalled();
    });
});

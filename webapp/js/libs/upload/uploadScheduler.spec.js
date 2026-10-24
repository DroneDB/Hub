/**
 * Unit tests for the upload pipeline of the Hub (UPL-01): scheduler, planner, requests.
 * Run with: npx vitest run webapp/js/libs/upload
 */
import { describe, it, expect, vi } from 'vitest';
import { createUploadScheduler, STATUS } from './uploadScheduler';
import { planNextJob, BUNDLE_MAX_FILES, BUNDLE_MAX_BYTES, SMALL_FILE_BYTES, CHUNKED_FILE_BYTES } from './uploadPlanner';
import { createAimdConcurrency, useResilientUpload } from '@/composables/useResilientUpload';
import { createUploadRequests } from './uploadRequests';
import { uploadConcurrency, negotiatedProtocol } from './protocolLimits';
import { windowHint } from './uploadProbe';

const file = (i, size = 5 * 1024 * 1024) => ({ id: `f${i}`, file: {}, name: `f${i}.jpg`, path: `f${i}.jpg`, size });
const flush = () => new Promise(r => setTimeout(r, 0));

function policy(overrides = {}) {
    return { ...useResilientUpload({ parallelUploads: 16 }), computeRetryDelayMs: () => 0, ...overrides };
}

/** A fake server: every request is held until the test releases it */
function heldServer() {
    const pending = [];
    const started = [];
    return {
        started,
        pending,
        send: (job, hooks) => new Promise(resolve => {
            started.push(job);
            pending.push({ job, hooks, resolve });
        }),
        releaseNext(result = 'ok') {
            const { job, resolve } = pending.shift();
            resolve(job.items.map(i => result === 'ok' ? { id: i.id, ok: true, entry: { path: i.path } } : { id: i.id, ...result }));
        }
    };
}

describe('uploadScheduler', () => {
    it('keeps every slot busy while files are queued, without waiting for a timer', async () => {
        const server = heldServer();
        const scheduler = createUploadScheduler({ send: server.send, maxConcurrency: () => 6, policy: policy() });
        scheduler.add(Array.from({ length: 20 }, (_, i) => file(i)));
        await flush();
        expect(server.pending.length).toBe(6);

        for (let done = 0; done < 14; done++) {
            server.releaseNext();
            await flush();
            // The freed slot was taken at once
            expect(server.pending.length).toBe(6);
        }
        while (server.pending.length) { server.releaseNext(); await flush(); }
        expect(scheduler.snapshot().counts.done).toBe(20);
        expect(scheduler.snapshot().done).toBe(true);
    });

    it('never runs more requests than the protocol allows, and starts files in queue order', async () => {
        const server = heldServer();
        const scheduler = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, policy: policy() });
        scheduler.add([file(0), file(1), file(2), file(3)]);
        await flush();
        expect(server.pending.length).toBe(2);
        server.releaseNext(); await flush();
        server.releaseNext(); await flush();
        server.releaseNext(); await flush();
        server.releaseNext(); await flush();
        expect(server.started.map(j => j.items[0].id)).toEqual(['f0', 'f1', 'f2', 'f3']);
    });

    it('shows a fully sent file as processing until the server answers', async () => {
        const server = heldServer();
        const scheduler = createUploadScheduler({ send: server.send, maxConcurrency: () => 6, policy: policy() });
        scheduler.add([file(0)]);
        await flush();

        server.pending[0].hooks.onProgress('f0', 1024);
        expect(scheduler.snapshot().items[0].status).toBe(STATUS.UPLOADING);
        server.pending[0].hooks.onUploaded(['f0']);
        const snap = scheduler.snapshot();
        expect(snap.items[0].status).toBe(STATUS.PROCESSING);
        expect(snap.counts.processing).toBe(1);
        expect(snap.bytesSent).toBe(snap.totalBytes); // nothing left for the ETA

        server.releaseNext(); await flush();
        expect(scheduler.snapshot().items[0].status).toBe(STATUS.DONE);
    });

    it('backs off only on server-declared backpressure, never below the floor', async () => {
        const aimd = createAimdConcurrency(16);
        const server = heldServer();
        const scheduler = createUploadScheduler({
            send: server.send, maxConcurrency: () => 16, policy: policy({ aimd })
        });
        scheduler.add(Array.from({ length: 40 }, (_, i) => file(i)));
        await flush();

        server.releaseNext({ ok: false, status: 0 }); await flush();
        expect(aimd.current).toBe(16); // a network error says nothing about the server

        server.releaseNext({ ok: false, status: 503, retryAfter: null }); await flush();
        expect(aimd.current).toBe(16); // no Retry-After: not backpressure

        server.releaseNext({ ok: false, status: 503, retryAfter: 2 }); await flush();
        expect(aimd.current).toBe(8);
        server.releaseNext({ ok: false, status: 429, retryAfter: 1 }); await flush();
        server.releaseNext({ ok: false, status: 429, retryAfter: 1 }); await flush();
        expect(aimd.current).toBe(4);
        scheduler.cancelAll();
    });

    it('retries transient failures, stops on refusals, and retries a failed file on request', async () => {
        const clock = { now: () => 0, setTimeout: vi.fn(f => { f(); return 1; }), clearTimeout: vi.fn() };
        const server = heldServer();
        const scheduler = createUploadScheduler({
            send: server.send, maxConcurrency: () => 1, clock, throttleMs: 0, policy: policy({ maxRetries: 2 })
        });
        scheduler.add([file(0), file(1)]);
        await flush();

        server.releaseNext({ ok: false, status: 400, error: 'Extension blocked', noRetry: true }); await flush();
        let f0 = scheduler.snapshot().items[0];
        expect(f0.status).toBe(STATUS.ERROR);
        expect(f0.canRetry).toBe(false);
        expect(f0.errorMessage).toBe('Extension blocked');

        server.releaseNext({ ok: false, status: 502 }); await flush(); // retry 1
        server.releaseNext({ ok: false, status: 502 }); await flush(); // retry 2
        server.releaseNext({ ok: false, status: 502 }); await flush(); // out of retries
        const f1 = scheduler.snapshot().items[1];
        expect(f1.status).toBe(STATUS.ERROR);
        expect(f1.canRetry).toBe(true);
        expect(server.started.length).toBe(4);

        scheduler.retry('f1');
        await flush();
        server.releaseNext(); await flush();
        expect(scheduler.snapshot().items[1].status).toBe(STATUS.DONE);
    });

    it('throttles snapshots but always delivers the last change', async () => {
        let t = 0;
        const timers = [];
        const clock = { now: () => t, setTimeout: (f, ms) => { timers.push({ f, at: t + ms }); return timers.length; }, clearTimeout: () => {} };
        const onChange = vi.fn();
        const server = heldServer();
        const scheduler = createUploadScheduler({ send: server.send, maxConcurrency: () => 1, clock, onChange, policy: policy() });
        scheduler.add([file(0)]);
        await flush();
        onChange.mockClear();

        for (let i = 1; i <= 100; i++) server.pending[0].hooks.onProgress('f0', i * 1000);
        expect(onChange.mock.calls.length).toBeLessThanOrEqual(1);
        t += 250;
        timers.splice(0).forEach(x => x.f());
        expect(onChange.mock.lastCall[0].bytesSent).toBe(100 * 1000);
    });

    it('reports activity: busy while requests run, idle once the queue is empty', async () => {
        const onActivity = vi.fn();
        const server = heldServer();
        const scheduler = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, onActivity, policy: policy() });
        scheduler.add([file(0)]);
        await flush();
        expect(onActivity).toHaveBeenLastCalledWith(true);
        server.releaseNext(); await flush();
        expect(onActivity).toHaveBeenLastCalledWith(false);
    });
});

describe('uploadPlanner', () => {
    const sized = (...sizes) => sizes.map((size, i) => ({ id: i, size }));

    it('bundles consecutive small files up to 32 files and 8 MB', () => {
        const many = sized(...Array(40).fill(1000));
        const job = planNextJob(many);
        expect(job.kind).toBe('bundle');
        expect(job.items).toHaveLength(BUNDLE_MAX_FILES);

        const heavy = sized(...Array(20).fill(SMALL_FILE_BYTES - 1));
        const capped = planNextJob(heavy);
        expect(capped.items.reduce((a, i) => a + i.size, 0)).toBeLessThanOrEqual(BUNDLE_MAX_BYTES);
    });

    it('never reorders: a large file ends the bundle, then goes alone', () => {
        const ready = sized(10, 20, 5 * SMALL_FILE_BYTES, 30);
        expect(planNextJob(ready).items.map(i => i.id)).toEqual([0, 1]);
        expect(planNextJob(ready.slice(2)).kind).toBe('single');
    });

    it('sends files above 256 MB as chunks, and a lone small file as a single request', () => {
        expect(planNextJob(sized(CHUNKED_FILE_BYTES + 1)).kind).toBe('chunked');
        expect(planNextJob(sized(10)).kind).toBe('single');
        expect(planNextJob([])).toBeNull();
    });
});

describe('uploadRequests', () => {
    const item = (id, size = 10) => ({ id, name: id, path: id, size, file: new Blob(['x'.repeat(size)]) });
    const hooks = () => ({ signal: undefined, onProgress: vi.fn(), onUploaded: vi.fn() });

    function requests(transport, getJson) {
        return createUploadRequests({
            baseUrl: 'http://hub/orgs/o/ds/d', authToken: () => 't', destination: i => i.path,
            transport, getJson, sleep: () => Promise.resolve()
        });
    }

    it('asks for the receipt instead of uploading again after a 504 that followed the last byte', async () => {
        const transport = vi.fn(async () => ({ status: 504, body: null, uploaded: true }));
        const getJson = vi.fn()
            .mockResolvedValueOnce({ status: 202, body: { state: 'Committing' } })
            .mockResolvedValueOnce({ status: 200, body: { state: 'Done', results: [{ status: 201, entry: { path: 'a' } }] } });

        const [result] = await requests(transport, getJson).send({ kind: 'single', items: [item('a')] }, hooks());

        expect(result).toEqual({ id: 'a', ok: true, entry: { path: 'a' } });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(transport.mock.calls[0][0].headers['X-Upload-Id']).toBeTruthy();
        expect(getJson.mock.calls[0][0]).toContain('/obj/uploads/');
    });

    it('sends again when the server does not know the upload, and keeps the same id', async () => {
        const transport = vi.fn(async () => ({ status: 504, body: null, uploaded: true }));
        const getJson = vi.fn(async () => ({ status: 404, body: null }));
        const it0 = item('a');
        const r = requests(transport, getJson);

        const [first] = await r.send({ kind: 'single', items: [it0] }, hooks());
        expect(first.ok).toBe(false);
        expect(first.noRetry).toBeFalsy();
        await r.send({ kind: 'single', items: [it0] }, hooks());
        expect(transport.mock.calls[1][0].headers['X-Upload-Id']).toBe(transport.mock.calls[0][0].headers['X-Upload-Id']);
    });

    it('a 504 before the body was sent is an ordinary failure (no receipt query)', async () => {
        const transport = vi.fn(async () => ({ status: 504, body: null, uploaded: false }));
        const getJson = vi.fn();
        const [result] = await requests(transport, getJson).send({ kind: 'single', items: [item('a')] }, hooks());
        expect(result.status).toBe(504);
        expect(getJson).not.toHaveBeenCalled();
    });

    it('shows the message of a ProblemDetails failure (and of the legacy { error } body)', async () => {
        const problem = { status: 409, uploaded: true, body: { title: 'Conflict', status: 409, detail: 'Destination exists', noRetry: true } };
        const legacy = { status: 400, uploaded: true, body: { error: 'Invalid path', noRetry: true } };
        const [p] = await requests(vi.fn(async () => problem), vi.fn()).send({ kind: 'single', items: [item('a')] }, hooks());
        const [l] = await requests(vi.fn(async () => legacy), vi.fn()).send({ kind: 'single', items: [item('b')] }, hooks());
        expect(p).toMatchObject({ ok: false, status: 409, error: 'Destination exists', noRetry: true });
        expect(l).toMatchObject({ ok: false, status: 400, error: 'Invalid path', noRetry: true });
    });

    it('maps the per-file results of a bundle', async () => {
        const transport = vi.fn(async () => ({
            status: 200, uploaded: true,
            body: [{ status: 201, entry: { path: 'a' } }, { status: 400, error: 'blocked', retryable: false }]
        }));
        const results = await requests(transport, vi.fn()).send({ kind: 'bundle', items: [item('a'), item('b')] }, hooks());
        expect(results[0]).toEqual({ id: 'a', ok: true, entry: { path: 'a' } });
        expect(results[1]).toMatchObject({ id: 'b', ok: false, status: 400, error: 'blocked', noRetry: true });
    });

    it('resumes a chunked upload with the missing chunks only, then commits', async () => {
        const sent = [];
        const transport = vi.fn(async ({ url, body }) => {
            if (url.endsWith('/commit')) return { status: 201, body: { path: 'big' }, uploaded: true };
            sent.push(body.get('chunkIndex'));
            return { status: 200, body: {}, uploaded: true };
        });
        const getJson = vi.fn(async () => ({ status: 200, body: { missing: [1, 3] } }));
        const r = createUploadRequests({
            baseUrl: 'http://hub/orgs/o/ds/d', authToken: () => null, destination: i => i.path,
            transport, getJson, chunkBytes: 10
        });

        const [result] = await r.send({ kind: 'chunked', items: [item('big', 35)] }, hooks());

        expect(sent).toEqual(['1', '3']);
        expect(result).toEqual({ id: 'big', ok: true, entry: { path: 'big' } });
    });

    it('commits straight away when every chunk is already stored (the commit answer was lost)', async () => {
        const urls = [];
        const transport = vi.fn(async ({ url }) => {
            urls.push(url);
            return { status: 201, body: { path: 'big' }, uploaded: true };
        });
        const getJson = vi.fn(async () => ({ status: 200, body: { missing: [] } }));
        const r = createUploadRequests({
            baseUrl: 'http://hub/orgs/o/ds/d', authToken: () => null, destination: i => i.path,
            transport, getJson, chunkBytes: 10
        });

        const [result] = await r.send({ kind: 'chunked', items: [item('big', 35)] }, hooks());

        // No chunk is sent again: the only request is the commit
        expect(urls).toHaveLength(1);
        expect(urls[0]).toMatch(/\/obj\/chunk\/[^/]+\/commit$/);
        expect(result).toEqual({ id: 'big', ok: true, entry: { path: 'big' } });
    });
});

describe('protocol limits and probe hint', () => {
    it('allows 16 streams on h2/h3 and 6 connections otherwise', () => {
        expect(uploadConcurrency('h2')).toBe(16);
        expect(uploadConcurrency('h3')).toBe(16);
        expect(uploadConcurrency('http/1.1')).toBe(6);
        expect(uploadConcurrency(null)).toBe(6);
    });

    it('reads the negotiated protocol from Resource Timing', () => {
        const perf = {
            getEntriesByType: type => type === 'resource'
                ? [{ name: 'http://hub/a.js', nextHopProtocol: 'http/1.1' }, { name: 'http://hub/orgs', nextHopProtocol: 'h2' }]
                : []
        };
        expect(negotiatedProtocol('http://hub', perf)).toBe('h2');
        expect(negotiatedProtocol('http://other', perf)).toBeNull();
    });

    it('names the proxy window when an h2 stream runs at window / RTT', () => {
        // 64 KB / 40 ms = 1.56 MB/s: the nginx default window
        expect(windowHint('h2', 40, 1.6)?.windowBytes).toBe(64 * 1024);
        // 1 MB / 40 ms = 25 MB/s
        expect(windowHint('h2', 40, 24)?.windowBytes).toBe(1024 * 1024);
        expect(windowHint('h2', 40, 80)).toBeNull();
        expect(windowHint('http/1.1', 40, 1.6)).toBeNull();
    });
});

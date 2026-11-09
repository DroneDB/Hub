/**
 * uploadRequests and names that exist (FR-UPL-03, D-040): `overwrite=true` goes before the file part
 * (the Registry reads the flag sent before the file), only for an item that replaces; a 409 with
 * conflictPath is passed on, and the next attempt is a new upload (a new id).
 * Run with: npx vitest run webapp/js/libs/upload
 */
import { describe, it, expect, vi } from 'vitest';
import { createUploadRequests } from './uploadRequests';

const item = (id, extra = {}) => ({ id, name: id, path: id, size: 10, file: new Blob(['x'.repeat(10)]), ...extra });
const hooks = () => ({ signal: undefined, onProgress: vi.fn(), onUploaded: vi.fn() });
const fieldNames = form => [...form.keys()];

function requests(transport, getJson = vi.fn(async () => ({ status: 404, body: null })), extra = {}) {
    return createUploadRequests({
        baseUrl: 'http://hub/orgs/o/ds/d', authToken: () => 't', destination: i => i.path,
        transport, getJson, sleep: () => Promise.resolve(), ...extra
    });
}

const CLASH = {
    title: 'Conflict', status: 409, noRetry: true, conflictPath: 'A',
    detail: 'A file or folder named "a" already exists in this folder'
};

describe('uploadRequests overwrite', () => {
    it('sends overwrite before the file of a single upload that replaces, and nothing otherwise', async () => {
        const transport = vi.fn(async () => ({ status: 201, body: { path: 'a' }, uploaded: true }));
        const r = requests(transport);

        await r.send({ kind: 'single', items: [item('a', { overwrite: true })] }, hooks());
        await r.send({ kind: 'single', items: [item('b')] }, hooks());

        expect(fieldNames(transport.mock.calls[0][0].body)).toEqual(['path', 'overwrite', 'file']);
        expect(transport.mock.calls[0][0].body.get('overwrite')).toBe('true');
        expect(fieldNames(transport.mock.calls[1][0].body)).toEqual(['path', 'file']);
    });

    it('sends the flag of each file of a bundle before that file', async () => {
        const transport = vi.fn(async () => ({ status: 200, body: [{ status: 201 }, { status: 201 }], uploaded: true }));

        await requests(transport).send({ kind: 'bundle', items: [item('a'), item('b', { overwrite: true })] }, hooks());

        expect(fieldNames(transport.mock.calls[0][0].body)).toEqual(['path', 'file', 'path', 'overwrite', 'file']);
    });

    it('sends the flag in every chunk, before the chunk', async () => {
        const forms = [];
        const transport = vi.fn(async ({ url, body }) => {
            if (url.endsWith('/commit')) return { status: 201, body: { path: 'big' }, uploaded: true };
            forms.push(fieldNames(body));
            return { status: 200, body: {}, uploaded: true };
        });

        await requests(transport, undefined, { chunkBytes: 4 })
            .send({ kind: 'chunked', items: [item('big', { overwrite: true })] }, hooks());

        expect(forms).toHaveLength(3);
        for (const names of forms) expect(names.indexOf('overwrite')).toBe(names.indexOf('chunk') - 1);
    });
});

describe('uploadRequests conflicts', () => {
    it('passes the conflictPath of a 409 on; Replace keeps the id, Keep both (a new path) gets a new one', async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce({ status: 409, body: CLASH, uploaded: true })
            .mockResolvedValue({ status: 201, body: { path: 'A' }, uploaded: true });
        const it0 = item('a');
        const r = requests(transport);
        const idOf = call => transport.mock.calls[call][0].headers['X-Upload-Id'];

        const [refused] = await r.send({ kind: 'single', items: [it0] }, hooks());
        expect(refused).toMatchObject({ ok: false, status: 409, noRetry: true, conflictPath: 'A', error: CLASH.detail });

        it0.overwrite = true;
        await r.send({ kind: 'single', items: [it0] }, hooks());
        expect(idOf(1)).toBe(idOf(0));

        Object.assign(it0, { overwrite: false, path: 'a (2)' });
        await r.send({ kind: 'single', items: [it0] }, hooks());
        expect(idOf(2)).not.toBe(idOf(0));
    });

    // A commit refused for its name keeps the chunks: Replace commits them with overwrite, nothing is sent again
    it('commits a chunked upload refused at its commit again with overwrite, without its chunks', async () => {
        const calls = [];
        let stored = false;
        const transport = vi.fn(async ({ url, body }) => {
            calls.push({ url, fields: Object.fromEntries(body.entries()) });
            if (!url.endsWith('/commit')) {
                stored = true;
                return { status: 200, body: {}, uploaded: true };
            }
            return body.get('overwrite') === 'true'
                ? { status: 201, body: { path: 'big' }, uploaded: true }
                : { status: 409, body: CLASH, uploaded: true };
        });
        const getJson = vi.fn(async () => (stored
            ? { status: 200, body: { missing: [] } }
            : { status: 404, body: null }));
        const big = item('big');
        const r = requests(transport, getJson, { chunkBytes: 4 });

        const [refused] = await r.send({ kind: 'chunked', items: [big] }, hooks());
        expect(refused).toMatchObject({ ok: false, status: 409, conflictPath: 'A' });
        const sentBefore = calls.length;

        big.overwrite = true;
        const [done] = await r.send({ kind: 'chunked', items: [big] }, hooks());

        expect(done).toMatchObject({ ok: true });
        const again = calls.slice(sentBefore);
        expect(again).toHaveLength(1);
        expect(again[0].url).toMatch(/\/obj\/chunk\/[^/]+\/commit$/);
        expect(again[0].fields).toEqual({ overwrite: 'true' });
        expect(again[0].url).toBe(calls[sentBefore - 1].url);
    });

    it('passes the conflictPath of a refused file of a bundle on', async () => {
        const transport = vi.fn(async () => ({
            status: 200, uploaded: true,
            body: [{ status: 201, entry: { path: 'a' } }, { status: 409, error: CLASH.detail, conflictPath: 'B', retryable: false }]
        }));

        const results = await requests(transport).send({ kind: 'bundle', items: [item('a'), item('b')] }, hooks());

        expect(results[0]).not.toHaveProperty('conflictPath');
        expect(results[1]).toMatchObject({ ok: false, status: 409, noRetry: true, conflictPath: 'B' });
    });

    it('passes the conflictPath of a refused chunked commit on', async () => {
        const transport = vi.fn(async ({ url }) => (url.endsWith('/commit')
            ? { status: 409, body: CLASH, uploaded: true }
            : { status: 200, body: {}, uploaded: true }));

        const [result] = await requests(transport, undefined, { chunkBytes: 4 })
            .send({ kind: 'chunked', items: [item('big')] }, hooks());

        expect(result).toMatchObject({ ok: false, status: 409, conflictPath: 'A' });
    });

    it('a 409 without conflictPath (missing chunks, an upload in progress) has none', async () => {
        const transport = vi.fn(async () => ({
            status: 409, uploaded: true, body: { status: 409, detail: 'Upload is still in progress', noRetry: false }
        }));

        const [result] = await requests(transport).send({ kind: 'single', items: [item('a')] }, hooks());

        expect(result).not.toHaveProperty('conflictPath');
        expect(result.noRetry).toBe(false);
    });
});

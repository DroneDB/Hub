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

describe('uploadRequests chunk file id (FR-UPL-04, §7.1)', () => {
    const LAMB = 'orthos/Lamb.tif';
    const bigFile = (lastModified = 1731000000123, name = 'Lamb-Hill.tif', size = 35) =>
        new File(['x'.repeat(size)], name, { lastModified });
    const chunked = (path = LAMB, file = bigFile(), extra = {}) => ({ id: 'big', name: path, path, size: file.size, file, ...extra });

    function chunkRequests() {
        const calls = [];
        const transport = vi.fn(async ({ url, body }) => {
            calls.push({ url, body });
            return url.endsWith('/commit') ? { status: 201, body: { path: 'x' }, uploaded: true } : { status: 200, body: {}, uploaded: true };
        });
        const getJson = vi.fn(async () => ({ status: 404, body: null }));
        const r = requests(transport, getJson, { datasetId: 'o/d', chunkBytes: 10 });
        return { r, calls, getJson };
    }

    it('makes the id from the dataset, the path, the size and the last-modified time: the same file gives the same id', async () => {
        const first = chunkRequests();
        await first.r.send({ kind: 'chunked', items: [chunked()] }, hooks());
        // After a reload: a new File object of the same file, a new request layer
        const second = chunkRequests();
        await second.r.send({ kind: 'chunked', items: [chunked()] }, hooks());

        const expected = '067e1f8df03556fe4190e13ec1e3964dcfe96fcb27d84d293694ee63bf016c7e';
        expect(first.calls[0].body.get('fileId')).toBe(expected);
        expect(second.calls[0].body.get('fileId')).toBe(expected);
        // The state of the upload and its commit are asked for by that id
        expect(first.getJson).toHaveBeenCalledWith(`http://hub/orgs/o/ds/d/obj/chunk/${expected}`);
        expect(first.calls.at(-1).url).toBe(`http://hub/orgs/o/ds/d/obj/chunk/${expected}/commit`);
    });

    it('gives another id for another last-modified time, another size and another path (Keep both)', async () => {
        const ids = [];
        for (const item of [chunked(LAMB, bigFile(1731000000124)), chunked(LAMB, bigFile(1731000000123, 'Lamb-Hill.tif', 36)),
            chunked('orthos/Lamb (2).tif')]) {
            const { r, calls } = chunkRequests();
            await r.send({ kind: 'chunked', items: [item] }, hooks());
            ids.push(calls[0].body.get('fileId'));
        }

        expect(ids).toEqual([
            'c45d8fabec5c39d2151f76dad84596fa96e5f4bfb2e46289cf00c97b0c3cbfd0',
            'ce59c3fafd450744a9215a884bbf3fbe8c410ba420f1e30381669e734ade48dd',
            '0b3635bba7b63828fa6c1f6e78e1e6ab6b4cddcd6d17eaa259ddab1f1fc882d8'
        ]);
    });

    it('an item that resumes a stored upload keeps its id for its path, and gets the id of the file for another path', async () => {
        const stored = 'aaaaaaaa-stored-upload-id';
        const resumed = chunked('orthos/Lamb (2).tif', bigFile(), { fileId: stored, fileIdFor: 'orthos/Lamb (2).tif' });
        const first = chunkRequests();
        await first.r.send({ kind: 'chunked', items: [resumed] }, hooks());
        expect(first.calls[0].body.get('fileId')).toBe(stored);

        // Keep both after the resume's own conflict: another path, so the id of the file at that path
        resumed.path = LAMB;
        const second = chunkRequests();
        await second.r.send({ kind: 'chunked', items: [resumed] }, hooks());
        expect(second.calls[0].body.get('fileId')).toBe('067e1f8df03556fe4190e13ec1e3964dcfe96fcb27d84d293694ee63bf016c7e');
    });

    it('every chunk carries the file name and the last-modified time of the file on the disk', async () => {
        const { r, calls } = chunkRequests();

        await r.send({ kind: 'chunked', items: [chunked()] }, hooks());

        const chunks = calls.filter(c => !c.url.endsWith('/commit'));
        expect(chunks).toHaveLength(4);
        for (const { body } of chunks) {
            expect(body.get('fileName')).toBe('Lamb-Hill.tif');
            expect(body.get('lastModified')).toBe('1731000000123');
            expect(body.get('path')).toBe(LAMB);
        }
    });
});

describe('uploadRequests and the session', () => {
    it('a 401 of a chunk goes to onUnauthorized (the requests carry their own bearer header), and the job stops there', async () => {
        const onUnauthorized = vi.fn();
        const transport = vi.fn(async () => ({ status: 401, body: { title: 'Unauthorized' }, uploaded: true }));

        const [result] = await requests(transport, undefined, { chunkBytes: 4, onUnauthorized })
            .send({ kind: 'chunked', items: [item('big')] }, hooks());

        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(transport).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ id: 'big', ok: false, status: 401 });
    });

    it('a 401 of a single file, and of a chunk status read, go to onUnauthorized too', async () => {
        const onUnauthorized = vi.fn();
        const transport = vi.fn(async () => ({ status: 401, body: null, uploaded: true }));
        const getJson = vi.fn(async () => ({ status: 401, body: null }));
        const r = requests(transport, getJson, { chunkBytes: 4, onUnauthorized });

        await r.send({ kind: 'single', items: [item('a')] }, hooks());
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        await r.send({ kind: 'chunked', items: [item('big')] }, hooks());
        // The status read, then the first chunk
        expect(onUnauthorized).toHaveBeenCalledTimes(3);
    });

    it('asks canSend before each request: once it says no, nothing more is sent and the job ends as aborted', async () => {
        let allowed = 2;
        const canSend = vi.fn(() => allowed-- > 0);
        const transport = vi.fn(async () => ({ status: 200, body: {}, uploaded: true }));
        const getJson = vi.fn(async () => ({ status: 404, body: null }));

        const sending = requests(transport, getJson, { chunkBytes: 4, canSend })
            .send({ kind: 'chunked', items: [item('big')] }, hooks());

        await expect(sending).rejects.toMatchObject({ name: 'AbortError' });
        // The status read and the first chunk; the second chunk is not sent
        expect(getJson).toHaveBeenCalledTimes(1);
        expect(transport).toHaveBeenCalledTimes(1);
        expect(canSend).toHaveBeenCalledTimes(3);
    });

    it('a refused single file is not sent at all', async () => {
        const transport = vi.fn();

        await expect(requests(transport, undefined, { canSend: () => false }).send({ kind: 'single', items: [item('a')] }, hooks()))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(transport).not.toHaveBeenCalled();
    });
});

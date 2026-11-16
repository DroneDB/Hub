import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRangeGetter, createSplatFetchSource, rangeFetch, RangeReadError, RETRY_DELAYS_MS } from './rangeRequests';

const URL_ = '/orgs/o/ds/d/build/h@v/copc/cloud.copc.laz';
/** A file of `size` bytes whose byte i is i % 256. */
const fileBytes = size => Uint8Array.from({ length: size }, (_, i) => i % 256);

/** What the Registry answers to `Range: bytes=a-b` on a file of `size` bytes. */
function partial(size, begin, last) {
    const end = Math.min(last, size - 1);
    return new Response(fileBytes(size).slice(begin, end + 1), {
        status: 206, headers: { 'Content-Range': `bytes ${begin}-${end}/${size}` }
    });
}
const rangeOf = init => init.headers.Range.match(/^bytes=(\d+)-(\d+)$/).slice(1).map(Number);
/** A server of a file of `size` bytes. */
const serving = size => vi.fn(async (_url, init) => partial(size, ...rangeOf(init)));

let fetch;
beforeEach(() => {
    vi.useFakeTimers();
    fetch = serving(1000);
    vi.stubGlobal('fetch', fetch);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

/** Runs the read to its end, the retry delays included. */
async function settle(promise) {
    const outcome = promise.then(value => ({ value }), error => ({ error }));
    await vi.runAllTimersAsync();
    return outcome;
}

describe('rangeFetch', () => {
    it('goes past the HTTP cache with the cookies of the origin, whatever the caller asks', async () => {
        fetch.mockResolvedValue(new Response(null, { status: 206 }));
        await rangeFetch(URL_, { headers: { Range: 'bytes=0-9' }, cache: 'force-cache' });
        expect(fetch).toHaveBeenCalledWith(URL_, { credentials: 'same-origin', headers: { Range: 'bytes=0-9' }, cache: 'no-store' });
    });
});

describe('createRangeGetter', () => {
    it('reads the bytes [begin, end) by a range request past the HTTP cache', async () => {
        const bytes = await createRangeGetter(URL_)(100, 110);
        expect([...bytes]).toEqual([...fileBytes(1000).slice(100, 110)]);
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe(URL_);
        expect(init).toMatchObject({ cache: 'no-store', headers: { Range: 'bytes=100-109' } });
    });

    it('gives fewer bytes only where the file ends (copc.js asks for the first 64 KiB of any file)', async () => {
        const bytes = await createRangeGetter(URL_)(0, 65536);
        expect(bytes.length).toBe(1000);
    });

    it('reads nothing for an empty range and refuses a range that is not one', async () => {
        expect((await createRangeGetter(URL_)(5, 5)).length).toBe(0);
        await expect(createRangeGetter(URL_)(10, 5)).rejects.toThrow(RangeError);
        await expect(createRangeGetter(URL_)(-1, 5)).rejects.toThrow(RangeError);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('tries again after a request that did not complete, then gives the bytes', async () => {
        fetch.mockRejectedValueOnce(new TypeError('net::ERR_CACHE_OPERATION_NOT_SUPPORTED'));
        const { value, error } = await settle(createRangeGetter(URL_)(0, 4));
        expect(error).toBeUndefined();
        expect([...value]).toEqual([0, 1, 2, 3]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('tries again after a 5xx, a 429 and a cut body', async () => {
        fetch
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
            .mockResolvedValueOnce(new Response(new Uint8Array(2), { status: 206, headers: { 'Content-Range': 'bytes 0-3/1000' } }));
        const { value } = await settle(createRangeGetter(URL_)(0, 4));
        expect([...value]).toEqual([0, 1, 2, 3]);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('stops after the last retry with the last failure', async () => {
        fetch.mockImplementation(async () => new Response('down', { status: 502 }));
        const { error } = await settle(createRangeGetter(URL_)(0, 4));
        expect(error).toBeInstanceOf(RangeReadError);
        expect(error).toMatchObject({ status: 502, retryable: true });
        expect(fetch).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
    });

    it.each([
        ['a 404', () => new Response('gone', { status: 404 })],
        ['a 416', () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */1000' } })],
        ['a 200 of the whole file (no range support)', () => new Response(fileBytes(1000), { status: 200 })],
        ['a range other than the one asked for', () => partial(1000, 0, 3)]
    ])('does not try again after %s, and gives no bytes to the decoder', async (_, answer) => {
        fetch.mockImplementation(async () => answer());
        const { error } = await settle(createRangeGetter(URL_)(8, 12));
        expect(error).toBeInstanceOf(RangeReadError);
        expect(error.retryable).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('refuses a short body that does not end the file', async () => {
        fetch.mockImplementation(async () => new Response(new Uint8Array(3), {
            status: 206, headers: { 'Content-Range': 'bytes 0-2/1000' }
        }));
        const { error } = await settle(createRangeGetter(URL_)(0, 4));
        expect(error).toBeInstanceOf(RangeReadError);
    });

    it('stops its reads and their retries when its signal aborts', async () => {
        const reads = new AbortController();
        fetch.mockImplementation(async () => new Response('busy', { status: 503 }));
        const reading = createRangeGetter(URL_, { signal: reads.signal })(0, 4).then(() => null, e => e);
        await vi.advanceTimersByTimeAsync(0);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][1].signal).toBe(reads.signal);
        reads.abort();
        const error = await reading;
        expect(error.name).toBe('AbortError');
        await vi.runAllTimersAsync();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe('createSplatFetchSource', () => {
    const ROOT = '/orgs/o/ds/d/build/h@v/splat/scene-lod-0.rad';

    it('reads ranges of the root file past the HTTP cache, fewer bytes at its end (Spark probes the header so)', async () => {
        const source = createSplatFetchSource(ROOT);
        const signal = new AbortController().signal;
        expect((await source.fetchRange(signal, 990, 64)).length).toBe(10);
        expect(fetch).toHaveBeenCalledWith(ROOT, expect.objectContaining({ cache: 'no-store', signal, headers: { Range: 'bytes=990-1053' } }));
    });

    it('reads the chunk files of a chunked .rad whole, named relative to the root or by number', async () => {
        fetch.mockImplementation(async () => new Response(new Uint8Array([7])));
        const source = createSplatFetchSource(ROOT);
        const signal = new AbortController().signal;
        await source.fetchChunkFile(signal, 'chunk-3.rad');
        await source.fetchChunkById(signal, 2);
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            new URL('/orgs/o/ds/d/build/h@v/splat/chunk-3.rad', globalThis.location.href).toString(),
            '/orgs/o/ds/d/build/h@v/splat/scene-lod-2.rad'
        ]);
        // A whole file is one ordinary cache entry: it keeps the cache
        expect(fetch.mock.calls.every(([, init]) => init.cache === undefined)).toBe(true);
    });

    it('tries a chunk file again after a failure that can pass', async () => {
        fetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response(new Uint8Array([7])));
        const { value } = await settle(createSplatFetchSource(ROOT).fetchChunkById(new AbortController().signal, 1));
        expect([...value]).toEqual([7]);
    });
});

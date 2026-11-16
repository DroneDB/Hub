// @ts-check
/**
 * rangeRequests - how the Hub reads a build file by ranges (a COPC point cloud, a paged splat, a bm3d model).
 *
 * Every range goes past the browser's HTTP cache (`cache: 'no-store'`). Chrome keeps the 206 answers of one URL as one
 * sparse cache entry, and the disk cache it has on Windows (blockfile) refuses a second read or write of that entry
 * while one runs: of the ranges a viewer reads in parallel, some failed with net::ERR_CACHE_OPERATION_NOT_SUPPORTED,
 * and the parts of the model they held never loaded. Without the cache there is no shared entry to contend for; a
 * viewer keeps what it has read in memory while it is open.
 *
 * A range read checks the answer (206, the bytes asked for, or fewer only where the file ends), so an error page or a
 * cut transfer never reaches a decoder, and is tried again after a failure that can pass (the network, 5xx, 429, a
 * cut body), never after one that cannot (4xx) or once its signal is aborted.
 *
 *   createRangeGetter(url)              - (begin, end) => bytes, the getter copc.js reads with (Potree, Giro3D)
 *   createSplatFetchSource(rootUrl)     - the fetch source of a Spark PagedSplats
 *   rangeFetch(url, init)               - fetch with the range transport's cache mode (libraries that take a fetch)
 */

/** The delays before the retries of a failed read (each one stretched or shrunk by up to a quarter, at random). */
export const RETRY_DELAYS_MS = Object.freeze([250, 1000, 3000]);

/** A range read the answer of which cannot be used. `retryable` when trying again may give another answer. */
export class RangeReadError extends Error {
    /**
     * @param {string} message
     * @param {{ status?: number, retryable: boolean }} details
     */
    constructor(message, { status, retryable }) {
        super(message);
        this.name = 'RangeReadError';
        this.status = status;
        this.retryable = retryable;
    }
}

/**
 * fetch for range requests: past the HTTP cache, with the cookies of the Hub's origin.
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function rangeFetch(input, init = {}) {
    return fetch(input, { credentials: 'same-origin', ...init, cache: 'no-store' });
}

/** @param {Response} res */
const isRetryableStatus = res => res.status >= 500 || res.status === 429;

/** `bytes first-last/total` of a 206 (total may be `*`), or null. */
function contentRange(res) {
    const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get('Content-Range') ?? '');
    return m ? { first: Number(m[1]), last: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) } : null;
}

/**
 * Bytes [begin, end) of a file: fewer only when the file ends before `end`.
 * @param {string} url
 * @param {number} begin
 * @param {number} end
 * @param {AbortSignal} [signal]
 * @returns {Promise<Uint8Array>}
 */
async function readRange(url, begin, end, signal) {
    const res = await rangeFetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal });
    if (res.status !== 206) {
        // 200 is the whole file: a server that does not do ranges, which no retry changes
        throw new RangeReadError(`${url} answered ${res.status} to the range ${begin}-${end - 1}`,
            { status: res.status, retryable: isRetryableStatus(res) });
    }
    const body = new Uint8Array(await res.arrayBuffer());
    const range = contentRange(res);
    if (range && (range.first !== begin || range.last > end - 1)) {
        throw new RangeReadError(`${url} answered the range ${range.first}-${range.last} to ${begin}-${end - 1}`,
            { status: res.status, retryable: false });
    }
    const atEndOfFile = range && range.total !== null && range.last === range.total - 1;
    const expected = range ? range.last - range.first + 1 : end - begin;
    if (body.length !== expected || (!atEndOfFile && body.length !== end - begin)) {
        throw new RangeReadError(`${url} sent ${body.length} bytes of the range ${begin}-${end - 1}`,
            { status: res.status, retryable: true });
    }
    return body;
}

/**
 * The whole of a file, through the HTTP cache (a whole file is one ordinary cache entry).
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<Uint8Array>}
 */
async function readWhole(url, signal) {
    const res = await fetch(url, { credentials: 'same-origin', signal });
    if (!res.ok) {
        throw new RangeReadError(`${url} answered ${res.status}`, { status: res.status, retryable: isRetryableStatus(res) });
    }
    return new Uint8Array(await res.arrayBuffer());
}

/** @param {unknown} error */
const isRetryable = error =>
    error instanceof RangeReadError ? error.retryable
        // fetch rejects with a TypeError when the request does not complete (network, connection reset)
        : error instanceof TypeError;

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * Waits `ms`, or rejects as soon as the signal aborts.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        throwIfAborted(signal);
        const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(undefined); }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Runs `read`, and again after each retryable failure, with the delays of RETRY_DELAYS_MS.
 * @template T
 * @param {() => Promise<T>} read
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
async function withRetries(read, signal) {
    for (let attempt = 0; ; attempt++) {
        throwIfAborted(signal);
        try {
            return await read();
        } catch (error) {
            // Stopped on purpose: that is the outcome, whatever the read was doing then
            throwIfAborted(signal);
            if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(error)) throw error;
            await pause(RETRY_DELAYS_MS[attempt] * (0.75 + Math.random() / 2), signal);
        }
    }
}

/**
 * The getter copc.js reads a COPC file with: `(begin, end) => Promise<Uint8Array>` of the bytes [begin, end).
 * @param {string} url
 * @param {{ signal?: AbortSignal }} [options]  `signal` stops the reads (and their retries) of a closed viewer
 * @returns {(begin: number, end: number) => Promise<Uint8Array>}
 */
export function createRangeGetter(url, { signal } = {}) {
    return async (begin, end) => {
        if (!(begin >= 0 && end >= begin)) throw new RangeError(`Invalid range ${begin}-${end} of ${url}`);
        if (begin === end) return new Uint8Array(0);
        return withRetries(() => readRange(url, begin, end, signal), signal);
    };
}

/**
 * The fetch source of a Spark PagedSplats (the reads of UrlPagedSplatsFetcher, through this transport): ranges of the
 * root file, and the chunk files of a chunked RAD, named relative to it or by number (`-lod-0.` → `-lod-<n>.`).
 * @param {string} rootUrl
 */
export function createSplatFetchSource(rootUrl) {
    const resolve = chunk => new URL(chunk, new URL(rootUrl, globalThis.location.href)).toString();
    return {
        /** @param {AbortSignal} signal @param {number} offset @param {number} bytes */
        fetchRange: (signal, offset, bytes) => withRetries(() => readRange(rootUrl, offset, offset + bytes, signal), signal),
        /** @param {AbortSignal} signal @param {string} chunk */
        fetchChunkFile: (signal, chunk) => withRetries(() => readWhole(resolve(chunk), signal), signal),
        /** @param {AbortSignal} signal @param {number} chunk */
        fetchChunkById: (signal, chunk) =>
            withRetries(() => readWhole(rootUrl.replace(/-lod-0\./, `-lod-${chunk}.`), signal), signal)
    };
}

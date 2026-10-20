/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * RequestCache - GET reads of the Registry client (HUB-06).
 *
 * - Single flight: identical GETs in flight at the same time share one HTTP request.
 * - Short read cache: the answers of a few endpoints that every page asks for again and again
 *   (features, organization, dataset info, tools, storage) are reused for a few seconds.
 * - Conditional requests: an answer that came with an ETag is kept, and the next GET of the
 *   same URL sends If-None-Match; a 304 returns the kept body (the task list, HUB-05).
 * - Any write through the client (and invalidate()) drops the cached answers, and an answer
 *   whose request started before a drop is neither kept nor handed to a GET made after it.
 *
 * Callers get their own copy of a JSON answer, so changing it cannot change what others see.
 */

// Endpoint (path without query) -> how long its answer is reused
const TTL_RULES = [
    { test: /^\/sys\/features$/, ttlMs: 30000 },
    { test: /^\/orgs\/[^/]+\/$/, ttlMs: 10000 },
    { test: /^\/orgs\/[^/]+\/ds\/[^/]+$/, ttlMs: 5000 },
    { test: /^\/orgs\/[^/]+\/ds\/[^/]+\/tasks\/tools$/, ttlMs: 30000 },
    { test: /^\/users\/storage$/, ttlMs: 10000 }
];

function ttlFor(endpoint) {
    const path = endpoint.split('?')[0];
    const rule = TTL_RULES.find(r => r.test.test(path));
    return rule ? rule.ttlMs : 0;
}

function copy(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
    try {
        return structuredClone(value);
    } catch {
        return value;
    }
}

class RequestCache {
    constructor(now = () => Date.now()) {
        this.now = now;
        this.inFlight = new Map();   // key -> promise
        this.entries = new Map();    // key -> { value, expires }
        this.etags = new Map();      // key -> { etag, value }
        this.generation = 0;
    }

    /**
     * The answer of a GET of `key`, from the cache, from a request in flight, or from `load`.
     * @param {string} key the endpoint (with its query)
     * @param {(conditional: {etag?: string}) => Promise<{value, etag?: string, notModified?: boolean}>} load
     */
    async get(key, load) {
        const cached = this.entries.get(key);
        if (cached && cached.expires > this.now()) return copy(cached.value);

        let flight = this.inFlight.get(key);
        if (!flight) {
            const generation = this.generation;
            const known = this.etags.get(key);
            flight = (async () => {
                const res = await load({ etag: known?.etag });
                const value = res.notModified && known ? known.value : res.value;
                // Only answers of requests that started after the last write are kept
                if (generation === this.generation) {
                    const ttl = ttlFor(key);
                    if (ttl > 0) this.entries.set(key, { value, expires: this.now() + ttl });
                    if (res.etag) this.etags.set(key, { etag: res.etag, value });
                }
                return value;
            })().finally(() => {
                // invalidate() may have replaced this flight with a newer one
                if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
            });
            this.inFlight.set(key, flight);
            // The first caller owns the answer: joiners get copies
            return flight;
        }
        return copy(await flight);
    }

    /** Whether answers of `key` are reused for a while (the TTL allow-list). */
    keeps(key) {
        return ttlFor(key) > 0;
    }

    /**
     * get() for a caller that may abort: the request is shared and runs to its end, the
     * caller stops waiting (AbortError) when its signal aborts. For the short-lived
     * descriptors only (keeps()): they are small, and every page asks for them again.
     */
    getAbortable(key, load, signal) {
        if (signal?.aborted) return Promise.reject(abortError(signal));
        const answer = this.get(key, load);
        if (!signal) return answer;
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(abortError(signal));
            signal.addEventListener('abort', onAbort, { once: true });
            answer.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        });
    }

    /**
     * Drops cached answers (all, or the endpoints starting with `prefix`). Requests in flight
     * are forgotten too: they started before the drop, so a later GET sends its own.
     */
    invalidate(prefix = '') {
        this.generation++;
        for (const map of [this.entries, this.etags, this.inFlight])
            for (const key of [...map.keys()])
                if (key.startsWith(prefix)) map.delete(key);
    }
}

function abortError(signal) {
    if (signal.reason instanceof Error && signal.reason.name === 'AbortError') return signal.reason;
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
}

// One cache per Registry origin: every client instance of an origin shares it
const caches = new Map();

RequestCache.forOrigin = function (origin) {
    if (!caches.has(origin)) caches.set(origin, new RequestCache());
    return caches.get(origin);
};

module.exports = RequestCache;

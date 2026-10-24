/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * uploadScheduler - runs a queue of file uploads (UPL-01 B.1, B.3, B.5, E.3).
 *
 * A pool of request slots: the moment a request settles its slot takes the next request
 * (no timer between files). Concurrency follows the protocol limit (6 on HTTP/1.1, 16 on
 * HTTP/2) and the AIMD controller, which only backs off when the server asks for it (429 or
 * 503 with Retry-After). Retries follow the shared policy of useResilientUpload. A file
 * whose bytes are all sent is "processing" until the server answers: no progress, no ETA.
 * Counts and bytes are kept as the files change state; listeners get a snapshot at most
 * every `throttleMs`, so the dialog does not recompute anything per progress event.
 *
 * No DOM, no HTTP: `send(job, hooks)` performs the request(s) of a job (see uploadRequests).
 */
import { planNextJob } from './uploadPlanner';

export const STATUS = Object.freeze({
    PENDING: 'pending',
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    DONE: 'done',
    ERROR: 'error'
});

const SPEED_WINDOW_MS = 5000;

/**
 * @param {object} opts
 * @param {(job, hooks) => Promise<Array<object>>} opts.send performs a job; resolves with one
 *   result per item: `{ id, ok: true, entry }` or `{ id, ok: false, status, error, noRetry, retryAfter }`
 * @param {() => number} opts.maxConcurrency protocol limit (read on every scheduling decision)
 * @param {object} opts.policy useResilientUpload(): maxRetries, shouldRetryStatus, computeRetryDelayMs, aimd
 * @param {(job) => object} [opts.plan] groups ready items into a job (default: uploadPlanner)
 * @param {(snapshot) => void} [opts.onChange]
 * @param {(active: boolean) => void} [opts.onActivity] true when the first request starts, false when the queue is idle
 * @param {(item, entry) => void} [opts.onItemDone]
 * @param {number} [opts.throttleMs]
 * @param {{now: () => number, setTimeout: Function, clearTimeout: Function}} [opts.clock]
 */
export function createUploadScheduler(opts) {
    const clock = opts.clock ?? { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id) };
    const plan = opts.plan ?? planNextJob;
    const throttleMs = opts.throttleMs ?? 250;

    const items = [];
    const byId = new Map();
    const counts = { total: 0, pending: 0, uploading: 0, processing: 0, done: 0, error: 0 };
    const inFlight = new Map(); // job id -> { job, controller }
    const retryTimers = new Set();
    const samples = [];
    let totalBytes = 0;
    let bytesSent = 0;
    let jobSeq = 0;
    let notifyTimer = null;
    let lastNotify = -Infinity;
    let active = false;
    let stopped = false;
    let startedAt = null;
    let endedAt = null;

    function setStatus(item, status) {
        if (item.status === status) return;
        if (item.status) counts[item.status]--;
        counts[status]++;
        item.status = status;
    }

    function setSent(item, sent) {
        const clamped = Math.max(0, Math.min(item.size, sent));
        bytesSent += clamped - item.bytesSent;
        item.bytesSent = clamped;
        item.progress = item.size > 0 ? (clamped / item.size) * 100 : 100;
    }

    function add(files) {
        for (const f of files) {
            const item = {
                id: f.id,
                file: f.file,
                name: f.name,
                path: f.path,
                size: f.size,
                status: null,
                progress: 0,
                bytesSent: 0,
                errorMessage: '',
                retryCount: 0,
                canRetry: false,
                notBefore: 0,
                entry: null
            };
            setStatus(item, STATUS.PENDING);
            items.push(item);
            byId.set(item.id, item);
            counts.total++;
            totalBytes += item.size;
        }
        if (startedAt == null && items.length > 0) startedAt = clock.now();
        endedAt = null;
        pump();
        notify();
    }

    function concurrency() {
        return Math.max(1, Math.min(opts.maxConcurrency(), opts.policy.aimd.current));
    }

    function readyItems(now) {
        const ready = [];
        for (const item of items)
            if (item.status === STATUS.PENDING && item.notBefore <= now) ready.push(item);
        return ready;
    }

    // Fills every free slot now: called when files are added, when a request settles and
    // when a retry delay ends - never on a timer of its own
    function pump() {
        if (stopped) return;
        while (inFlight.size < concurrency()) {
            const ready = readyItems(clock.now());
            const job = plan(ready);
            if (!job) break;
            start(job);
        }
        updateActivity();
    }

    function start(job) {
        const id = ++jobSeq;
        const controller = new AbortController();
        inFlight.set(id, { job, controller });
        for (const item of job.items) {
            setStatus(item, STATUS.UPLOADING);
            setSent(item, 0);
            item.errorMessage = '';
        }

        const hooks = {
            signal: controller.signal,
            onProgress(itemId, sent) {
                const item = byId.get(itemId);
                if (item && item.status === STATUS.UPLOADING) {
                    setSent(item, sent);
                    notify();
                }
            },
            onUploaded(itemIds) {
                for (const itemId of itemIds) {
                    const item = byId.get(itemId);
                    if (item && item.status === STATUS.UPLOADING) {
                        setSent(item, item.size);
                        setStatus(item, STATUS.PROCESSING);
                    }
                }
                notify();
            }
        };

        Promise.resolve()
            .then(() => opts.send(job, hooks))
            .then(results => settle(id, job, results), error => settle(id, job, null, error));
    }

    function settle(id, job, results, error) {
        inFlight.delete(id);
        if (stopped) return;

        const byItem = new Map((results ?? []).map(r => [r.id, r]));
        for (const item of job.items) {
            const r = byItem.get(item.id) ??
                { id: item.id, ok: false, status: 0, error: error?.message || 'Upload failed', noRetry: error?.name === 'AbortError' };
            if (r.ok) succeed(item, r.entry);
            else fail(item, r);
        }

        pump();
        notify();
    }

    function succeed(item, entry) {
        setSent(item, item.size);
        setStatus(item, STATUS.DONE);
        item.entry = entry ?? null;
        item.errorMessage = '';
        opts.policy.aimd.onSuccess();
        opts.onItemDone?.(item, entry);
    }

    function fail(item, r) {
        setSent(item, 0);

        // Back off only when the server says so: a single network error is not congestion
        if ((r.status === 429 || r.status === 503) && r.retryAfter != null)
            opts.policy.aimd.onFailure();

        const canRetry = !r.noRetry && opts.policy.shouldRetryStatus(r.status) &&
            item.retryCount < opts.policy.maxRetries;
        if (canRetry) {
            const delay = opts.policy.computeRetryDelayMs(item.retryCount, r.retryAfter ?? null);
            item.retryCount++;
            item.notBefore = clock.now() + delay;
            item.errorMessage = `Retrying... (${item.retryCount}/${opts.policy.maxRetries})`;
            setStatus(item, STATUS.PENDING);
            let timer = null;
            let fired = false;
            timer = clock.setTimeout(() => {
                fired = true;
                retryTimers.delete(timer);
                pump();
            }, delay);
            if (!fired) retryTimers.add(timer);
            return;
        }

        item.errorMessage = r.error || 'Upload failed';
        item.canRetry = !r.noRetry;
        setStatus(item, STATUS.ERROR);
    }

    function retry(id) {
        const item = byId.get(id);
        if (!item || item.status !== STATUS.ERROR) return;
        item.retryCount = 0;
        item.notBefore = 0;
        item.canRetry = false;
        item.errorMessage = '';
        setStatus(item, STATUS.PENDING);
        endedAt = null;
        pump();
        notify();
    }

    function retryFailed() {
        for (const item of items) if (item.status === STATUS.ERROR) retry(item.id);
    }

    // Stops everything: requests in flight are aborted, queued and retrying files are dropped
    function cancelAll() {
        stopped = true;
        for (const timer of retryTimers) clock.clearTimeout(timer);
        retryTimers.clear();
        for (const { controller } of inFlight.values()) controller.abort();
        inFlight.clear();
        if (notifyTimer != null) clock.clearTimeout(notifyTimer);
        notifyTimer = null;
        updateActivity();
    }

    function isIdle() {
        return counts.pending + counts.uploading + counts.processing === 0;
    }

    function updateActivity() {
        const nowActive = !stopped && inFlight.size > 0;
        if (nowActive !== active) {
            active = nowActive;
            opts.onActivity?.(active);
        }
        if (isIdle() && items.length > 0 && endedAt == null) endedAt = clock.now();
    }

    function speed(now) {
        samples.push({ t: now, bytes: bytesSent });
        while (samples.length > 2 && samples[0].t < now - SPEED_WINDOW_MS) samples.shift();
        const first = samples[0];
        const dt = now - first.t;
        return dt > 0 ? Math.max(0, ((bytesSent - first.bytes) / dt) * 1000) : 0;
    }

    function snapshot() {
        const now = clock.now();
        const bps = speed(now);
        // Files being processed by the server are fully sent: they add nothing to the ETA
        const remaining = totalBytes - bytesSent;
        return {
            counts: { ...counts },
            totalBytes,
            bytesSent,
            speed: bps,
            eta: bps > 0 ? remaining / bps : null,
            done: isIdle(),
            startedAt,
            endedAt,
            items
        };
    }

    // Throttled: at most one snapshot per throttleMs, the last change always delivered
    function notify() {
        if (!opts.onChange || stopped) return;
        const now = clock.now();
        const wait = lastNotify + throttleMs - now;
        if (wait <= 0 || isIdle()) {
            if (notifyTimer != null) {
                clock.clearTimeout(notifyTimer);
                notifyTimer = null;
            }
            lastNotify = now;
            opts.onChange(snapshot());
            return;
        }
        if (notifyTimer == null) {
            notifyTimer = clock.setTimeout(() => {
                notifyTimer = null;
                lastNotify = clock.now();
                opts.onChange(snapshot());
            }, wait);
        }
    }

    return {
        add,
        retry,
        retryFailed,
        cancelAll,
        snapshot
    };
}

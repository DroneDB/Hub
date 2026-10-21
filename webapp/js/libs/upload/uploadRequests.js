/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * uploadRequests - the HTTP side of dataset uploads: what one job of the scheduler sends.
 *
 * - single file: POST {dataset}/obj with `path` then `file`;
 * - bundle: POST {dataset}/obj with `path`, `file` pairs (UPL-01 B.2), one result per file;
 * - chunked: POST {dataset}/obj/chunk per missing chunk, then POST .../commit (UPL-01 E.5).
 *
 * Every request carries an `X-Upload-Id`. When a request fails after the whole body was
 * sent (a proxy timeout while the server is still adding the file, a dropped connection),
 * the outcome is asked for by that id instead of sending the file again (UPL-01 E.4).
 */
import { sendXhr } from './xhrTransport';
import { newId } from '@/libs/ids';
import { bearer, failureMessageOf } from '@/libs/ddb/http/httpClient';

export const CHUNK_BYTES = 64 * 1024 * 1024;
export const RECEIPT_POLL_MS = 2000;
export const RECEIPT_MAX_WAIT_MS = 15 * 60 * 1000;

// Failures after a complete body that may hide a successful upload
const AMBIGUOUS_STATUSES = new Set([0, 502, 504]);

/**
 * @param {object} deps
 * @param {string} deps.baseUrl `${origin}/orgs/{org}/ds/{ds}`
 * @param {string} [deps.singleUrl] where single files go (default `${baseUrl}/obj`; the share page
 *   uploads to its batch instead)
 * @param {boolean} [deps.receipts] whether the endpoint keeps receipts by X-Upload-Id (default true)
 * @param {() => string|null} deps.authToken
 * @param {(url: string) => Promise<{status: number, body: any}>} deps.getJson GET with auth, never throws for HTTP statuses
 * @param {(item) => string} deps.destination the dataset path of an item
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {Function} [deps.transport] sendXhr
 * @param {number} [deps.chunkBytes]
 */
export function createUploadRequests(deps) {
    const transport = deps.transport ?? sendXhr;
    const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    const chunkBytes = deps.chunkBytes ?? CHUNK_BYTES;
    const now = deps.now ?? (() => Date.now());
    const singleUrl = deps.singleUrl ?? `${deps.baseUrl}/obj`;
    const receipts = deps.receipts ?? true;

    const headers = uploadId => {
        return { 'X-Upload-Id': uploadId, ...bearer(deps.authToken()) };
    };

    async function send(job, hooks) {
        if (job.kind === 'chunked') return [await sendChunked(job.items[0], hooks)];
        if (job.kind === 'bundle') return sendBundle(job.items, hooks);
        return [await sendSingle(job.items[0], hooks)];
    }

    async function sendSingle(item, hooks) {
        const form = new FormData();
        form.append('path', deps.destination(item));
        form.append('file', item.file, item.name);

        // One id per file, kept across retries: the server answers a repeat from its receipt
        item.uploadId ??= newUploadId();
        const res = await transport({
            url: singleUrl,
            body: form,
            headers: headers(item.uploadId),
            signal: hooks.signal,
            onProgress: loaded => hooks.onProgress(item.id, Math.min(item.size, loaded)),
            onUploaded: () => hooks.onUploaded([item.id])
        });

        if (res.status >= 200 && res.status < 300) return ok(item, res.body);
        if (receipts && res.uploaded && AMBIGUOUS_STATUSES.has(res.status))
            return (await fromReceipt(item.uploadId, [item], hooks))[0];
        return failure(item, res);
    }

    async function sendBundle(items, hooks) {
        const form = new FormData();
        for (const item of items) {
            form.append('path', deps.destination(item));
            form.append('file', item.file, item.name);
        }

        // Progress of a bundle: the body carries the files in order
        const ends = [];
        let total = 0;
        for (const item of items) ends.push(total += item.size);

        const uploadId = newUploadId();
        const res = await transport({
            url: `${deps.baseUrl}/obj`,
            body: form,
            headers: headers(uploadId),
            signal: hooks.signal,
            onProgress: loaded => {
                items.forEach((item, i) => {
                    const start = ends[i] - item.size;
                    hooks.onProgress(item.id, Math.max(0, Math.min(item.size, loaded - start)));
                });
            },
            onUploaded: () => hooks.onUploaded(items.map(i => i.id))
        });

        if (res.status === 200 && Array.isArray(res.body)) return partResults(items, res.body);
        if (res.uploaded && AMBIGUOUS_STATUSES.has(res.status)) return fromReceipt(uploadId, items, hooks);
        return items.map(item => failure(item, res));
    }

    async function sendChunked(item, hooks) {
        item.uploadId ??= newUploadId();
        const fileId = item.uploadId;
        const totalChunks = Math.max(1, Math.ceil(item.size / chunkBytes));

        // Resuming: only the chunks the server does not have yet
        const status = await deps.getJson(`${deps.baseUrl}/obj/chunk/${fileId}`);
        let missing = status.status === 200 && status.body?.missing
            ? status.body.missing
            : Array.from({ length: totalChunks }, (_, i) => i);
        let stored = (totalChunks - missing.length) * chunkBytes;
        hooks.onProgress(item.id, Math.min(item.size, stored));

        for (const index of missing) {
            const start = index * chunkBytes;
            const end = Math.min(item.size, start + chunkBytes);
            const form = new FormData();
            form.append('fileId', fileId);
            form.append('chunkIndex', String(index));
            form.append('totalChunks', String(totalChunks));
            form.append('totalFileSize', String(item.size));
            form.append('chunkSize', String(chunkBytes));
            form.append('path', deps.destination(item));
            form.append('chunk', item.file.slice(start, end), item.name);

            const base = stored;
            const res = await transport({
                url: `${deps.baseUrl}/obj/chunk`,
                body: form,
                headers: headers(fileId),
                signal: hooks.signal,
                onProgress: loaded => hooks.onProgress(item.id, Math.min(item.size, base + Math.min(loaded, end - start)))
            });
            if (res.status !== 200) return failure(item, res);
            stored += end - start;
        }

        hooks.onUploaded([item.id]);
        const commit = await transport({
            url: `${deps.baseUrl}/obj/chunk/${fileId}/commit`,
            body: new FormData(),
            headers: headers(fileId),
            signal: hooks.signal
        });
        if (commit.status === 201) return ok(item, commit.body);
        // The commit has no body worth resending: a lost answer is asked for by the file id
        if (AMBIGUOUS_STATUSES.has(commit.status)) return (await fromReceipt(fileId, [item], hooks))[0];
        return failure(item, commit);
    }

    // Asks the server what became of an upload whose answer was lost; resolves with one
    // result per item. Unknown upload: a retryable failure, the file is sent again
    async function fromReceipt(uploadId, items, hooks) {
        const deadline = now() + RECEIPT_MAX_WAIT_MS;
        while (!hooks.signal?.aborted) {
            const res = await deps.getJson(`${deps.baseUrl}/obj/uploads/${uploadId}`);
            const receipt = res.body;

            if (res.status === 200 && receipt?.state === 'Done') return partResults(items, receipt.results ?? []);
            if (res.status === 200 && receipt?.state === 'Failed')
                return items.map(item => ({ id: item.id, ok: false, status: receipt.status ?? 500, error: receipt.error, noRetry: true }));
            if (res.status !== 202 || now() > deadline)
                return items.map(item => ({ id: item.id, ok: false, status: 503, error: 'Upload interrupted, sending again', retryAfter: 0 }));

            await sleep(RECEIPT_POLL_MS);
        }
        return items.map(item => ({ id: item.id, ok: false, status: 0, error: 'Upload aborted', noRetry: true }));
    }

    return { send };
}

function ok(item, entry) {
    return { id: item.id, ok: true, entry };
}

// The server's per-file results (bundle or receipt), matched to items by path order
function partResults(items, results) {
    return items.map((item, i) => {
        const r = results[i];
        if (r && r.status === 201) return { id: item.id, ok: true, entry: r.entry };
        return {
            id: item.id,
            ok: false,
            status: r?.status ?? 500,
            error: r?.error || 'Upload failed',
            noRetry: r ? !r.retryable : false
        };
    });
}

function failure(item, res) {
    const body = res.body && typeof res.body === 'object' ? res.body : null;
    return {
        id: item.id,
        ok: false,
        status: res.status,
        error: failureMessageOf(body) || (typeof res.body === 'string' && res.body) || statusText(res.status),
        noRetry: body?.noRetry === true,
        retryAfter: res.retryAfter
    };
}

function statusText(status) {
    return status === 0 ? 'Network error' : `Upload failed (HTTP ${status})`;
}

export const newUploadId = newId;

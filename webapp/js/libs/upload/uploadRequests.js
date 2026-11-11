/**
 * uploadRequests - the HTTP side of dataset uploads: what one job of the scheduler sends.
 *
 * - single file: POST {dataset}/obj with `path` then `file`;
 * - bundle: POST {dataset}/obj with `path`, `file` pairs, one result per file;
 * - chunked: POST {dataset}/obj/chunk per missing chunk, then POST .../commit.
 *
 * A chunked upload's id (`fileId`) is made from the file, not drawn at random (FR-UPL-04, §7.1): the SHA-256 (hex)
 * of the dataset, the destination path, the size and the last-modified time. The same file picked again after a
 * reload therefore has the same id, and `GET .../obj/chunk/{fileId}` tells which chunks the server still has. That
 * status is asked only for an upload the server holds (FR-XC-10: a new file's id is unknown, and a 404 per file would
 * log a console error): the caller's open uploads (`GET .../obj/chunk`) are listed once per batch, shared by the files
 * of the batch (`newBatch`, which takes the list that the resume offer already read), and an id that the list holds,
 * or that these requests have sent chunks for, has its status read; any other file sends every chunk. A list that
 * cannot be read asks each file's status, as before. An item
 * that resumes a stored upload (`item.fileId`, set from the list of open uploads, valid for its path) keeps the id
 * that upload has: Keep both renamed it, so the path alone would not give it back. The chunks carry the file's
 * own name and last-modified time, which the server keeps to match a file selected again.
 *
 * A file whose name exists is refused (409 with `conflictPath`, D-040) unless its item has
 * `overwrite: true`: then `overwrite=true` goes before its `file` part (and in every chunk and the
 * commit), as the Registry reads the flag sent before the file. A refused file's result carries
 * `conflictPath`. An upload id belongs to one destination: Keep both (another path) starts a new
 * upload, Replace (the same path) keeps the id, so a chunked upload refused at its commit is
 * committed again with overwrite, without sending its chunks again.
 *
 * Every request carries an `X-Upload-Id`. When a request fails after the whole body was
 * sent (a proxy timeout while the server is still adding the file, a dropped connection),
 * the outcome is asked for by that id instead of sending the file again.
 *
 * The requests carry the session's bearer header themselves, so they do not pass through the client's 401 handling:
 * a 401 goes to `onUnauthorized` (the session is no longer accepted), and `canSend` is asked before each request
 * starts (a chunk, a commit, a status read): when it says no, the job stops with an AbortError and nothing is sent.
 */
import { sendXhr } from './xhrTransport';
import { newId } from '@/libs/ids';
import { sha256Hex } from '@/libs/sha256';
import { bearer, failureMessageOf } from '@/libs/ddb/http/httpClient';

const CHUNK_BYTES = 64 * 1024 * 1024;
const RECEIPT_POLL_MS = 2000;
const RECEIPT_MAX_WAIT_MS = 15 * 60 * 1000;

// Failures after a complete body that may hide a successful upload
const AMBIGUOUS_STATUSES = new Set([0, 502, 504]);

/**
 * @param {object} deps
 * @param {string} deps.baseUrl `${origin}/orgs/{org}/ds/{ds}`
 * @param {string} [deps.datasetId] what names the dataset in a chunked upload's id (default: baseUrl)
 * @param {string} [deps.singleUrl] where single files go (default `${baseUrl}/obj`; the share page
 *   uploads to its batch instead)
 * @param {boolean} [deps.receipts] whether the endpoint keeps receipts by X-Upload-Id (default true)
 * @param {() => string|null} deps.authToken
 * @param {(url: string) => Promise<{status: number, body: any}>} deps.getJson GET with auth, never throws for HTTP statuses
 * @param {(item) => string} deps.destination the dataset path of an item
 * @param {() => boolean} [deps.canSend] whether a request may start now (the session the upload belongs to goes on)
 * @param {() => void} [deps.onUnauthorized] a request was refused with 401
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {Function} [deps.transport] sendXhr
 * @param {number} [deps.chunkBytes]
 */
export function createUploadRequests(deps) {
    const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    const chunkBytes = deps.chunkBytes ?? CHUNK_BYTES;
    const now = deps.now ?? (() => Date.now());
    const singleUrl = deps.singleUrl ?? `${deps.baseUrl}/obj`;
    const receipts = deps.receipts ?? true;

    const headers = uploadId => {
        return { 'X-Upload-Id': uploadId, ...bearer(deps.authToken()) };
    };

    // Every request starts here: none once the session has ended, and a 401 is the session's, not the file's
    function mayStart() {
        if (deps.canSend && !deps.canSend())
            throw Object.assign(new Error('The session ended'), { name: 'AbortError' });
    }

    async function transport(options) {
        mayStart();
        const res = await (deps.transport ?? sendXhr)(options);
        if (res.status === 401) deps.onUnauthorized?.();
        return res;
    }

    async function getJson(url) {
        mayStart();
        const res = await deps.getJson(url);
        if (res.status === 401) deps.onUnauthorized?.();
        return res;
    }

    // One id per file and destination, kept across retries: the server answers a repeat from its
    // receipt, and a chunked upload's stored chunks belong to it
    function uploadIdOf(item) {
        const destination = deps.destination(item);
        if (!item.uploadId || item.uploadDestination !== destination) {
            item.uploadId = newUploadId();
            item.uploadDestination = destination;
        }
        return item.uploadId;
    }

    /**
     * The id of a chunked upload (see the top): kept for the destination it was made for, remade when the destination
     * changes (Keep both), unless the item resumes a stored upload at that very path.
     */
    function fileIdOf(item) {
        const destination = deps.destination(item);
        if (!item.fileId || item.fileIdFor !== destination) {
            item.fileId = sha256Hex([deps.datasetId ?? deps.baseUrl, destination, item.size, item.file.lastModified ?? 0].join('\n'));
            item.fileIdFor = destination;
        }
        return item.fileId;
    }

    // The ids of the caller's open uploads, for the batch (see the top): a Set, null when the list could not be read
    /** @type {Promise<Set<string>|null>|null} */
    let openUploads = null;
    // The ids that these requests have stored chunks for (a retry, a resume after pause, a Replace after the commit)
    const sentTo = new Set();

    /**
     * A new batch of files: the list of open uploads is read again for it, or is the one given (the caller's open
     * uploads as `GET .../obj/chunk` returned them, which the resume offer has just read).
     * @param {Array<{ fileId: string }>} [listed]
     */
    function newBatch(listed) {
        openUploads = Array.isArray(listed) ? Promise.resolve(idsOf(listed)) : null;
    }

    function openUploadIds() {
        if (!openUploads) {
            const listing = getJson(`${deps.baseUrl}/obj/chunk`)
                .then(res => (res.status === 200 && Array.isArray(res.body) ? idsOf(res.body) : null));
            // A request that could not start (the session ended) is not the batch's answer
            listing.catch(() => { if (openUploads === listing) openUploads = null; });
            openUploads = listing;
        }
        return openUploads;
    }

    async function send(job, hooks) {
        if (job.kind === 'chunked') return [await sendChunked(job.items[0], hooks)];
        if (job.kind === 'bundle') return sendBundle(job.items, hooks);
        return [await sendSingle(job.items[0], hooks)];
    }

    async function sendSingle(item, hooks) {
        const form = new FormData();
        form.append('path', deps.destination(item));
        appendOverwrite(form, item);
        form.append('file', item.file, item.name);

        // One id per file, kept across retries: the server answers a repeat from its receipt
        uploadIdOf(item);
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
            appendOverwrite(form, item);
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
        const fileId = fileIdOf(item);
        const totalChunks = Math.max(1, Math.ceil(item.size / chunkBytes));

        // Resuming: only the chunks the server does not have yet. A file the server holds no upload of sends them all
        const listed = await openUploadIds();
        const held = listed === null || listed.has(fileId) || sentTo.has(fileId);
        const status = held ? await getJson(`${deps.baseUrl}/obj/chunk/${fileId}`) : null;
        let missing = status?.status === 200 && status.body?.missing
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
            // The file as the user's disk has it: a file selected again after a reload is matched by them
            form.append('fileName', item.file.name ?? item.name);
            form.append('lastModified', String(item.file.lastModified ?? 0));
            // The first chunk fixes the flag; every chunk carries it, so any one can be the first
            appendOverwrite(form, item);
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
            sentTo.add(fileId);
            stored += end - start;
        }

        hooks.onUploaded([item.id]);
        // Replace after a refused commit: the stored chunks are committed with the flag
        const commitForm = new FormData();
        appendOverwrite(commitForm, item);
        const commit = await transport({
            url: `${deps.baseUrl}/obj/chunk/${fileId}/commit`,
            body: commitForm,
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
            const res = await getJson(`${deps.baseUrl}/obj/uploads/${uploadId}`);
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

    return { send, newBatch };
}

/** The upload ids of a list of open uploads. @param {Array<{ fileId?: string }>} list */
function idsOf(list) {
    return new Set(list.map(u => u?.fileId).filter(id => typeof id === 'string' && id));
}

function ok(item, entry) {
    return { id: item.id, ok: true, entry };
}

// Before the file part: the Registry reads the flag that comes before the file
function appendOverwrite(form, item) {
    if (item.overwrite) form.append('overwrite', 'true');
}

// The path of the entry that refused the name (D-040), or null
function conflict(conflictPath) {
    return typeof conflictPath === 'string' && conflictPath ? conflictPath : null;
}

// The server's per-file results (bundle or receipt), matched to items by path order
function partResults(items, results) {
    return items.map((item, i) => {
        const r = results[i];
        if (r && r.status === 201) return { id: item.id, ok: true, entry: r.entry };
        const result = {
            id: item.id,
            ok: false,
            status: r?.status ?? 500,
            error: r?.error || 'Upload failed',
            noRetry: r ? !r.retryable : false
        };
        const conflictPath = r?.status === 409 ? conflict(r.conflictPath) : null;
        return conflictPath ? { ...result, conflictPath } : result;
    });
}

function failure(item, res) {
    const body = res.body && typeof res.body === 'object' ? res.body : null;
    const result = {
        id: item.id,
        ok: false,
        status: res.status,
        error: failureMessageOf(body) || (typeof res.body === 'string' && res.body) || statusText(res.status),
        noRetry: body?.noRetry === true,
        retryAfter: res.retryAfter
    };
    const conflictPath = res.status === 409 ? conflict(body?.conflictPath) : null;
    return conflictPath ? { ...result, conflictPath } : result;
}

function statusText(status) {
    return status === 0 ? 'Network error' : `Upload failed (HTTP ${status})`;
}

const newUploadId = newId;

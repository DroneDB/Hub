/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * xhrTransport - one upload request with progress (fetch cannot report upload progress).
 *
 * Resolves with `{ status, body, retryAfter, uploaded }` for every HTTP outcome, including
 * network failures (status 0): the caller decides what to retry. `uploaded` tells whether
 * the browser sent the whole body before the request ended, which is what separates
 * "the proxy gave up while the server was still adding the file" (504 after the last
 * byte) from "the upload never completed". Rejects only with an AbortError when `signal`
 * aborts it.
 *
 * @param {object} req
 * @param {string} req.url
 * @param {FormData|Blob} req.body
 * @param {Record<string,string>} [req.headers]
 * @param {AbortSignal} [req.signal]
 * @param {(loaded: number, total: number) => void} [req.onProgress] bytes of the body sent
 * @param {() => void} [req.onUploaded] the whole body was sent; the response is pending
 * @param {() => XMLHttpRequest} [req.createXhr] injectable for tests
 */
export function sendXhr({ url, body, headers = {}, signal, onProgress, onUploaded, createXhr }) {
    return new Promise((resolve, reject) => {
        const xhr = createXhr ? createXhr() : new XMLHttpRequest();
        let uploaded = false;

        const abort = () => xhr.abort();
        if (signal) {
            if (signal.aborted) {
                reject(abortError());
                return;
            }
            signal.addEventListener('abort', abort, { once: true });
        }
        const cleanup = () => signal?.removeEventListener('abort', abort);

        xhr.open('POST', url, true);
        for (const [name, value] of Object.entries(headers))
            if (value != null) xhr.setRequestHeader(name, value);

        if (xhr.upload) {
            xhr.upload.onprogress = e => onProgress?.(e.loaded, e.total);
            // "load" on the upload object: the request body was fully sent
            xhr.upload.onload = () => {
                uploaded = true;
                onUploaded?.();
            };
        }

        xhr.onload = () => {
            cleanup();
            resolve({
                status: xhr.status,
                body: parseBody(xhr.responseText),
                retryAfter: parseRetryAfter(xhr.getResponseHeader('Retry-After')),
                uploaded: uploaded || (xhr.status >= 200 && xhr.status < 300)
            });
        };
        xhr.onerror = () => {
            cleanup();
            resolve({ status: 0, body: null, retryAfter: null, uploaded });
        };
        xhr.onabort = () => {
            cleanup();
            reject(abortError());
        };

        xhr.send(body);
    });
}

function parseBody(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function parseRetryAfter(value) {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function abortError() {
    const e = new Error('Upload aborted');
    e.name = 'AbortError';
    return e;
}

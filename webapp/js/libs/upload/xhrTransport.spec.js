/** HQ-05: contract of the upload transport (statuses are results, aborts reject). */
import { describe, it, expect, vi } from 'vitest';
import { sendXhr } from './xhrTransport';

function fakeXhr({ status = 200, text = '', headers = {} } = {}) {
    const xhr = {
        upload: {}, headers: {},
        open: vi.fn(), abort: vi.fn(() => xhr.onabort()),
        setRequestHeader: vi.fn((k, v) => { xhr.headers[k] = v; }),
        getResponseHeader: k => headers[k] ?? null,
        send: vi.fn(() => queueMicrotask(() => {
            xhr.upload.onprogress?.({ loaded: 5, total: 5 });
            xhr.upload.onload?.();
            xhr.status = status;
            xhr.responseText = text;
            xhr.onload();
        }))
    };
    return xhr;
}

describe('sendXhr', () => {
    it('resolves every HTTP status with the parsed body and Retry-After', async () => {
        const xhr = fakeXhr({ status: 503, text: '{"error":"busy"}', headers: { 'Retry-After': '7' } });
        const onProgress = vi.fn();
        const r = await sendXhr({ url: '/u', body: new Blob(['x']), headers: { 'X-Upload-Id': 'a', Authorization: null }, onProgress, createXhr: () => xhr });
        expect(r).toEqual({ status: 503, body: { error: 'busy' }, retryAfter: 7, uploaded: true }); // seconds, as sent
        expect(xhr.headers).toEqual({ 'X-Upload-Id': 'a' });
        expect(onProgress).toHaveBeenCalledWith(5, 5);
    });

    it('rejects with an AbortError when the signal aborts', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(sendXhr({ url: '/u', body: null, signal: controller.signal, createXhr: () => fakeXhr() }))
            .rejects.toMatchObject({ name: 'AbortError' });
    });
});

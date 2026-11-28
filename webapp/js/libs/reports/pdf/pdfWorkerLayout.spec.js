/**
 * The pages of a report PDF laid out in a worker: the job is sent to it, its PDF comes back, a cancel ends the worker at
 * once, and a worker that cannot start says so before any work (the page then lays the pages out itself).
 */
import { describe, it, expect, vi } from 'vitest';
import { layoutInWorker, WORKER_UNAVAILABLE } from './pdfWorkerLayout';

/** A worker the test drives: what it was sent, whether it was ended, and its answers. */
function fakeWorker({ postMessage } = {}) {
    const worker = {
        sent: [],
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage: postMessage ?? (data => worker.sent.push(data)),
        terminate() { worker.terminated = true; },
        say(data) { worker.onmessage?.({ data }); },
        fail(message) { worker.onerror?.({ message, preventDefault() {} }); }
    };
    return worker;
}
const job = { model: { name: 'North pit' }, assets: { logo: null, figures: new Map(), photos: new Map() }, origin: 'https://hub.test' };

describe('layoutInWorker', () => {
    it('sends the job and gives the PDF the worker answers, then ends the worker', async () => {
        const worker = fakeWorker();
        const made = layoutInWorker(job, { createWorker: () => worker });
        expect(worker.sent).toEqual([job]);
        const blob = new Blob(['%PDF']);
        worker.say({ type: 'ready' });
        worker.say({ type: 'blob', blob });
        expect(await made).toBe(blob);
        expect(worker.terminated).toBe(true);
    });

    it('ends the worker at once on a cancel, whatever it is doing, and gives no PDF', async () => {
        const worker = fakeWorker();
        const controller = new AbortController();
        const made = layoutInWorker(job, { signal: controller.signal, createWorker: () => worker });
        worker.say({ type: 'ready' });
        controller.abort();
        await expect(made).rejects.toMatchObject({ name: 'AbortError' });
        expect(worker.terminated).toBe(true);
        // An answer that was already on its way changes nothing
        worker.say({ type: 'blob', blob: new Blob(['%PDF']) });
    });

    it('starts no work for a PDF that was cancelled before', async () => {
        const worker = fakeWorker();
        const controller = new AbortController();
        controller.abort();
        await expect(layoutInWorker(job, { signal: controller.signal, createWorker: () => worker })).rejects.toMatchObject({ name: 'AbortError' });
        expect(worker.sent).toEqual([]);
        expect(worker.terminated).toBe(true);
    });

    it('fails with the error the worker reports, or with its crash once it runs', async () => {
        const reported = fakeWorker();
        const first = layoutInWorker(job, { createWorker: () => reported });
        reported.say({ type: 'ready' });
        reported.say({ type: 'error', message: 'Invalid image' });
        await expect(first).rejects.toThrow('Invalid image');

        const crashed = fakeWorker();
        const second = layoutInWorker(job, { createWorker: () => crashed });
        crashed.say({ type: 'ready' });
        crashed.fail('Out of memory');
        const error = await second.catch(e => e);
        expect(error.message).toBe('Out of memory');
        expect(error.name).not.toBe(WORKER_UNAVAILABLE);
    });

    it('says the worker is unavailable when it cannot be made, its script fails before it runs, or the job cannot be sent', async () => {
        const none = await layoutInWorker(job, { createWorker: () => { throw new TypeError('Worker is not a constructor'); } }).catch(e => e);
        expect(none.name).toBe(WORKER_UNAVAILABLE);

        const notLoaded = fakeWorker();
        const loading = layoutInWorker(job, { createWorker: () => notLoaded });
        notLoaded.fail('Failed to load the worker script');
        expect((await loading.catch(e => e)).name).toBe(WORKER_UNAVAILABLE);
        expect(notLoaded.terminated).toBe(true);

        const uncloneable = fakeWorker({ postMessage: () => { throw new DOMException('could not be cloned', 'DataCloneError'); } });
        const sent = await layoutInWorker(job, { createWorker: () => uncloneable }).catch(e => e);
        expect(sent.name).toBe(WORKER_UNAVAILABLE);
        expect(uncloneable.terminated).toBe(true);
    });

    it('removes its cancel listener once the PDF is there', async () => {
        const worker = fakeWorker();
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const made = layoutInWorker(job, { signal: controller.signal, createWorker: () => worker });
        worker.say({ type: 'blob', blob: new Blob(['%PDF']) });
        await made;
        expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
});

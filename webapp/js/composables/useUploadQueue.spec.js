/**
 * useUploadQueue.cancel({ confirm, cleanup }) (FR-XC-27): the one way the Hub cancels an upload. /upload passes the
 * rollback of its share batch as the cleanup; the dataset page passes none, because the files already sent stay (D-045).
 */
import { describe, it, expect, vi } from 'vitest';
import { useUploadQueue } from './useUploadQueue';

const flush = () => new Promise(r => setTimeout(r, 0));

/** A queue whose requests never end: a file in flight until it is cancelled */
function heldQueue() {
    const aborted = [];
    const send = vi.fn((job, hooks) => new Promise(resolve => {
        hooks?.signal?.addEventListener('abort', () => { aborted.push(job.items[0].id); resolve([]); });
    }));
    const queue = useUploadQueue({ send });
    queue.add([{ file: { size: 10 }, path: 'a.txt' }, { file: { size: 20 }, path: 'b.txt' }]);
    return { queue, send, aborted };
}

describe('useUploadQueue.cancel', () => {
    it('stops the queue, then runs the cleanup, and reports a clean cancel', async () => {
        const { queue, aborted, send } = heldQueue();
        await flush();
        const inFlight = send.mock.calls.length;
        expect(inFlight).toBeGreaterThan(0);
        const abortedWhenCleaning = [];
        const cleanup = vi.fn(async () => { abortedWhenCleaning.push(aborted.length); });

        const result = await queue.cancel({ cleanup });

        expect(result).toEqual({ cancelled: true, cleanupError: null });
        expect(cleanup).toHaveBeenCalledTimes(1);
        // The requests in flight were aborted before the cleanup ran: it finds nothing still being sent
        expect(abortedWhenCleaning).toEqual([inFlight]);
    });

    it('without a cleanup (the dataset page) it only stops: nothing is undone', async () => {
        const { queue, aborted } = heldQueue();
        await flush();

        expect(await queue.cancel()).toEqual({ cancelled: true, cleanupError: null });
        expect(aborted.length).toBeGreaterThan(0);
    });

    it('stops at once, in the same tick, when there is no confirm', async () => {
        const { queue, send } = heldQueue();
        await flush();
        const calls = send.mock.calls.length;

        const pending = queue.cancel({ cleanup: async () => {} });
        // Nothing new starts after the call, even before its promise settles
        queue.add([{ file: { size: 1 }, path: 'c.txt' }]);
        await flush();

        expect(send.mock.calls.length).toBe(calls);
        await pending;
    });

    it('a confirm that answers false leaves the upload running and runs no cleanup', async () => {
        const { queue, aborted } = heldQueue();
        await flush();
        const cleanup = vi.fn();

        const result = await queue.cancel({ confirm: () => false, cleanup });

        expect(result).toEqual({ cancelled: false, cleanupError: null });
        expect(cleanup).not.toHaveBeenCalled();
        expect(aborted).toEqual([]);
    });

    it('a confirm that answers true cancels', async () => {
        const { queue } = heldQueue();
        await flush();
        const cleanup = vi.fn();

        const result = await queue.cancel({ confirm: async () => true, cleanup });

        expect(result.cancelled).toBe(true);
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('a failing cleanup does not throw: the queue is stopped and the error is returned', async () => {
        const { queue, aborted } = heldQueue();
        await flush();
        const failure = new Error('offline');

        const result = await queue.cancel({ cleanup: async () => { throw failure; } });

        expect(result).toEqual({ cancelled: true, cleanupError: failure });
        expect(aborted.length).toBeGreaterThan(0);
    });
});

describe('useUploadQueue pause and resume (FR-UPL-04)', () => {
    it('pause aborts the file being sent and keeps it pending; resume sends it again', async () => {
        const { queue, send } = heldQueue();
        await flush();
        const started = send.mock.calls.length;

        queue.pause();
        await flush();

        expect(queue.state.value.paused).toBe(true);
        expect(queue.state.value.counts.pending).toBe(2);
        expect(queue.state.value.counts.error).toBe(0);

        queue.resume();
        await flush();

        expect(queue.state.value.paused).toBe(false);
        expect(send.mock.calls.length).toBeGreaterThan(started);
    });

    it('a file added with a fileId resumes that stored upload: the scheduler item keeps it for its path', async () => {
        const send = vi.fn(() => new Promise(() => {}));
        const queue = useUploadQueue({ send });

        queue.add([{ file: { size: 10 }, path: 'orto/Lamb (2).tif', fileId: 'stored-id' }, { file: { size: 20 }, path: 'b.txt' }]);
        await flush();

        const items = queue.state.value.items;
        expect(items.map(i => [i.path, i.fileId, i.fileIdFor])).toEqual([
            ['orto/Lamb (2).tif', 'stored-id', 'orto/Lamb (2).tif'],
            ['b.txt', null, null]
        ]);
    });
});

describe('useUploadQueue activity signal', () => {
    it('announces it on the event bus by default, and not when the store announces it for all its queues', async () => {
        const { default: emitter } = await import('@/libs/eventBus');
        const heard = [];
        const on = e => heard.push(e.active);
        emitter.on('uploadActivity', on);
        const answer = (job) => Promise.resolve(job.items.map(i => ({ id: i.id, ok: true, entry: {} })));

        const own = useUploadQueue({ send: answer });
        own.add([{ file: { size: 1 }, path: 'a' }]);
        await flush();
        const announced = [...heard];

        heard.length = 0;
        const quiet = [];
        const store = useUploadQueue({ send: answer, announceActivity: false, onActivity: a => quiet.push(a) });
        store.add([{ file: { size: 1 }, path: 'a' }]);
        await flush();
        emitter.off('uploadActivity', on);

        expect(announced).toEqual([true, false]);
        expect(heard).toEqual([]);
        expect(quiet).toEqual([true, false]);
    });
});

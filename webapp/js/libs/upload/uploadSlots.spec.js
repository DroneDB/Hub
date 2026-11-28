/**
 * The upload queues of a page share one set of request slots: the protocol limit holds for all of them together.
 */
import { describe, it, expect } from 'vitest';
import { createUploadSlots } from './uploadSlots';
import { createUploadScheduler } from './uploadScheduler';
import { useResilientUpload } from '@/composables/useResilientUpload';
import { useUploadQueue } from '@/composables/useUploadQueue';
import { HTTP1_UPLOAD_CONNECTIONS } from './protocolLimits';

const flush = () => new Promise(r => setTimeout(r, 0));
const file = (q, i) => ({ id: `${q}${i}`, file: {}, name: `${q}${i}.jpg`, path: `${q}${i}.jpg`, size: 5 * 1024 * 1024 });
const policy = () => ({ ...useResilientUpload({ parallelUploads: 16 }), computeRetryDelayMs: () => 0 });

/** Requests held until the test ends them, with the most that ran together */
function heldServer() {
    const pending = [];
    let peak = 0;
    return {
        pending,
        peak: () => peak,
        send: (job, hooks) => new Promise(resolve => {
            const held = { job, resolve };
            pending.push(held);
            peak = Math.max(peak, pending.length);
            hooks?.signal?.addEventListener('abort', () => {
                pending.splice(pending.indexOf(held), 1);
                resolve([]);
            });
        }),
        releaseFirst() {
            const { job, resolve } = pending.shift();
            resolve(job.items.map(i => ({ id: i.id, ok: true, entry: { path: i.path } })));
        }
    };
}

describe('upload slots shared by the queues of a page', () => {
    it('two queues of the page never run more than 4 requests together over HTTP/1.1', async () => {
        const server = heldServer();
        const a = useUploadQueue({ send: server.send, announceActivity: false });
        const b = useUploadQueue({ send: server.send, announceActivity: false });
        a.add(Array.from({ length: 6 }, (_, i) => ({ file: { size: 5 * 1024 * 1024 }, path: `a${i}.jpg` })));
        b.add(Array.from({ length: 6 }, (_, i) => ({ file: { size: 5 * 1024 * 1024 }, path: `b${i}.jpg` })));
        await flush();

        expect(server.pending.length).toBe(HTTP1_UPLOAD_CONNECTIONS);
        while (server.pending.length) {
            server.releaseFirst();
            await flush();
        }
        expect(server.peak()).toBe(HTTP1_UPLOAD_CONNECTIONS);
        expect(a.state.value.counts.done + b.state.value.counts.done).toBe(12);
        await a.cancel();
        await b.cancel();
    });

    it('a slot given back by one queue starts the file another queue was waiting with', async () => {
        const server = heldServer();
        const slots = createUploadSlots(() => 2);
        const first = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, policy: policy(), slots });
        const second = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, policy: policy(), slots });
        first.add([file('a', 0), file('a', 1)]);
        second.add([file('b', 0)]);
        await flush();
        expect(server.pending.map(p => p.job.items[0].id)).toEqual(['a0', 'a1']);

        server.releaseFirst();
        await flush();
        expect(server.pending.map(p => p.job.items[0].id)).toEqual(['a1', 'b0']);
        expect(slots.inUse()).toBe(2);
    });

    it('a cancelled queue gives its slots back, once', async () => {
        const server = heldServer();
        const slots = createUploadSlots(() => 2);
        const first = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, policy: policy(), slots });
        const second = createUploadScheduler({ send: server.send, maxConcurrency: () => 2, policy: policy(), slots });
        first.add([file('a', 0), file('a', 1)]);
        second.add([file('b', 0), file('b', 1)]);
        await flush();

        first.cancelAll();
        await flush();
        // The aborted requests settle after the cancel: they do not give the slots back a second time
        expect(slots.inUse()).toBe(2);
        expect(server.pending.map(p => p.job.items[0].id)).toEqual(['b0', 'b1']);
        second.cancelAll();
        await flush();
        expect(slots.inUse()).toBe(0);
    });
});

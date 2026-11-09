/**
 * The app-wide upload store (FR-UPL-04): the queue of a dataset outlives the dialog; the header reads its totals; the
 * listing hears the entries that the server added; Cancel removes the server's chunks of the files not committed and
 * keeps the files already sent (D-045); a queue that settles unseen tells the user and is dropped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({
    held: [], deleted: [], deleteFails: null, open: [], listFails: false, toasts: [], activity: [], invalidated: 0, listeners: {},
    user: 'alice', refused: [], deps: []
}));
vi.mock('@/libs/upload/uploadRequests', () => ({
    createUploadRequests: deps => {
        h.deps.push(deps);
        return {
            // Every request waits until the test answers it (or it is aborted); like the real layer, it asks
            // `canSend` before it starts
            send: (job, hooks) => new Promise((resolve, reject) => {
                if (deps.canSend && !deps.canSend()) {
                    reject(Object.assign(new Error('The session ended'), { name: 'AbortError' }));
                    return;
                }
                hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('Upload aborted'), { name: 'AbortError' })));
                h.held.push({ datasetId: deps.datasetId, job, hooks, resolve, deps });
            })
        };
    }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        url: 'http://hub.test', getAuthToken: () => (h.user ? `token-of-${h.user}` : null), invalidateCache: () => { h.invalidated++; },
        isLoggedIn: () => h.user !== null,
        getUsername: () => h.user,
        reportUnauthorized: error => { h.refused.push(error.status); },
        addEventListener: (event, cb) => { (h.listeners[event] ??= new Set()).add(cb); },
        removeEventListener: (event, cb) => { h.listeners[event]?.delete(cb); },
        Organization: org => ({
            Dataset: ds => ({
                baseApi: `/orgs/${org}/ds/${ds}`,
                listChunkUploads: async () => {
                    if (h.listFails) throw new Error('offline');
                    return h.open;
                },
                deleteChunkUpload: async fileId => {
                    const failure = h.deleteFails?.(fileId);
                    if (failure) throw failure;
                    h.deleted.push(`${org}/${ds}:${fileId}`);
                }
            })
        })
    }
}));
vi.mock('@/libs/notify', () => ({
    notify: Object.fromEntries(['success', 'info', 'warn', 'error'].map(kind => [kind, (...args) => h.toasts.push([kind, ...args])]))
}));

const { useUploadsStore } = await import('./uploads');
const { default: emitter } = await import('@/libs/eventBus');
const { UPLOAD_ACTIVITY_EVENT } = await import('@/libs/upload/uploadEvents');

const flush = () => new Promise(r => setTimeout(r, 0));
const files = (...names) => names.map(name => ({ file: { size: 10, name }, path: name }));
const answerOk = held => held.resolve(held.job.items.map(i => ({ id: i.id, ok: true, entry: { path: i.path } })));
const notFound = () => Object.assign(new Error('Not found'), { status: 404 });
const onActivity = ({ active }) => h.activity.push(active);

let uploads;

beforeEach(() => {
    Object.assign(h, {
        held: [], deleted: [], deleteFails: null, open: [], listFails: false, toasts: [], activity: [], invalidated: 0, listeners: {},
        user: 'alice', refused: [], deps: []
    });
    setActivePinia(createPinia());
    uploads = useUploadsStore();
    emitter.on(UPLOAD_ACTIVITY_EVENT, onActivity);
});
afterEach(() => emitter.off(UPLOAD_ACTIVITY_EVENT, onActivity));

describe('the queue outlives the dialog', () => {
    it('keeps uploading after the dialog that showed it is gone, and says so to the unload guard', async () => {
        uploads.attach('o', 'd');
        uploads.add('o', 'd', files('a.txt'));
        await flush();

        uploads.detach('o', 'd');

        expect(uploads.active).toBe(true);
        expect(uploads.filesLeft).toBe(1);
        expect(h.held).toHaveLength(1);
        expect(h.held[0].hooks.signal.aborted).toBe(false);
    });

    it('is one queue per dataset: another dataset has its own', async () => {
        uploads.add('o', 'd1', files('a.txt'));
        uploads.add('o', 'd2', files('b.txt', 'c.txt'));
        await flush();

        expect(uploads.uploads.map(u => [u.key, u.total])).toEqual([['o/d1', 1], ['o/d2', 2]]);
        expect(h.held.map(r => r.datasetId)).toEqual(['o/d1', 'o/d2']);
        expect(uploads.filesLeft).toBe(3);
    });

    it('is not active until a file is queued, and a queue nobody added to is dropped by its dialog', () => {
        uploads.attach('o', 'd');
        expect(uploads.active).toBe(false);

        uploads.detach('o', 'd');

        expect(uploads.uploads).toEqual([]);
    });
});

describe('totals for the header', () => {
    it('counts the files left and the total progress by bytes, across datasets', async () => {
        uploads.add('o', 'd1', [{ file: { size: 100 }, path: 'a' }]);
        uploads.add('o', 'd2', [{ file: { size: 300 }, path: 'b' }]);
        await flush();

        h.held[0].hooks.onProgress(h.held[0].job.items[0].id, 100);
        h.held[1].hooks.onProgress(h.held[1].job.items[0].id, 100);
        await new Promise(r => setTimeout(r, 300));

        // 200 of 400 bytes
        expect(uploads.progress).toBe(50);
        expect(uploads.uploads.map(u => Math.round(u.progress))).toEqual([100, 33]);
    });

    it('sends one "uploading" signal for all the queues: true at the first request, false when the last one ends', async () => {
        uploads.add('o', 'd1', files('a.txt'));
        uploads.add('o', 'd2', files('b.txt'));
        await flush();
        expect(h.activity).toEqual([true]);

        answerOk(h.held[0]);
        await flush();
        // The second queue is still sending
        expect(h.activity).toEqual([true]);

        answerOk(h.held[1]);
        await flush();
        expect(h.activity).toEqual([true, false]);
    });
});

describe('the listing hears the entries that the server added', () => {
    it('hands them over in batches, and at the end of the queue', async () => {
        const heard = [];
        const stop = uploads.subscribe('o', 'd', { added: entries => heard.push(entries.map(e => e.path)) });
        uploads.add('o', 'd', files('a.txt', 'b.txt'));
        await flush();
        h.held.forEach(answerOk);
        await flush();

        expect(heard.flat().sort()).toEqual(['a.txt', 'b.txt']);
        stop();
    });

    it('does not tell a subscriber of another dataset, nor one that stopped', async () => {
        const other = vi.fn();
        const stopped = vi.fn();
        uploads.subscribe('o', 'other', { added: other });
        uploads.subscribe('o', 'd', { added: stopped })();
        uploads.add('o', 'd', files('a.txt'));
        await flush();
        answerOk(h.held[0]);
        await flush();

        expect(other).not.toHaveBeenCalled();
        expect(stopped).not.toHaveBeenCalled();
    });

    it('tells the dialog of a file that failed for good (the name was taken meanwhile)', async () => {
        const failed = vi.fn();
        uploads.attach('o', 'd');
        uploads.subscribe('o', 'd', { failed });
        uploads.add('o', 'd', files('a.txt'));
        await flush();

        h.held[0].resolve([{ id: h.held[0].job.items[0].id, ok: false, status: 409, noRetry: true, error: 'exists', conflictPath: 'a.txt' }]);
        await flush();

        expect(failed).toHaveBeenCalledTimes(1);
        expect(failed.mock.calls[0][0]).toMatchObject({ path: 'a.txt', conflictPath: 'a.txt' });
    });
});

describe('a queue that settles', () => {
    it('unseen: tells the user what was added, refreshes the cached reads and is dropped', async () => {
        uploads.add('o', 'd', files('a.txt', 'b.txt'));
        await flush();
        h.held.forEach(answerOk);
        await flush();

        expect(h.toasts).toEqual([['success', 'Uploaded 2 files to o/d', { summary: 'Upload Complete' }]]);
        expect(h.invalidated).toBeGreaterThan(0);
        expect(uploads.uploads).toEqual([]);
        expect(uploads.active).toBe(false);
    });

    it('unseen with a failure: warns once, naming the dataset and the count', async () => {
        uploads.add('o', 'd', files('a.txt'));
        await flush();
        h.held[0].resolve([{ id: h.held[0].job.items[0].id, ok: false, status: 403, noRetry: true, error: 'Forbidden' }]);
        await flush();

        expect(h.toasts).toHaveLength(1);
        expect(h.toasts[0][0]).toBe('warn');
        expect(h.toasts[0][1]).toContain('1 file could not be uploaded to o/d');
        expect(uploads.uploads).toEqual([]);
    });

    it('seen by a dialog: stays for it (no toast, the dialog shows the summary) until the dialog detaches', async () => {
        uploads.attach('o', 'd');
        uploads.add('o', 'd', files('a.txt'));
        await flush();
        answerOk(h.held[0]);
        await flush();

        expect(h.toasts).toEqual([]);
        expect(uploads.uploads).toHaveLength(1);
        expect(uploads.active).toBe(false);

        uploads.detach('o', 'd');
        expect(uploads.uploads).toEqual([]);
    });
});

describe('pause and resume', () => {
    it('pauses one dataset, then all of them; paused is true when every unsettled queue is', async () => {
        uploads.add('o', 'd1', files('a.txt'));
        uploads.add('o', 'd2', files('b.txt'));
        await flush();

        uploads.pause('o', 'd1');
        await flush();
        expect(uploads.paused).toBe(false);
        expect(uploads.uploads.map(u => u.paused)).toEqual([true, false]);

        uploads.pauseAll();
        await flush();
        expect(uploads.paused).toBe(true);
        // Aborted, not failed: both files still wait
        expect(uploads.filesLeft).toBe(2);
        expect(uploads.uploads.map(u => u.failed)).toEqual([0, 0]);

        uploads.resumeAll();
        await flush();
        expect(uploads.paused).toBe(false);
        expect(h.held.filter(r => !r.hooks.signal.aborted)).toHaveLength(2);
    });
});

describe('cancel (FR-XC-27, D-045)', () => {
    // A chunked item is one that has a file id: the request layer sets it, here the file asks for it (a resume)
    const chunked = (name, fileId) => ({ file: { size: 10, name }, path: name, fileId });

    it('stops the queue and deletes the chunks of the files not committed; the file already sent and the one being committed keep theirs', async () => {
        // Eight files of 2 MB (one request each, six at a time), each with the id of its chunked upload
        const big = i => ({ file: { size: 2 * 1024 * 1024, name: `big${i}` }, path: `big${i}`, fileId: `id-${i}` });
        uploads.add('o', 'd', [1, 2, 3, 4, 5, 6, 7, 8].map(big));
        await flush();
        const request = name => h.held.find(r => r.job.items[0].path === name);
        // big1 is added; big2 is sent and being committed; big3..big7 are being sent; big8 waits
        answerOk(request('big1'));
        request('big2').hooks.onUploaded([request('big2').job.items[0].id]);
        // The totals follow the queue's snapshot, at most four a second
        await new Promise(r => setTimeout(r, 300));
        expect(uploads.uploads[0]).toMatchObject({ done: 1, left: 7 });

        const result = await uploads.cancel('o', 'd');

        expect(result).toEqual({ cancelled: true, cleanupError: null });
        expect([...h.deleted].sort()).toEqual(['id-3', 'id-4', 'id-5', 'id-6', 'id-7', 'id-8'].map(id => `o/d:${id}`));
        expect(request('big3').hooks.signal.aborted).toBe(true);
        expect(uploads.uploads).toEqual([]);
        expect(uploads.active).toBe(false);
    });

    it('a chunked file whose commit is in flight (processing) keeps its chunks: the commit needs them', async () => {
        uploads.add('o', 'd', [chunked('big', 'id-commit')]);
        await flush();
        h.held[0].hooks.onUploaded([h.held[0].job.items[0].id]);

        await uploads.cancel('o', 'd');

        expect(h.deleted).toEqual([]);
    });

    it('asks first when it is given a confirm: a no leaves everything running and deletes nothing', async () => {
        uploads.add('o', 'd', [chunked('big', 'id-1')]);
        await flush();

        const result = await uploads.cancel('o', 'd', { confirm: async () => false });

        expect(result).toEqual({ cancelled: false, cleanupError: null });
        expect(h.deleted).toEqual([]);
        expect(uploads.active).toBe(true);
        expect(h.held[0].hooks.signal.aborted).toBe(false);
    });

    it('a file whose commit begins while the user is asked keeps its chunks: they are chosen once the queue has stopped', async () => {
        uploads.add('o', 'd', [chunked('big1', 'id-commit'), chunked('big2', 'id-sending')]);
        await flush();
        const request = name => h.held.find(r => r.job.items[0].path === name);

        const result = await uploads.cancel('o', 'd', {
            confirm: async () => {
                // While the question is open, big1's bytes are all sent: the server is adding it
                request('big1').hooks.onUploaded([request('big1').job.items[0].id]);
                return true;
            }
        });

        expect(result).toEqual({ cancelled: true, cleanupError: null });
        expect(h.deleted).toEqual(['o/d:id-sending']);
    });

    it('an upload the server does not know (404) is already gone; another failure is reported and the queue is stopped', async () => {
        uploads.add('o', 'd', [chunked('big1', 'id-gone'), chunked('big2', 'id-broken')]);
        await flush();
        h.deleteFails = id => (id === 'id-gone' ? notFound() : Object.assign(new Error('boom'), { status: 500 }));

        const result = await uploads.cancel('o', 'd');

        expect(result.cancelled).toBe(true);
        expect(result.cleanupError).toMatchObject({ message: 'boom' });
        expect(uploads.active).toBe(false);
        expect(h.toasts.map(t => t[0])).toEqual(['warn']);
        expect(h.toasts[0][1]).toContain('within 7 days');
    });

    it('cancelAll stops every dataset, and a new upload after it starts a new queue', async () => {
        uploads.add('o', 'd1', files('a.txt'));
        uploads.add('o', 'd2', files('b.txt'));
        await flush();

        await uploads.cancelAll();
        expect(uploads.uploads).toEqual([]);

        uploads.add('o', 'd1', files('c.txt'));
        await flush();
        expect(uploads.filesLeft).toBe(1);
        expect(h.held.at(-1).hooks.signal.aborted).toBe(false);
    });
});

describe('open uploads (the resume offer)', () => {
    const open = (fileId, extra = {}) => ({ fileId, path: fileId, totalFileSize: 4, totalChunks: 2, received: [0], ...extra });

    it('lists the server\'s open uploads, but not those that a queue holds', async () => {
        h.open = [open('a'), open('b')];
        uploads.add('o', 'd', [{ file: { size: 10, name: 'b' }, path: 'b', fileId: 'b' }]);
        await flush();

        expect((await uploads.listOpen('o', 'd')).map(u => u.fileId)).toEqual(['a']);
    });

    it('offers nothing when the list cannot be read', async () => {
        h.listFails = true;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(await uploads.listOpen('o', 'd')).toEqual([]);
        warn.mockRestore();
    });

    it('discards one: its chunks are deleted, an unknown one is already gone, another failure is raised', async () => {
        await uploads.discardOpen('o', 'd', 'a');
        expect(h.deleted).toEqual(['o/d:a']);

        h.deleteFails = () => notFound();
        await expect(uploads.discardOpen('o', 'd', 'b')).resolves.toBeUndefined();

        h.deleteFails = () => Object.assign(new Error('boom'), { status: 500 });
        await expect(uploads.discardOpen('o', 'd', 'c')).rejects.toThrow('boom');
    });
});

describe('signing out (the session ends)', () => {
    const signOut = () => {
        h.user = null;
        for (const cb of [...(h.listeners.logout ?? [])]) cb();
    };
    const chunked = (name, fileId) => ({ file: { size: 10, name }, path: name, fileId });

    it('drops a paused queue: nothing is left to resume, no request is sent, nothing is told or deleted', async () => {
        const heard = vi.fn();
        uploads.attach('o', 'd');
        uploads.subscribe('o', 'd', { added: heard, failed: heard });
        uploads.add('o', 'd', [chunked('a.txt', 'id-a'), chunked('b.txt', 'id-b')]);
        await flush();
        uploads.pauseAll();
        await flush();
        expect(uploads.paused).toBe(true);
        const requests = h.held.length;

        signOut();
        await flush();

        expect(uploads.uploads).toEqual([]);
        expect(uploads.active).toBe(false);
        expect(uploads.filesLeft).toBe(0);
        uploads.resume('o', 'd');
        uploads.resumeAll();
        await flush();
        expect(h.held).toHaveLength(requests);
        expect(h.toasts).toEqual([]);
        expect(heard).not.toHaveBeenCalled();
        // The server's sweep removes the chunks: the session that could delete them has ended
        expect(h.deleted).toEqual([]);
    });

    it('stops a running queue: its requests are aborted, and their failure is not told in the next session', async () => {
        const failed = vi.fn();
        uploads.subscribe('o', 'd1', { failed });
        uploads.add('o', 'd1', files('a.txt', 'b.txt'));
        uploads.add('o', 'd2', files('c.txt'));
        await flush();
        const running = [...h.held];
        expect(running).toHaveLength(2);
        expect(h.activity).toEqual([true]);

        signOut();
        // The server answers 401 to what was in flight
        running.forEach(r => r.resolve(r.job.items.map(i => ({ id: i.id, ok: false, status: 401, error: 'Unauthorized' }))));
        await new Promise(r => setTimeout(r, 400));

        expect(running.every(r => r.hooks.signal.aborted)).toBe(true);
        expect(h.held).toHaveLength(2);
        expect(uploads.uploads).toEqual([]);
        expect(uploads.active).toBe(false);
        expect(h.activity).toEqual([true, false]);
        expect(h.toasts).toEqual([]);
        expect(failed).not.toHaveBeenCalled();
        expect(h.deleted).toEqual([]);
    });

    it('the next sign-in starts empty: an upload then is a new queue with only its own files', async () => {
        uploads.add('o', 'd', files('a.txt', 'b.txt'));
        await flush();
        uploads.pause('o', 'd');
        await flush();

        signOut();
        h.user = 'alice';
        uploads.add('o', 'd', files('c.txt'));
        await flush();

        expect(uploads.uploads.map(u => [u.key, u.total, u.left, u.paused])).toEqual([['o/d', 1, 1, false]]);
        expect(h.held.at(-1).job.items.map(i => i.path)).toEqual(['c.txt']);
        expect(h.held.at(-1).hooks.signal.aborted).toBe(false);
    });

    it('a Cancel whose question is open when the session ends deletes nothing and leaves the next queue alone', async () => {
        uploads.add('o', 'd', [chunked('a.txt', 'id-a')]);
        await flush();
        let answer;
        const pending = uploads.cancel('o', 'd', { confirm: () => new Promise(r => { answer = r; }) });

        signOut();
        h.user = 'alice';
        uploads.add('o', 'd', files('next.txt'));
        await flush();
        answer(true);
        await pending;
        await flush();

        expect(h.deleted).toEqual([]);
        expect(h.toasts).toEqual([]);
        expect(uploads.uploads.map(u => [u.key, u.total])).toEqual([['o/d', 1]]);
        expect(h.held.at(-1).hooks.signal.aborted).toBe(false);
    });
});

describe('a queue belongs to its session and its user', () => {
    const signOut = () => {
        h.user = null;
        for (const cb of [...(h.listeners.logout ?? [])]) cb();
    };
    const big = (...names) => names.map(name => ({ file: { size: 2 * 1024 * 1024, name }, path: name }));

    it('refuses files when nobody is signed in: no queue, no request, no toast', async () => {
        h.user = null;

        expect(uploads.add('o', 'd', files('a.txt'))).toBe(false);
        await flush();

        expect(uploads.uploads).toEqual([]);
        expect(h.held).toEqual([]);
        expect(h.toasts).toEqual([]);
    });

    it('refuses a stale add: files chosen before the session ended do not queue in the next user\'s session', async () => {
        const before = uploads.session();
        signOut();
        h.user = 'bob';

        expect(uploads.add('o', 'd', files('a.txt'), { session: before })).toBe(false);
        await flush();

        expect(uploads.uploads).toEqual([]);
        expect(h.held).toEqual([]);
        // The same files in bob's own session do queue
        expect(uploads.add('o', 'd', files('b.txt'), { session: uploads.session() })).toBe(true);
    });

    it('a queue of an ended session never starts a request, not with the next user\'s token, and its 401 refuses nobody', async () => {
        uploads.add('o', 'd', files('a.txt'));
        await flush();
        const old = h.deps[0];
        signOut();
        h.user = 'bob';

        expect(old.canSend()).toBe(false);
        old.onUnauthorized();

        expect(h.refused).toEqual([]);
        expect(uploads.uploads).toEqual([]);
    });

    it('another user signed in without a sign-out: the first user\'s queue stops at its next request, silently', async () => {
        uploads.add('o', 'd', big('a.bin'));
        await flush();
        h.user = 'bob';

        // The queue's next request asks first
        expect(h.deps[0].canSend()).toBe(false);
        await flush();

        expect(uploads.uploads).toEqual([]);
        expect(h.held[0].hooks.signal.aborted).toBe(true);
        expect(h.refused).toEqual([]);
        expect(h.toasts).toEqual([]);
        // Bob's upload is a new queue of his
        uploads.add('o', 'd', files('b.txt'));
        await flush();
        expect(uploads.uploads.map(u => [u.key, u.total])).toEqual([['o/d', 1]]);
        expect(h.held.at(-1).deps).not.toBe(h.deps[0]);
    });

    it('a 401 goes to the shared unauthorized handler, which ends the session: every queue is dropped, no toast', async () => {
        const failed = vi.fn();
        uploads.subscribe('o', 'd1', { failed });
        uploads.add('o', 'd1', big('a.bin'));
        uploads.add('o', 'd2', big('b.bin'));
        await flush();
        // The app's handler (handleUnauthorized) signs out
        h.refused = { push: status => { h.refusedStatus = status; signOut(); } };

        h.held[0].deps.onUnauthorized();
        h.held[0].resolve([{ id: h.held[0].job.items[0].id, ok: false, status: 401, error: 'Unauthorized' }]);
        await new Promise(r => setTimeout(r, 400));

        expect(h.refusedStatus).toBe(401);
        expect(uploads.uploads).toEqual([]);
        expect(h.held.map(r => r.hooks.signal.aborted)).toEqual([true, true]);
        expect(h.toasts).toEqual([]);
        expect(failed).not.toHaveBeenCalled();
    });

    it('a 401 that the handler leaves alone still stops that queue, with no toast for its files', async () => {
        uploads.add('o', 'd1', big('a.bin', 'c.bin'));
        uploads.add('o', 'd2', big('b.bin'));
        await flush();
        const [a, , b] = h.held;

        a.deps.onUnauthorized();
        a.resolve([{ id: a.job.items[0].id, ok: false, status: 401, error: 'Unauthorized' }]);
        await new Promise(r => setTimeout(r, 400));

        expect(h.refused).toEqual([401]);
        expect(uploads.uploads.map(u => u.key)).toEqual(['o/d2']);
        expect(b.hooks.signal.aborted).toBe(false);
        expect(h.toasts).toEqual([]);
    });

    it('a session that ended without the logout event (the token expired) is reported once, at the next request', async () => {
        uploads.add('o', 'd', big('a.bin'));
        await flush();
        h.user = null;

        expect(h.deps[0].canSend()).toBe(false);
        expect(h.deps[0].canSend()).toBe(false);

        expect(h.refused).toEqual([401]);
        expect(uploads.uploads).toEqual([]);
    });
});

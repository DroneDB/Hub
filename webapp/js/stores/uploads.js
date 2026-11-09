// @ts-check
/**
 * The uploads of the dataset page, app-wide (FR-UPL-04). The queue of a dataset's upload lives here, not in the upload
 * dialog or on the route: it goes on when the user opens another page of the Hub, and the header's indicator and its
 * list read it. One queue per dataset (a bundle is one request to one dataset); a queue is created by the first file
 * and dropped when its files are settled and nobody looks at it.
 *
 * - `add(org, ds, files)` queues files; `pause`, `resume` and `cancel` act on one dataset's queue. Cancel stops the
 *   queue and removes the chunks the server stores for the files that were not committed (the only cleanup, D-045): the
 *   files already sent stay in the dataset. It goes through `useUploadQueue.cancel({ confirm, cleanup })` (FR-XC-27).
 * - `subscribe(org, ds, { added, failed })` hears the entries that the server added, in batches (the listing of the
 *   dataset, when it is open, shows them: an upload that ends while the user is elsewhere is in the listing when they
 *   come back), and the files that failed for good (the dialog asks again about a name that was taken meanwhile).
 * - `attach` / `detach`: the upload dialog shows a queue. A queue that settles while nobody shows it tells the user in a
 *   toast and is dropped; the dialog drops it when it closes.
 * - `active` is what the page-unload warning reads (FR-XC-04): an upload that is not settled is unsaved work for a
 *   reload or a closed tab, never for a route change.
 * - The "uploading" signal of the event bus (the task monitor pauses its stream meanwhile) is one for all the queues.
 *
 * What resumes after a reload is the offer of the dialog (`listOpen`): the browser keeps no file, so the user selects the
 * same file again and it goes on from the chunks that the server stored.
 *
 * The queues belong to the signed-in user: when the session ends (Sign out, or a session the server no longer accepts,
 * both through the client's `logout` event) every queue stops (its requests are aborted), and the queues and their
 * subscribers are dropped, with no toast. The chunks they stored stay for the server's sweep (7 days): deleting them
 * would need the session that has just ended.
 * - Each end of a session starts a new one (`session()`, a counter). A queue belongs to the session it was made in
 *   and to its user, and asks before each request starts (uploadRequests' `canSend`): a queue of an ended session,
 *   or one whose user is no longer the signed-in one, sends nothing, not even with the next user's token.
 * - `add` refuses files when nobody is signed in, or when the caller started in an earlier session (`{ session }`):
 *   the dialog that was listing the destination when the session ended does not start a queue afterwards.
 * - A request refused with 401 is the session's, not the file's: it goes to the client's unauthorized handler (the
 *   app signs out and asks to sign in again), and the queue is dropped like the others, with no toast per file.
 */
import { defineStore } from 'pinia';
import { computed, getCurrentScope, onScopeDispose, shallowRef, triggerRef } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import emitter from '@/libs/eventBus';
import { notify } from '@/libs/notify';
import { countOf } from '@/libs/format';
import { isNotFound } from '@/libs/ddb/apiError';
import { useUploadQueue } from '@/composables/useUploadQueue';
import { createUploadRequests } from '@/libs/upload/uploadRequests';
import { authorizedGetJson } from '@/libs/upload/uploadFormat';
import { UPLOAD_ACTIVITY_EVENT } from '@/libs/upload/uploadEvents';

/** How long the entries that the server added wait to be handed to the listing together. */
const DELIVER_EVERY_MS = 300;

const EMPTY_COUNTS = Object.freeze({ total: 0, pending: 0, uploading: 0, processing: 0, done: 0, error: 0 });

/** Files whose chunks the server may still store: not committed (a commit in flight keeps its chunks, D-045). */
const CHUNKS_STILL_THERE = new Set(['pending', 'uploading', 'error']);

const keyOf = (/** @type {string} */ org, /** @type {string} */ ds) => `${org}/${ds}`;

/**
 * @typedef {object} UploadEntry  one dataset's queue (plain object: the reactive part is the queue's state)
 * @property {string} key
 * @property {string} org
 * @property {string} ds
 * @property {ReturnType<typeof useUploadQueue>} queue
 * @property {number} attached  dialogs that show it
 * @property {object[]} fresh  entries added by the server, not yet handed to the subscribers
 * @property {ReturnType<typeof setTimeout>|null} timer
 * @property {number|null} settledAt  `endedAt` of the snapshot whose end was handled
 * @property {boolean} dropped  the session ended: the queue is stopped and no longer the store's
 * @property {number} session  the session it was made in
 * @property {string|null} owner  the user it was made for
 */

export const useUploadsStore = defineStore('uploads', () => {
    /** @type {import('vue').ShallowRef<UploadEntry[]>} */
    const entries = shallowRef([]);
    /** @typedef {{ added?: (added: object[]) => void, failed?: (item: any) => void }} Listener */
    /** @type {Map<string, Set<Listener>>} */
    const subscribers = new Map();
    const sending = new Set();
    let announced = false;
    // The session the queues belong to: every end of a session starts the next one
    let session = 0;
    let hearsLogout = false;
    if (getCurrentScope()) onScopeDispose(() => { if (hearsLogout) reg.removeEventListener('logout', dropAll); });

    // From the first queue, or the first caller that keeps a session (a dialog listing the destination), on: for the
    // store's lifetime (the app's)
    function hearLogout() {
        if (hearsLogout) return;
        hearsLogout = true;
        reg.addEventListener('logout', dropAll);
    }

    const find = (/** @type {string} */ org, /** @type {string} */ ds) => entries.value.find(e => e.key === keyOf(org, ds)) ?? null;
    const datasetOf = (/** @type {UploadEntry} */ e) => reg.Organization(e.org).Dataset(e.ds);

    function setEntries(/** @type {UploadEntry[]} */ list) {
        entries.value = list;
        triggerRef(entries);
    }

    // ---- State for the header and the guard ---------------------------------------------------------

    /** One summary per queue, for the indicator's list. */
    const uploads = computed(() => entries.value.map(e => {
        const s = e.queue.state.value;
        const counts = s?.counts ?? EMPTY_COUNTS;
        const bytes = s?.totalBytes ?? 0;
        return {
            key: e.key,
            org: e.org,
            ds: e.ds,
            total: counts.total,
            done: counts.done,
            failed: counts.error,
            left: counts.pending + counts.uploading + counts.processing,
            bytesSent: s?.bytesSent ?? 0,
            totalBytes: bytes,
            progress: bytes > 0 ? Math.min(100, ((s?.bytesSent ?? 0) / bytes) * 100) : 0,
            paused: s?.paused === true,
            speed: s?.speed ?? 0
        };
    }));

    /** Whether an upload is not settled: the unsaved work of a page unload (FR-XC-04). */
    const active = computed(() => uploads.value.some(u => u.left > 0));
    /** The files still to be added, in every dataset. */
    const filesLeft = computed(() => uploads.value.reduce((sum, u) => sum + u.left, 0));
    /** The total progress of the unsettled queues, 0 to 100, by bytes. */
    const progress = computed(() => {
        const open = uploads.value.filter(u => u.left > 0);
        const total = open.reduce((sum, u) => sum + u.totalBytes, 0);
        return total > 0 ? Math.min(100, (open.reduce((sum, u) => sum + u.bytesSent, 0) / total) * 100) : 0;
    });
    /** Every unsettled queue is paused. */
    const paused = computed(() => {
        const open = uploads.value.filter(u => u.left > 0);
        return open.length > 0 && open.every(u => u.paused);
    });

    // ---- Queues -------------------------------------------------------------------------------------

    function announceActivity() {
        const now = sending.size > 0;
        if (now !== announced) {
            announced = now;
            emitter.emit(UPLOAD_ACTIVITY_EVENT, { active: now });
        }
    }

    function deliver(/** @type {UploadEntry} */ e) {
        if (e.timer != null) clearTimeout(e.timer);
        e.timer = null;
        if (e.fresh.length === 0) return;
        const added = e.fresh.splice(0);
        tell(e.key, listener => listener.added?.(added));
    }

    function tell(/** @type {string} */ key, /** @type {(listener: Listener) => void} */ call) {
        for (const listener of [...(subscribers.get(key) ?? [])]) {
            try {
                call(listener);
            } catch (error) {
                console.warn('An upload subscriber failed:', error);
            }
        }
    }

    function settle(/** @type {UploadEntry} */ e, /** @type {any} */ snapshot) {
        // The queue says "idle" at every change while it is: handle each end once
        if (e.settledAt === (snapshot.endedAt ?? 0)) return;
        e.settledAt = snapshot.endedAt ?? 0;
        deliver(e);
        // Dataset size, entry count, storage: the cached reads are stale now
        reg.invalidateCache();

        if (e.attached > 0) return;
        const done = snapshot.counts.done;
        const failed = snapshot.counts.error;
        if (failed > 0)
            notify.warn(`${countOf(failed, 'file')} could not be uploaded to ${e.key}${done ? `, ${countOf(done, 'file')} uploaded` : ''}. Open the dataset to upload ${failed === 1 ? 'it' : 'them'} again.`, { summary: 'Upload finished with errors', life: 'long' });
        else if (done > 0)
            notify.success(`Uploaded ${countOf(done, 'file')} to ${e.key}`, { summary: 'Upload Complete' });
        discard(e);
    }

    /** Whether a queue may send now: its session goes on, and its user is the one signed in. */
    function current(/** @type {UploadEntry} */ e) {
        return !e.dropped && e.session === session && reg.isLoggedIn() && reg.getUsername() === e.owner;
    }

    /**
     * A request of the queue was refused with 401, or its session ended without the `logout` event (a token that
     * expired): the session's end, told to the client's unauthorized handler, which ends it (`logout` drops every
     * queue). A queue that is still here then (no handler, or one that did nothing) stops anyway, with no toast.
     */
    function sessionRefused(/** @type {UploadEntry} */ e) {
        if (e.dropped || e.session !== session) return;
        reg.reportUnauthorized(Object.assign(new Error('The session is no longer accepted'), { status: 401 }));
        drop(e);
    }

    /** Asked before each request of the queue starts (uploadRequests' `canSend`). */
    function maySend(/** @type {UploadEntry} */ e) {
        if (current(e)) return true;
        // Another user signed in meanwhile: the queue is not theirs, and their session is not refused
        if (reg.isLoggedIn()) drop(e);
        else sessionRefused(e);
        return false;
    }

    /** One queue whose session ended: stopped and gone, with its subscribers, nothing told. */
    function drop(/** @type {UploadEntry} */ e) {
        if (e.dropped && !entries.value.includes(e)) return;
        stop(e);
        subscribers.delete(e.key);
        discard(e);
    }

    /** The session ended for the queue: it stops at once (requests in flight are aborted), with no toast. */
    function stop(/** @type {UploadEntry} */ e) {
        e.dropped = true;
        if (e.timer != null) clearTimeout(e.timer);
        e.timer = null;
        e.fresh = [];
        // No confirm and no cleanup
        void e.queue.cancel();
    }

    function discard(/** @type {UploadEntry} */ e) {
        if (e.timer != null) clearTimeout(e.timer);
        sending.delete(e.key);
        setEntries(entries.value.filter(x => x !== e));
        announceActivity();
    }

    /**
     * A new queue of the dataset, the store's. Nobody signed in: a queue that is stopped from the start and not kept
     * (the dialog can show it, nothing can be sent through it).
     * @returns {UploadEntry}
     */
    function create(/** @type {string} */ org, /** @type {string} */ ds) {
        hearLogout();
        const signedIn = reg.isLoggedIn();
        /** @type {UploadEntry} */
        const e = {
            key: keyOf(org, ds), org, ds, queue: /** @type {any} */ (null), attached: 0, fresh: [], timer: null, settledAt: null,
            dropped: !signedIn, session, owner: signedIn ? reg.getUsername() : null
        };
        const requests = createUploadRequests({
            baseUrl: `${reg.url}${reg.Organization(org).Dataset(ds).baseApi}`,
            datasetId: e.key,
            authToken: () => reg.getAuthToken(),
            getJson: authorizedGetJson(reg),
            destination: item => item.path,
            canSend: () => maySend(e),
            onUnauthorized: () => sessionRefused(e)
        });
        e.queue = useUploadQueue({
            send: requests.send,
            announceActivity: false,
            onActivity: isActive => {
                if (isActive) sending.add(e.key);
                else sending.delete(e.key);
                announceActivity();
            },
            onItemDone: (_item, added) => {
                e.fresh.push(added);
                if (e.timer == null) e.timer = setTimeout(() => deliver(e), DELIVER_EVERY_MS);
            },
            onItemFailed: item => tell(e.key, listener => listener.failed?.(item)),
            onIdle: snapshot => settle(e, snapshot)
        });
        if (e.dropped) void e.queue.cancel();
        else setEntries([...entries.value, e]);
        return e;
    }

    // ---- The API ------------------------------------------------------------------------------------

    /**
     * The upload queue of a dataset (created when it has none): the dialog reads its state and adds to it.
     * @param {string} org @param {string} ds
     */
    function queueFor(org, ds) {
        return entryFor(org, ds).queue;
    }

    /**
     * The dataset's queue, made when it has none; a queue of another user (signed in without a sign-out between, so
     * no `logout`) is dropped first.
     * @param {string} org @param {string} ds
     */
    function entryFor(org, ds) {
        const found = find(org, ds);
        if (found && reg.isLoggedIn() && !current(found)) drop(found);
        else if (found) return found;
        return create(org, ds);
    }

    /** The session the queues belong to now (see the top). */
    function currentSession() {
        hearLogout();
        return session;
    }

    /**
     * Queues files in the dataset's queue. Refused (false) when nobody is signed in, or when `session` (the session
     * the caller began in) has ended.
     * @param {string} org @param {string} ds
     * @param {Array<{ file: File, path: string, overwrite?: boolean, fileId?: string }>} files
     * @param {{ session?: number }} [from]
     * @returns {boolean} whether the files were queued
     */
    function add(org, ds, files, { session: since } = {}) {
        if (!reg.isLoggedIn() || (since !== undefined && since !== session)) return false;
        const e = entryFor(org, ds);
        if (e.dropped) return false;
        e.settledAt = null;
        e.queue.add(files);
        return true;
    }

    /** The upload dialog shows the dataset's queue. @param {string} org @param {string} ds */
    function attach(org, ds) {
        const e = entryFor(org, ds);
        e.attached++;
    }

    /** The dialog stops showing it: a queue that has settled goes. @param {string} org @param {string} ds */
    function detach(org, ds) {
        const e = find(org, ds);
        if (!e) return;
        e.attached = Math.max(0, e.attached - 1);
        const state = e.queue.state.value;
        // A queue nobody added files to, or one that ended while the dialog showed it
        if (e.attached === 0 && (!state || state.done)) {
            deliver(e);
            discard(e);
        }
    }

    /** @param {string} org @param {string} ds */
    function pause(org, ds) {
        find(org, ds)?.queue.pause();
    }

    /** @param {string} org @param {string} ds */
    function resume(org, ds) {
        find(org, ds)?.queue.resume();
    }

    /** Stops every upload that is not settled (no confirmation: the caller asks). */
    function pauseAll() {
        for (const e of entries.value) e.queue.pause();
    }

    function resumeAll() {
        for (const e of entries.value) e.queue.resume();
    }

    /**
     * Cancels the dataset's upload (FR-UPL-04, FR-XC-27): the queue stops, and the chunks that the server stores for the
     * files not committed are removed. The files already sent stay in the dataset (D-045).
     * @param {string} org @param {string} ds
     * @param {{ confirm?: () => boolean | Promise<boolean> }} [steps]
     * @returns {Promise<{ cancelled: boolean, cleanupError: unknown }>}
     */
    async function cancel(org, ds, { confirm } = {}) {
        const e = find(org, ds);
        if (!e) return { cancelled: false, cleanupError: null };

        const result = await e.queue.cancel({
            confirm,
            cleanup: async () => {
                // The session ended while the user was asked: the server's sweep removes the chunks
                if (e.dropped) return;
                // The ids of the chunked files that the server may store chunks of, read once the queue has stopped
                // (no status changes after it): a file whose commit began while the user was asked keeps its chunks
                const sessions = (e.queue.state.value?.items ?? [])
                    .filter(item => item.fileId && CHUNKS_STILL_THERE.has(item.status))
                    .map(item => item.fileId);
                const dataset = datasetOf(e);
                const results = await Promise.allSettled(sessions.map(id => dataset.deleteChunkUpload(id)));
                // An upload the server does not know is already gone
                const failed = results.find(r => r.status === 'rejected' && !isNotFound(r.reason));
                if (failed) throw /** @type {PromiseRejectedResult} */ (failed).reason;
            }
        });
        if (result.cancelled && !e.dropped) {
            deliver(e);
            // A stopped queue cannot be used again (the dialog that shows it is closing): the next upload makes a new one
            e.attached = 0;
            discard(e);
            if (result.cleanupError)
                notify.warn('The upload stopped, but the server could not remove the part of it that it stores. It removes it within 7 days.', { summary: 'Upload cancelled' });
        }
        return result;
    }

    /** Cancels every upload. @returns {Promise<void>} */
    async function cancelAll() {
        for (const e of [...entries.value]) await cancel(e.org, e.ds);
    }

    /**
     * The session ended (see the top): every queue stops and is dropped with its subscribers, nothing is told.
     */
    function dropAll() {
        // The next session begins: whatever began in this one does not queue in it (add's `session`)
        session++;
        const list = entries.value;
        for (const e of list) stop(e);
        subscribers.clear();
        sending.clear();
        if (list.length > 0) setEntries([]);
        announceActivity();
    }

    /**
     * Hears a dataset's uploads (see the top).
     * @param {string} org @param {string} ds @param {Listener} listener
     * @returns {() => void} stops listening
     */
    function subscribe(org, ds, listener) {
        const key = keyOf(org, ds);
        if (!subscribers.has(key)) subscribers.set(key, new Set());
        subscribers.get(key)?.add(listener);
        return () => {
            const set = subscribers.get(key);
            set?.delete(listener);
            if (set?.size === 0) subscribers.delete(key);
        };
    }

    /**
     * The open chunked uploads of the caller in the dataset that no queue holds: what the dialog offers to resume.
     * A listing that fails offers nothing (the upload itself does not depend on it).
     * @param {string} org @param {string} ds
     */
    async function listOpen(org, ds) {
        try {
            const open = (await reg.Organization(org).Dataset(ds).listChunkUploads()) ?? [];
            const queued = new Set((find(org, ds)?.queue.state.value?.items ?? []).map(item => item.fileId).filter(Boolean));
            return open.filter(u => !queued.has(u.fileId));
        } catch (e) {
            console.warn(`Could not list the open uploads of ${org}/${ds}:`, e);
            return [];
        }
    }

    /**
     * Removes the chunks of an open upload that the user will not resume.
     * @param {string} org @param {string} ds @param {string} fileId
     */
    async function discardOpen(org, ds, fileId) {
        try {
            await reg.Organization(org).Dataset(ds).deleteChunkUpload(fileId);
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
    }

    return {
        uploads, active, filesLeft, progress, paused,
        session: currentSession, queueFor, add, attach, detach, pause, resume, pauseAll, resumeAll, cancel, cancelAll, subscribe,
        listOpen, discardOpen
    };
});

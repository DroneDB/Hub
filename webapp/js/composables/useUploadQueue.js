/**
 * useUploadQueue - the upload scheduler wired for a Vue component: concurrency from
 * the negotiated protocol, the shared retry policy, a snapshot refreshed at most 4 times a
 * second, and an "uploading" signal on the event bus (the task monitor pauses its event
 * stream meanwhile, so it does not take one of the browser's 6 HTTP/1.1 connections).
 *
 * The component renders `state.value` (counts, bytes, speed, ETA, rows); rows are the
 * scheduler's own objects, so `rows()` returns copies for the list it shows.
 */
import { shallowRef } from 'vue';
import emitter from '@/libs/eventBus';
import { createUploadScheduler } from '@/libs/upload/uploadScheduler';
import { negotiatedProtocol, uploadConcurrency, MULTIPLEXED_STREAMS } from '@/libs/upload/protocolLimits';
import { useResilientUpload } from '@/composables/useResilientUpload';
import { UPLOAD_ACTIVITY_EVENT } from '@/libs/upload/uploadEvents';

let nextItemId = 0;

/**
 * @param {object} opts
 * @param {(job, hooks) => Promise<Array>} opts.send the request layer (uploadRequests().send)
 * @param {(job) => object} [opts.plan] request planning (default: bundles and chunks)
 * @param {(item, entry) => void} [opts.onItemDone]
 * @param {(item) => void} [opts.onItemFailed] a file failed for good (`item.conflictPath`: its name exists)
 * @param {(snapshot) => void} [opts.onIdle] the queue has nothing left to do
 */
export function useUploadQueue(opts) {
    const state = shallowRef(null);
    // AIMD can grow up to what a multiplexed connection allows; the protocol limit caps it
    const resilience = useResilientUpload({ parallelUploads: MULTIPLEXED_STREAMS });

    const scheduler = createUploadScheduler({
        send: opts.send,
        plan: opts.plan,
        policy: resilience,
        maxConcurrency: () => uploadConcurrency(negotiatedProtocol()),
        onItemDone: opts.onItemDone,
        onItemFailed: opts.onItemFailed,
        onActivity: active => emitter.emit(UPLOAD_ACTIVITY_EVENT, { active }),
        onChange: snapshot => {
            state.value = snapshot;
            if (snapshot.done) opts.onIdle?.(snapshot);
        }
    });

    return {
        state,
        /**
         * @param {Array<{file: File, path: string, overwrite?: boolean}>} files  `path` is the dataset path
         *   (the name it gets: Keep both changes it); `overwrite` replaces a file that has it (Replace)
         */
        add(files) {
            scheduler.add(files.map(({ file, path, overwrite }) => ({
                id: `u${++nextItemId}`,
                file,
                name: path,
                path,
                overwrite: overwrite === true,
                size: file.size
            })));
        },
        retry: id => scheduler.retry(id),
        retryFailed: () => scheduler.retryFailed(),
        /** @param {string} id @param {{ path?: string, overwrite?: boolean }} changes */
        requeue: (id, changes) => scheduler.requeue(id, changes),
        /**
         * The one way the Hub cancels an upload (FR-XC-27). `confirm()` asks the user first: when it answers
         * false nothing happens. The queue then stops (requests in flight are aborted, queued and retrying files
         * are dropped), and `cleanup()` undoes what the upload left on the server: /upload rolls its share batch
         * back (ShareApi.rollback), the dataset page passes none, because the files already sent stay (D-045).
         * The stop is synchronous when there is no `confirm`. A failing cleanup does not throw: the queue is
         * stopped either way, and the caller gets the error to tell the user.
         * @param {object} [steps]
         * @param {() => boolean | Promise<boolean>} [steps.confirm]
         * @param {() => unknown} [steps.cleanup]
         * @returns {Promise<{ cancelled: boolean, cleanupError: unknown }>}
         */
        async cancel({ confirm, cleanup } = {}) {
            if (confirm && !(await confirm())) return { cancelled: false, cleanupError: null };

            scheduler.cancelAll();
            emitter.emit(UPLOAD_ACTIVITY_EVENT, { active: false });

            let cleanupError = null;
            if (cleanup) {
                try {
                    await cleanup();
                } catch (e) {
                    cleanupError = e;
                }
            }
            return { cancelled: true, cleanupError };
        },
        rows: filter => (state.value?.items ?? []).filter(filter ?? (() => true)).map(item => ({ ...item }))
    };
}

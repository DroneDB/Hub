/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * useUploadQueue - the upload scheduler wired for a Vue component (UPL-01): concurrency from
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

export { UPLOAD_ACTIVITY_EVENT };

let nextItemId = 0;

/**
 * @param {object} opts
 * @param {(job, hooks) => Promise<Array>} opts.send the request layer (uploadRequests().send)
 * @param {(job) => object} [opts.plan] request planning (default: bundles and chunks)
 * @param {(item, entry) => void} [opts.onItemDone]
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
        onActivity: active => emitter.emit(UPLOAD_ACTIVITY_EVENT, { active }),
        onChange: snapshot => {
            state.value = snapshot;
            if (snapshot.done) opts.onIdle?.(snapshot);
        }
    });

    return {
        state,
        /** @param {Array<{file: File, path: string}>} files */
        add(files) {
            scheduler.add(files.map(({ file, path }) => ({
                id: `u${++nextItemId}`,
                file,
                name: path,
                path,
                size: file.size
            })));
        },
        retry: id => scheduler.retry(id),
        retryFailed: () => scheduler.retryFailed(),
        cancel() {
            scheduler.cancelAll();
            emitter.emit(UPLOAD_ACTIVITY_EVENT, { active: false });
        },
        rows: filter => (state.value?.items ?? []).filter(filter ?? (() => true)).map(item => ({ ...item }))
    };
}

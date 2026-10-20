/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * lazyComponent - a component whose code loads the first time it renders (HUB-02).
 *
 * Dialogs and tabs of the dataset page are rendered with v-if: as async components their
 * chunks (and the libraries they import: OpenLayers, CodeMirror, the upload queue) load when
 * a user first opens them, not with the page. While the chunk loads the shared Loader shows;
 * a failed load is retried once (a deploy may have replaced the chunk, or the network
 * blipped), then reported in a toast instead of failing silently.
 */
import { defineAsyncComponent } from 'vue';
import ToastEventBus from 'primevue/toasteventbus';
import Loader from '@/components/Loader.vue';

/**
 * @param {() => Promise<any>} loader e.g. () => import('./Dialog.vue')
 * @param {object} [opts]
 * @param {boolean} [opts.showLoader] show the full-screen Loader while loading (default true;
 *   false for components that render in place, such as tabs)
 * @param {(error: Error) => void} [opts.notify] how a failure is reported (default: toast)
 */
export function lazyComponent(loader, opts = {}) {
    const notify = opts.notify ?? notifyLoadFailure;
    return defineAsyncComponent({
        loader,
        loadingComponent: opts.showLoader === false ? undefined : Loader,
        // A chunk that arrives quickly does not flash the loader
        delay: 150,
        onError(error, retry, fail, attempts) {
            if (attempts <= 1) {
                retry();
                return;
            }
            notify(error);
            fail();
        }
    });
}

function notifyLoadFailure(error) {
    console.error('Cannot load a component of the page:', error);
    ToastEventBus.emit('add', {
        severity: 'error',
        summary: 'Cannot open this part of the page',
        detail: 'Check the connection and try again (reload the page if it keeps failing).',
        life: 8000
    });
}

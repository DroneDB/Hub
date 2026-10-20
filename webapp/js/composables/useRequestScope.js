/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Request scope - requests a view starts are aborted when the view goes away (HUB-06), so
 * leaving a dataset while a folder listing is in flight cancels the listing instead of
 * finishing it for nobody.
 *
 * Options API: `mixins: [requestScopeMixin]`, then pass `{ signal: this.requestSignal }`.
 * Composition API: `const scope = useRequestScope()`, then `{ signal: scope.signal }`.
 */
import { onBeforeUnmount } from 'vue';

export function useRequestScope() {
    const controller = new AbortController();
    onBeforeUnmount(() => controller.abort());
    return { signal: controller.signal };
}

export const requestScopeMixin = {
    created() {
        this._requestScope = new AbortController();
    },
    beforeUnmount() {
        this._requestScope?.abort();
    },
    computed: {
        /** Aborted when the component unmounts. */
        requestSignal() {
            return this._requestScope?.signal;
        }
    }
};

/** Whether `error` only says the request was aborted (nothing to report). */
export function isAbort(error) {
    return error?.name === 'AbortError';
}

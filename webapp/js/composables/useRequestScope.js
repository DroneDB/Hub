/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Request scope - requests a view starts are aborted when the view goes away (HUB-06), so
 * leaving a dataset while a folder listing is in flight cancels the listing instead of
 * finishing it for nobody.
 *
 *   setup() { return { requestSignal: useRequestScope().signal }; }   then `{ signal: this.requestSignal }`
 * (HQ-06: the requestScopeMixin twin is gone.)
 */
import { getCurrentScope, onScopeDispose } from 'vue';

/** An AbortSignal aborted when the owning component (effect scope) goes away. */
export function useRequestScope() {
    const controller = new AbortController();
    if (getCurrentScope()) onScopeDispose(() => controller.abort());
    return { signal: controller.signal };
}

/** Whether `error` only says the request was aborted (nothing to report). */
export function isAbort(error) {
    return error?.name === 'AbortError';
}

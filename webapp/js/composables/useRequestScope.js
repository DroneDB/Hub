/**
 * Request scope - requests a view starts are aborted when the view goes away, so
 * leaving a dataset while a folder listing is in flight cancels the listing instead of
 * finishing it for nobody.
 *
 *   setup() { return { requestSignal: useRequestScope().signal }; }   then `{ signal: this.requestSignal }`
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

// @ts-check
/**
 * Timers owned by a component (HQ-06): cleared when the component (effect scope) goes
 * away, so a callback never runs on an unmounted component. Outside a scope they behave
 * like plain timers and must be cleared by the caller.
 */
import { ref, getCurrentScope, onScopeDispose } from 'vue';
import { onTick } from '@/libs/clock';

/** @param {() => void} stop */
function stopWithScope(stop) {
    if (getCurrentScope()) onScopeDispose(stop);
}

/**
 * Runs `fn` once after `ms`.
 * @param {() => void} fn
 * @param {number} ms
 * @returns {{ clear: () => void }}
 */
export function useTimeout(fn, ms) {
    let handle = setTimeout(() => { handle = null; fn(); }, ms);
    const clear = () => { if (handle) { clearTimeout(handle); handle = null; } };
    stopWithScope(clear);
    return { clear };
}

/**
 * Runs `fn` every `ms`.
 * @param {() => void} fn
 * @param {number} ms
 * @returns {{ clear: () => void }}
 */
export function useInterval(fn, ms) {
    let handle = setInterval(fn, ms);
    const clear = () => { if (handle) { clearInterval(handle); handle = null; } };
    stopWithScope(clear);
    return { clear };
}

/**
 * A debounced `fn`: runs `ms` after the last call; `cancel()` drops a pending run.
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F & { cancel: () => void }}
 */
export function useDebounceFn(fn, ms) {
    /** @type {ReturnType<typeof setTimeout>|null} */
    let handle = null;
    const cancel = () => { if (handle) { clearTimeout(handle); handle = null; } };
    const debounced = /** @type {F & { cancel: () => void }} */ (/** @type {unknown} */ ((...args) => {
        cancel();
        handle = setTimeout(() => { handle = null; fn(...args); }, ms);
    }));
    debounced.cancel = cancel;
    stopWithScope(cancel);
    return debounced;
}

/**
 * The current time, updated every second by the shared clock (paused while the page is
 * hidden).
 * @returns {import('vue').Ref<number>}
 */
export function useNow() {
    const now = ref(Date.now());
    const stop = onTick(t => { now.value = t; });
    stopWithScope(stop);
    return now;
}

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

/**
 * A `later(fn, ms)` function whose pending timeouts are cleared with the owner: for
 * Options-API components, which schedule from methods (`this.later(...)`), outside setup.
 *   setup() { return { later: useTimerGroup() }; }
 * `later.clear()` drops every pending call.
 * @returns {((fn: () => void, ms: number) => void) & { clear: () => void }}
 */
export function useTimerGroup() {
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    const handles = new Set();
    const later = /** @type {((fn: () => void, ms: number) => void) & { clear: () => void }} */ ((fn, ms) => {
        const handle = setTimeout(() => { handles.delete(handle); fn(); }, ms);
        handles.add(handle);
    });
    later.clear = () => { handles.forEach(h => clearTimeout(h)); handles.clear(); };
    stopWithScope(later.clear);
    return later;
}

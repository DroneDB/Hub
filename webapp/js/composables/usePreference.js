// @ts-check
/**
 * A ref backed by a stored preference (HQ-02): reads once, writes on every change.
 */
import { ref, watch } from 'vue';
import { getPref, setPref } from '@/libs/preferences';

/**
 * @template T
 * @param {string} key  a PREF key
 * @param {T} fallback
 * @param {{ session?: boolean }} [options]
 * @returns {import('vue').Ref<T>}
 */
export function usePreference(key, fallback, options) {
    const value = /** @type {import('vue').Ref<T>} */ (ref(getPref(key, fallback, options)));
    watch(value, v => setPref(key, v, options), { deep: true, flush: 'sync' });
    return value;
}

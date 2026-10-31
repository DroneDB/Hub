// @ts-check
/**
 * A ref backed by a stored preference: reads once, writes every change of its own, and follows
 * the changes that come from elsewhere (another view of the same key, another tab, the account).
 */
import { onScopeDispose, ref, watch } from 'vue';
import { getPref, onPrefChange, setPref } from '@/libs/preferences';

/**
 * @template T
 * @param {string} key  a PREF key
 * @param {T} fallback
 * @param {{ session?: boolean }} [options]
 * @returns {import('vue').Ref<T>}
 */
export function usePreference(key, fallback, options) {
    const value = /** @type {import('vue').Ref<T>} */ (ref(getPref(key, fallback, options)));
    // Set while the ref takes a value from storage (not written back) or writes its own (not re-read)
    let applying = false;
    let writing = false;

    watch(value, v => {
        if (applying) return;
        writing = true;
        try {
            setPref(key, v, options);
        } finally {
            writing = false;
        }
    }, { deep: true, flush: 'sync' });

    // Session storage never notifies: nothing outside this ref changes it
    if (!options?.session) {
        const unsubscribe = onPrefChange(changed => {
            if (changed !== key || writing) return;
            applying = true;
            try {
                value.value = getPref(key, fallback, options);
            } finally {
                applying = false;
            }
        });
        onScopeDispose(unsubscribe);
    }
    return value;
}

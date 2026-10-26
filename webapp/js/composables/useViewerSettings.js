// @ts-check
/**
 * useViewerSettings - a viewer's persisted display settings. Stored values are merged over the
 * defaults, so a setting added later starts at its default. A change that comes from elsewhere
 * (another tab, the account, the Preferences page) updates the settings.
 *
 *   const { settings, resetSettings } = useViewerSettings(PREF.NEXUS_LIGHTING, { ambientIntensity: 0.4 });
 *   settings.ambientIntensity = 1;   // saved
 */
import { onScopeDispose, reactive, watch } from 'vue';
import { getPref, onPrefChange, setPref } from '@/libs/preferences';

/**
 * @template {Record<string, any>} T
 * @param {string} key   a PREF key
 * @param {T} defaults
 * @returns {{ settings: T, resetSettings: () => void }}
 */
export function useViewerSettings(key, defaults) {
    /** The defaults, with the stored values of the settings that exist. @returns {Record<string, any>} */
    function mergeOverDefaults() {
        const stored = getPref(key, null) || {};
        /** @type {Record<string, any>} */
        const merged = { ...defaults };
        for (const name of Object.keys(defaults)) {
            if (stored[name] !== undefined && stored[name] !== null) merged[name] = stored[name];
        }
        return merged;
    }

    const settings = /** @type {T} */ (reactive(mergeOverDefaults()));
    // Set while the settings change without being a change of the user (taken from storage, or
    // a batch that is saved once): the watch below does not write them
    let applying = false;
    let writing = false;

    function save() {
        writing = true;
        try {
            setPref(key, { ...settings });
        } finally {
            writing = false;
        }
    }

    /** @param {() => void} change */
    function silently(change) {
        applying = true;
        try {
            change();
        } finally {
            applying = false;
        }
    }

    watch(settings, () => { if (!applying) save(); }, { deep: true, flush: 'sync' });

    const unsubscribe = onPrefChange(changed => {
        if (changed !== key || writing) return;
        silently(() => Object.assign(settings, mergeOverDefaults()));
    });
    onScopeDispose(unsubscribe);

    function resetSettings() {
        silently(() => Object.assign(settings, defaults));
        save();
    }
    return { settings, resetSettings };
}

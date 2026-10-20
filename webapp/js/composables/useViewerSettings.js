// @ts-check
/**
 * useViewerSettings - a viewer's persisted display settings (HQ-08: Nexus and the 3D
 * viewer each had their own load/save/remove code). Stored values are merged over the
 * defaults, so a setting added later starts at its default.
 *
 *   const { settings, resetSettings } = useViewerSettings(PREF.NEXUS_LIGHTING, { ambientIntensity: 0.4 });
 *   settings.ambientIntensity = 1;   // saved
 */
import { reactive, watch } from 'vue';
import { getPref, setPref } from '@/libs/preferences';

/**
 * @template {Record<string, any>} T
 * @param {string} key   a PREF key
 * @param {T} defaults
 * @returns {{ settings: T, resetSettings: () => void }}
 */
export function useViewerSettings(key, defaults) {
    const stored = getPref(key, null) || {};
    /** @type {Record<string, any>} */
    const initial = { ...defaults };
    for (const name of Object.keys(defaults)) {
        if (stored[name] !== undefined && stored[name] !== null) initial[name] = stored[name];
    }
    const settings = /** @type {T} */ (reactive(initial));
    watch(settings, value => setPref(key, { ...value }), { deep: true });

    function resetSettings() {
        Object.assign(settings, defaults);
    }
    return { settings, resetSettings };
}

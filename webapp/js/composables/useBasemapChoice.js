// @ts-check
/**
 * The basemap chosen in a settings window, with the custom basemap editor that "Custom" opens.
 *
 * "Custom" without a usable custom source waits in the window: the selection is written only when
 * the editor saves a source, so a map never switches to a basemap it cannot draw. Clearing the
 * source while "Custom" is selected returns the selection to the default basemap.
 *
 *   const { choice, editingCustom, onApplied, onCleared } = useBasemapChoice(selectedRef);
 */
import { computed, ref, watch } from 'vue';
import { getCustomBasemapConfig } from '@/libs/map/basemaps';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

/**
 * @param {import('vue').Ref<string>|import('vue').WritableComputedRef<string>} selected  the stored
 *        selection (a preference, or a map's own basemap)
 */
export function useBasemapChoice(selected) {
    const pendingCustom = ref(false);

    // A selection made elsewhere (another window, Reset section) ends the wait
    watch(selected, () => { pendingCustom.value = false; }, { flush: 'sync' });

    const choice = computed({
        get: () => (pendingCustom.value ? 'custom' : selected.value),
        set: value => {
            if (value === 'custom' && value !== selected.value && !getCustomBasemapConfig()) {
                pendingCustom.value = true;
                return;
            }
            pendingCustom.value = false;
            selected.value = value;
        }
    });

    const editingCustom = computed(() => choice.value === 'custom');

    /** The editor saved a custom source: the map draws it. */
    function onApplied() {
        pendingCustom.value = false;
        selected.value = 'custom';
    }

    /** The editor cleared the custom source: a custom selection returns to the default. */
    function onCleared() {
        pendingCustom.value = false;
        if (selected.value === 'custom') selected.value = PREF_DEFAULTS[PREF.BASEMAP];
    }

    return { choice, editingCustom, onApplied, onCleared };
}

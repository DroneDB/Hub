// @ts-check
import { computed, ref } from 'vue';
import { useEventListener } from '@/composables/useEventListener';
import { EXIT_FULLSCREEN_ICON, FULLSCREEN_ICON } from '@/libs/glyphs';
import { isFullScreenCurrently, toggleFullScreen } from '@/libs/utils';

/**
 * The state of a fullscreen button: whether the page shows an element in full screen (it follows the browser, so
 * Esc and the browser's own controls count), the name of the button for that state and its glyph. A viewer and the
 * map show the same button: "Fullscreen" with the expand glyph, then "Exit fullscreen" with the compress glyph.
 * @returns {{ isFullscreen: import('vue').Ref<boolean>, label: import('vue').ComputedRef<string>,
 *     icon: import('vue').ComputedRef<string>, toggle: (element?: Element) => void }}
 */
export function useFullscreen() {
    const isFullscreen = ref(isFullScreenCurrently());
    const sync = () => { isFullscreen.value = isFullScreenCurrently(); };
    useEventListener(document, 'fullscreenchange', sync);
    useEventListener(document, 'webkitfullscreenchange', sync);
    return {
        isFullscreen,
        label: computed(() => (isFullscreen.value ? 'Exit fullscreen' : 'Fullscreen')),
        icon: computed(() => (isFullscreen.value ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON)),
        toggle: element => toggleFullScreen(element)
    };
}

// @ts-check
/**
 * Whether the stacked tables are cards (below `sm`, D-026): a ref that follows the window's width
 * through the media query of the card renderer (STACKED_MEDIA_QUERY of libs/responsiveColumns.js),
 * its listener removed with the component. Where there is no matchMedia the tables are tables.
 *
 *   setup() { return { stacked: useStackedLayout() }; }
 */
import { ref, getCurrentScope, onScopeDispose } from 'vue';
import { STACKED_MEDIA_QUERY } from '@/libs/responsiveColumns';

/** @returns {import('vue').Ref<boolean>} */
export function useStackedLayout() {
    return useMediaMatch(STACKED_MEDIA_QUERY);
}

/**
 * Whether the window matches a media query of libs/responsiveColumns.js (STACKED_MEDIA_QUERY, TABLET_MEDIA_QUERY): a
 * ref that follows the window, its listener removed with the component. False where there is no matchMedia.
 * @param {string} query
 * @returns {import('vue').Ref<boolean>}
 */
export function useMediaMatch(query) {
    const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query) : null;
    const matches = ref(!!media?.matches);
    if (media) {
        /** @param {MediaQueryListEvent} e */
        const onChange = e => { matches.value = e.matches; };
        media.addEventListener('change', onChange);
        if (getCurrentScope()) onScopeDispose(() => media.removeEventListener('change', onChange));
    }
    return matches;
}

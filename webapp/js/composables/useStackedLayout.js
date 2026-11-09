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
    const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(STACKED_MEDIA_QUERY) : null;
    const stacked = ref(!!media?.matches);
    if (media) {
        /** @param {MediaQueryListEvent} e */
        const onChange = e => { stacked.value = e.matches; };
        media.addEventListener('change', onChange);
        if (getCurrentScope()) onScopeDispose(() => media.removeEventListener('change', onChange));
    }
    return stacked;
}

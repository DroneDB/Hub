// @ts-check
/**
 * The size class of a map container (libs/map/mapSize.js) as a reactive object that follows the
 * container, for the map and the panels over it (provided as 'mapSize'). The container is observed
 * with a ResizeObserver, disconnected with the component, and read once on `observe`.
 *
 *   const mapSize = useMapSize();   // in setup
 *   mapSize.observe(containerElement);   // once it is mounted
 *   <div :class="{ 'is-narrow': mapSize.size.narrow }">
 */
import { reactive } from 'vue';
import { mapSizeOf } from '@/libs/map/mapSize';
import { useResizeObserver } from '@/composables/useEventListener';

/** The size of a map that has not been measured: not narrow, not short */
export const UNMEASURED = Object.freeze(mapSizeOf(0, 0));

export function useMapSize() {
    const size = reactive({ ...UNMEASURED });
    /** @param {number} width @param {number} height */
    const set = (width, height) => Object.assign(size, mapSizeOf(width, height));
    return {
        size,
        /** @param {HTMLElement | null | undefined} element */
        observe(element) {
            if (!element) return;
            set(element.clientWidth, element.clientHeight);
            useResizeObserver(element, entries => {
                const box = entries[entries.length - 1]?.contentRect;
                if (box) set(box.width, box.height);
            });
        }
    };
}

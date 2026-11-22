// @ts-check
/**
 * useMapItemFocus - the `?item=<id>` of the map: frame and select that annotation once the map can show it, or say
 * that it no longer exists. It is asked for at most once, and only when the map has both read its measurements and
 * settled on its first position (the map fits its files once, and that fit would move a view that was already framed
 * on the item); an item that is not in the measurements opens the map as usual, with the notice.
 *
 *   const focus = useMapItemFocus({ item: () => props.focusItem, measureControls });
 *   focus.onMeasurementsLoaded();   // after the map read the measurements of its file
 *   focus.onFilesFitted();          // after the first fit to the files
 */
import { notify } from '@/libs/notify';
import { ITEM_GONE } from '@/libs/views/itemQuery';

/**
 * @param {object} ctx
 * @param {() => string | null | undefined} ctx.item  the id the address asked for
 * @param {{ value: { focusItem: (id: string) => boolean } | null }} ctx.measureControls  the map's measure control
 */
export function useMapItemFocus({ item, measureControls }) {
    let measurementsLoaded = false;
    let filesFitted = false;
    let done = false;

    function attempt() {
        const id = item();
        if (done || !id || !measurementsLoaded || !filesFitted) return;
        done = true;
        if (!measureControls.value || !measureControls.value.focusItem(id)) notify.warn(ITEM_GONE, { summary: 'Item not found' });
    }

    return {
        onMeasurementsLoaded() {
            measurementsLoaded = true;
            attempt();
        },
        onFilesFitted() {
            filesFitted = true;
            attempt();
        }
    };
}

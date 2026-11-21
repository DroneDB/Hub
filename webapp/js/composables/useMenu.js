import { ref, nextTick } from 'vue';
import { useEventListener } from '@/composables/useEventListener';

/**
 * The open/close and keyboard behaviour of a button that opens a menu (WAI-ARIA menu button): Enter, Space or the down
 * arrow on the button opens it with an item focused, the arrows, Home and End move between the items, Escape closes it
 * and gives the focus back to the button, and it also closes when the focus leaves it (Tab, a click on another control)
 * or a press lands outside it (a view that takes no focus). Enter and Space on the button or on an item are not handled
 * here: on a button they are its click, and the component that owns the menu answers the click.
 *
 * The component keeps its markup, and gives the refs of the three elements it has:
 *   `root`: contains the button and the menu (focus and presses inside it keep the menu open),
 *   `trigger`: the button, `list`: the menu (only in the page while it is open).
 * and wires `onKey` (on the button and on the menu) and `onFocusOut` (on the root).
 *
 * A menu whose actions can be off has two ways to say so. With the real `disabled` the item cannot be focused: the
 * `itemSelector` leaves it out and the arrows skip it. With `aria-disabled` it stays focusable, so that a keyboard user
 * reaches it and reads why it is off (the arrows move through it, `isEnabled` says it is off): the menu opens on the
 * first item that is on, or on the first item when none is, and what an off item does on a click is the component's.
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement | null>} options.root
 * @param {import('vue').Ref<HTMLElement | null>} options.trigger
 * @param {import('vue').Ref<HTMLElement | null>} options.list
 * @param {string} [options.itemSelector]  the items of the menu that the arrows move between
 * @param {(item: HTMLElement) => boolean} [options.isEnabled]  whether an item is on (opening focuses the first that is)
 * @param {() => void} [options.beforeOpen]  runs as the menu is about to open (where it opens to is decided here)
 */
export function useMenu({ root, trigger, list, itemSelector = '[role="menuitem"]', isEnabled = () => true, beforeOpen }) {
    const open = ref(false);

    const items = () => [...(list.value?.querySelectorAll(itemSelector) ?? [])];

    // preventScroll: the menu opens inside a scrolling panel, and focusing must not scroll it away from the button
    const focusItem = item => item?.focus({ preventScroll: true });

    async function show() {
        beforeOpen?.();
        open.value = true;
        await nextTick();
        const all = items();
        focusItem(all.find(isEnabled) ?? all[0]);
    }

    /** @param {{ refocus?: boolean }} [options] refocus: the focus goes back to the button (the menu was closed from inside it) */
    function close({ refocus = false } = {}) {
        if (!open.value) return;
        open.value = false;
        if (refocus) trigger.value?.focus({ preventScroll: true });
    }

    const toggle = () => (open.value ? close() : show());

    /** Moves the focus by one item (1 next, -1 previous), around the ends; from outside the items to the first or the last */
    function move(step) {
        const all = items();
        if (!all.length) return;
        const at = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        focusItem(all[at < 0 ? (step > 0 ? 0 : all.length - 1) : (at + step + all.length) % all.length]);
    }

    function onKey(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (open.value) move(e.key === 'ArrowDown' ? 1 : -1);
            else show();
        } else if ((e.key === 'Home' || e.key === 'End') && open.value) {
            e.preventDefault();
            const all = items();
            focusItem(e.key === 'Home' ? all[0] : all[all.length - 1]);
        } else if (e.key === 'Tab' && open.value) {
            // Tab leaves the menu: from an item it would land on the button, still inside the menu's root, so the
            // focus-out below would not close it
            close();
        } else if (e.key === 'Escape' && open.value) {
            // The menu takes the key: it does not also cancel what the viewer draws
            e.preventDefault();
            e.stopPropagation();
            close({ refocus: true });
        }
    }

    // The focus left the button and its menu (Tab, or a click on another control)
    function onFocusOut(e) {
        if (!root.value?.contains(e.relatedTarget)) close();
    }

    // A click that gives the focus to nothing (the 3D view) closes it too
    useEventListener(document, 'pointerdown', e => {
        if (open.value && !root.value?.contains(e.target)) close();
    });

    return { open, show, close, toggle, onKey, onFocusOut };
}

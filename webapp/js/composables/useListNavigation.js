// @ts-check
/**
 * useListNavigation - the keyboard model of the file grid and the file table (FR-EXP-09): the list
 * is one tab stop that holds the focus, and the active item is named by `aria-activedescendant`
 * (as the tree and the colormap dropdown do), not by a tab stop on every item.
 *
 *   const nav = useListNavigation({ count: () => files.length, columns: () => gridColumns, move });
 *   <div role="listbox" tabindex="0" :aria-activedescendant="nav.activeId" @keydown="nav.onKeydown">
 *
 * ArrowLeft/ArrowRight move by 1 and ArrowUp/ArrowDown by a row (`columns` items; a table has one
 * column and no horizontal arrows), Home/End jump to the first and the last item, PageUp/PageDown
 * by `pageSize` rows. A move calls `move(index, { extend })`: `extend` is Shift being held, which
 * extends the selection from its anchor (the list does the selecting, through useFileSelection).
 * Ctrl/Cmd with an arrow moves the active item only (`keepSelection`), and Space toggles it (`toggle(index)`).
 * Enter opens it (`open(index)`).
 */
import { ref, computed } from 'vue';

/**
 * @param {object} options
 * @param {() => number} options.count  items in the list
 * @param {() => number} [options.columns]  items per row (1 for a table)
 * @param {boolean} [options.horizontal]  ArrowLeft/ArrowRight move (false for a table)
 * @param {number} [options.pageSize]  rows moved by PageUp/PageDown
 * @param {(index: number, mods: { extend: boolean, keepSelection: boolean }) => void} options.move  the active item changed by a key
 * @param {(index: number) => void} [options.open]  Enter on the active item
 * @param {(index: number) => void} [options.toggle]  Space on the active item
 * @param {string} [options.idPrefix]  prefix of the ids `aria-activedescendant` names
 */
export function useListNavigation({ count, columns = () => 1, horizontal = true, pageSize = 5, move, open, toggle, idPrefix = 'list-item' }) {
    /** The active item, -1 when none */
    const active = ref(-1);

    /** @param {number} index */
    const idOf = index => `${idPrefix}-${index}`;
    const activeId = computed(() => (active.value >= 0 && active.value < count() ? idOf(active.value) : undefined));

    /** @param {number} index */
    const clamp = index => Math.max(0, Math.min(count() - 1, index));

    /** Makes `index` the active item (a click, or a move). @param {number} index */
    function setActive(index) {
        active.value = count() ? clamp(index) : -1;
    }

    /**
     * Handles a key of the list. Returns whether the key was one of the list's (its default is
     * prevented: the page does not scroll under the arrows).
     * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, preventDefault: () => void }} e
     */
    function onKeydown(e) {
        if (e.altKey) return false;
        const total = count();
        if (!total) return false;
        const cols = Math.max(1, columns());
        const modifier = !!(e.ctrlKey || e.metaKey);
        // The active item when none is: a first key lands on the first item
        const from = active.value >= 0 && active.value < total ? active.value : -1;
        /** @type {number|null} */
        let target = null;
        switch (e.key) {
            case 'ArrowDown': target = from < 0 ? 0 : from + cols; break;
            case 'ArrowUp': target = from < 0 ? 0 : from - cols; break;
            case 'ArrowRight': if (horizontal) target = from < 0 ? 0 : from + 1; break;
            case 'ArrowLeft': if (horizontal) target = from < 0 ? 0 : from - 1; break;
            case 'PageDown': target = from < 0 ? 0 : from + cols * pageSize; break;
            case 'PageUp': target = from < 0 ? 0 : from - cols * pageSize; break;
            case 'Home': target = 0; break;
            case 'End': target = total - 1; break;
            case ' ':
                if (from < 0) return false;
                e.preventDefault();
                toggle?.(from);
                return true;
            case 'Enter':
                if (from < 0) return false;
                e.preventDefault();
                open?.(from);
                return true;
            default: return false;
        }
        if (target === null) return false;
        e.preventDefault();
        // An arrow at the edge stays on the edge (a row up from the first row is the first item)
        const next = clamp(target);
        active.value = next;
        move(next, { extend: !!e.shiftKey, keepSelection: modifier && !e.shiftKey });
        return true;
    }

    return { active, activeId, idOf, setActive, onKeydown };
}

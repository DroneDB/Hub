// @ts-check
/**
 * useFileSelection - click selection of a file list (HQ-09: Explorer and TableView each
 * had a copy): a click selects one item, Ctrl+click toggles, Shift+click selects the range
 * from the last clicked item, right click keeps a selection that contains the item.
 *
 * The selection is a Set of keys; the files are not touched. Views that share the
 * explorer items (`file.selected`) load the current state first and write the result back.
 *
 *   const sel = useFileSelection(() => files, f => f.path);
 *   sel.load(files.filter(f => f.selected));
 *   sel.toggle(index, { shift: e.shiftKey, ctrl: e.ctrlKey });
 *   files.forEach(f => { f.selected = sel.has(f); });
 */
import { ref } from 'vue';

/**
 * @template T
 * @param {() => T[]} items
 * @param {(item: T) => any} keyOf
 */
export function useFileSelection(items, keyOf) {
    /** @type {import('vue').Ref<Set<any>>} */
    const selected = ref(new Set());
    /** Index of the last plain or Ctrl click (where a Shift range starts) */
    let anchor = null;

    /** @param {T[]} list */
    const keysOf = list => new Set(list.map(keyOf));

    /**
     * @param {number} index
     * @param {{ shift?: boolean, ctrl?: boolean, right?: boolean }} [mods]
     */
    function toggle(index, { shift = false, ctrl = false, right = false } = {}) {
        const list = items();
        const item = list[index];
        if (item === undefined) return;
        const key = keyOf(item);
        if (shift && anchor !== null && selected.value.size) {
            const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
            selected.value = keysOf(list.slice(from, to + 1));
            return;
        }
        if (ctrl) {
            const next = new Set(selected.value);
            if (next.has(key)) next.delete(key);
            else {
                next.add(key);
                anchor = index;
            }
            selected.value = next;
            return;
        }
        if (right && selected.value.has(key)) return;
        selected.value = new Set([key]);
        anchor = index;
    }

    /** @param {T[]} list  the items currently selected */
    function load(list) {
        selected.value = keysOf(list);
        if (!selected.value.size) anchor = null;
    }

    return {
        selected,
        toggle,
        load,
        selectAll: () => { selected.value = keysOf(items()); },
        clear: () => { selected.value = new Set(); anchor = null; },
        /** @param {T} item */
        has: item => selected.value.has(keyOf(item))
    };
}

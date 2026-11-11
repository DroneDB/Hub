// @ts-check
/**
 * editableList - what the lists the user keeps in the views file (camera views, pins) share: the
 * item on show, removing, moving and renaming an item, each marking the file as changed. The
 * lists differ in what an item is and in which field names it (`nameKey`).
 *
 *   const list = editableList(cameras, { nameKey: 'name', markDirty: () => { dirty.value = true; } });
 *   list.remove(2); list.move({ index: 0, dir: 1 }); list.rename({ index: 1, name: 'Door' });
 */
import { ref } from 'vue';
import { activeAfterDelete, activeAfterMove } from './cameraPresets';

/**
 * @param {{ value: any[] }} items  the list (a ref)
 * @param {{ nameKey: string, markDirty: () => void }} options
 */
export function editableList(items, { nameKey, markDirty }) {
    const active = ref(/** @type {number | null} */ (null));

    function remove(/** @type {number} */ index) {
        if (index < 0 || index >= items.value.length) return;
        items.value.splice(index, 1);
        markDirty();
        active.value = activeAfterDelete(active.value, index);
    }

    function move(/** @type {{ index: number, dir: number }} */ { index, dir }) {
        const dest = index + dir;
        const list = items.value;
        if (index < 0 || index >= list.length || dest < 0 || dest >= list.length) return;
        list.splice(dest, 0, list.splice(index, 1)[0]);
        markDirty();
        active.value = activeAfterMove(active.value, index, dest);
    }

    function rename(/** @type {{ index: number, name: string }} */ { index, name }) {
        const item = items.value[index];
        if (!item) return;
        item[nameKey] = name;
        markDirty();
    }

    return { active, remove, move, rename };
}

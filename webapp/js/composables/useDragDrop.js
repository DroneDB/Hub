// @ts-check
/**
 * Drag-and-drop of the explorer, table and tree (HQ-06: composables; were the
 * itemDnDMixin/dragDropMixin of libs/dragDropUtils).
 *
 * `useItemDragDrop` handles drags onto single items (a folder highlights; dropping on a
 * file means its folder). `useDragDrop` adds the view's background: dropping there moves
 * into, or uploads OS files to, the folder on screen. Moves and uploads go to the
 * `datasetDrop` the dataset page provides.
 *
 *   setup(props) {
 *       const instance = getCurrentInstance();
 *       return useDragDrop(props, { selectedFiles: () => instance.proxy.selectedFiles });
 *   }
 */
import { ref, inject } from 'vue';
import ddb from 'ddb';
import { startInternalDrag, isInternalDrag, syntheticFolderItem, requestMove, getFilesFromDrop } from '@/libs/dragDropUtils';

/**
 * @typedef {{ canWrite?: boolean, currentPath?: string|null }} DnDProps
 * @typedef {{ selectedFiles?: () => any[], onOsDrop?: (evt: DragEvent) => void }} DnDOptions
 */

/** The dragged item, or null. @param {DragEvent} evt */
function draggedItem(evt) {
    try {
        const item = JSON.parse(evt.dataTransfer.getData('item'));
        return item && item.entry ? item : null;
    } catch {
        return null;
    }
}

/**
 * @param {DnDProps} props  reactive props: `canWrite`
 * @param {DnDOptions} [options]  `selectedFiles`: the other items that move with a drag;
 *   `onOsDrop`: OS files dropped on an item
 */
export function useItemDragDrop(props, { selectedFiles = () => [], onOsDrop } = {}) {
    /** { upload(files, path), move(source, dest) } from the dataset page */
    const datasetDrop = inject('datasetDrop', null);
    // Folder hovered as a drop target (`:class="{ 'drop-target': dropTargetPath === f.entry.path }"`)
    const dropTargetPath = ref(null);
    // Per-target enter counter: crossing into a nested child fires a dragleave on the parent
    /** @type {Record<string, number>} */
    let enterCounts = Object.create(null);

    const resetTarget = () => {
        dropTargetPath.value = null;
        enterCounts = Object.create(null);
    };

    /** `@dragstart="startDrag($event, file)"` @param {DragEvent} evt @param {any} item */
    function startDrag(evt, item) {
        if (!props.canWrite) { evt.preventDefault(); return; }
        startInternalDrag(evt, item);
    }

    /** Accepts internal drags on any item; highlights folders only. @param {DragEvent} evt @param {any} item */
    function itemDragEnter(evt, item) {
        if (!props.canWrite || !isInternalDrag(evt) || !item || !item.entry) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (!ddb.entry.isDirectory(item.entry)) return;
        const key = item.entry.path;
        enterCounts[key] = (enterCounts[key] || 0) + 1;
        dropTargetPath.value = key;
    }

    /** Required for the browser to accept the drop. @param {DragEvent} evt @param {any} item */
    function itemDragOver(evt, item) {
        if (!props.canWrite || !isInternalDrag(evt) || !item || !item.entry) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (ddb.entry.isDirectory(item.entry) && dropTargetPath.value !== item.entry.path) {
            dropTargetPath.value = item.entry.path;
        }
    }

    /** Clears the highlight when the pointer really leaves the target. @param {DragEvent} evt @param {any} item */
    function itemDragLeave(evt, item) {
        if (!item || !item.entry) return;
        const key = item.entry.path;
        if (enterCounts[key]) {
            enterCounts[key]--;
            if (enterCounts[key] > 0) return;
            delete enterCounts[key];
        }
        if (dropTargetPath.value === key) dropTargetPath.value = null;
    }

    /**
     * `@drop="onDrop($event, file)"`: OS files go to `onOsDrop`; an internal drag moves the
     * dragged item (and the other selected items) onto `destItem`.
     * @param {DragEvent & { _ddbHandled?: boolean }} evt @param {any} destItem
     */
    function onDrop(evt, destItem) {
        resetTarget();
        if (!isInternalDrag(evt)) {
            onOsDrop?.(evt);
            return;
        }
        // Handled here: a container around this item (TreeView) only resets its overlay
        evt._ddbHandled = true;
        if (!props.canWrite) return;
        const source = draggedItem(evt);
        if (source) requestMove(datasetDrop, source, destItem, selectedFiles() || []);
    }

    return { datasetDrop, dropTargetPath, startDrag, itemDragEnter, itemDragOver, itemDragLeave, onDrop, resetTarget };
}

/**
 * Item handlers plus the view's background drop area.
 * @param {DnDProps} props  reactive props: `canWrite`, `currentPath`
 * @param {DnDOptions} [options]
 */
export function useDragDrop(props, options = {}) {
    const dropping = ref(false);
    let enterCount = 0;

    /** Background drop: internal drags move into, OS files upload to, the folder on screen. @param {DragEvent & { _ddbHandled?: boolean }} ev */
    async function explorerDropHandler(ev) {
        enterCount = 0;
        dropping.value = false;
        // Already handled by an item inside this view: only the overlay needed resetting
        if (ev._ddbHandled) return;

        ev.preventDefault();
        item.resetTarget();
        if (!props.canWrite) return;

        if (isInternalDrag(ev)) {
            const source = draggedItem(ev);
            if (source) requestMove(item.datasetDrop, source, syntheticFolderItem(props.currentPath), options.selectedFiles?.() || []);
            return;
        }
        const files = await getFilesFromDrop(ev);
        if (files.length > 0 && item.datasetDrop) item.datasetDrop.upload(files, props.currentPath);
    }

    const item = useItemDragDrop(props, { ...options, onOsDrop: options.onOsDrop || explorerDropHandler });
    const baseOnDrop = item.onDrop;

    return {
        ...item,
        dropping,
        /** @param {DragEvent} evt @param {any} destItem */
        onDrop(evt, destItem) {
            // A drop on an item also ends the view's overlay
            enterCount = 0;
            dropping.value = false;
            baseOnDrop(evt, destItem);
        },
        explorerDragEnter() {
            if (!props.canWrite) return;
            enterCount++;
            dropping.value = true;
        },
        explorerDragLeave() {
            enterCount--;
            if (enterCount <= 0) {
                enterCount = 0;
                dropping.value = false;
            }
        },
        explorerDropHandler
    };
}

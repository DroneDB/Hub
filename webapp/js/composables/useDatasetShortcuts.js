/**
 * useDatasetShortcuts - the dataset page's keyboard and paste handling. A key runs the action of the
 * registry (libs/dataset/explorerActions.js) whose accelerator it is, with the rules of the menu
 * that shows that accelerator: Delete removes the selection (never the dataset itself), Ctrl/Cmd+C
 * and +X copy and cut it, F2 renames the one item selected, Ctrl/Cmd+A selects every file (only
 * from the page or the file list, so the text of a panel can still be selected). Ctrl/Cmd+V is the paste event: an OS paste uploads files, imports a URL,
 * or pastes the Hub clipboard, in that order.
 * Keys typed in the tree go to the tree; nothing happens while typing, with a dialog open, or
 * in an element marked data-no-file-shortcuts.
 */
import { getFilesFromClipboard, isHttpUrl } from '@/libs/dragDropUtils';
import { useEventListener } from '@/composables/useEventListener';
import { runShortcut } from '@/libs/dataset/explorerActions';

const isTyping = t => t instanceof Element && (t.closest('input, textarea') || t.isContentEditable);
// The file list: the grid (a listbox) or the table (a grid) holds the focus of its items
const inFileList = t => t instanceof Element && !!t.closest('[data-file-list]');
// Keys typed in a list of things that are not files (the saved views) are not file shortcuts
const notForFiles = t => t instanceof Element && !!t.closest('[data-no-file-shortcuts]');

/**
 * @param {object} ctx
 * @param {() => boolean} ctx.blocked      a dialog is open
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {() => any[]} ctx.selected      the explorer selection
 * @param {() => any[]} [ctx.files]        the items on show (Select all)
 * @param {(on: boolean) => void} [ctx.selectAll]  selects all items, or none
 * @param {(target: Element) => any} ctx.treeFor   the FileBrowser whose tree holds target, or null
 * @param {{ remove: Function, upload: Function, importFromUrl: Function, rename?: Function }} ctx.actions
 * @param {{ copy: Function, cut: Function, paste: Function }} ctx.clipboard
 */
export function useDatasetShortcuts({ blocked, canWrite, selected, files, selectAll, treeFor, actions, clipboard }) {
    // The registry's actions run through the page's handlers of their events
    const handlers = {
        copySelectedItems: () => clipboard.copy(),
        cutSelectedItems: () => clipboard.cut(),
        deleteSelecteditems: () => actions.remove(selected()),
        moveSelectedItems: () => selected().length === 1 && actions.rename?.(selected()[0])
    };
    const context = {
        getSelectedEntries: selected,
        get canWrite() { return canWrite.value; },
        getFiles: files,
        selectAll,
        emit: event => handlers[event]?.()
    };

    useEventListener(document, 'keydown', e => {
        if (isTyping(e.target) || notForFiles(e.target) || blocked()) return;
        // The tree acts on its own selection
        const tree = treeFor(e.target);
        if (tree) {
            tree.handleTreeKeyDown(e);
            return;
        }
        // Select all is for the file list: from the page or from inside the list, not from a panel
        const selectsAll = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'a';
        if (selectsAll && !(e.target === document.body || inFileList(e.target))) return;
        // Ctrl+A is the list's even when every file is selected: never the page text
        if (!runShortcut(e, context) && selectsAll) e.preventDefault();
    });

    useEventListener(document, 'paste', e => {
        if (isTyping(e.target) || blocked() || !canWrite.value) return;
        const files = getFilesFromClipboard(e);
        if (files.length) {
            e.preventDefault();
            actions.upload(files);
            return;
        }
        const text = e.clipboardData && (e.clipboardData.getData('text/plain') || e.clipboardData.getData('text'));
        if (isHttpUrl(text)) {
            e.preventDefault();
            actions.importFromUrl(text.trim());
            return;
        }
        clipboard.paste();
    });
}

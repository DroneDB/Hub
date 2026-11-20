/**
 * Unit tests for the dataset tree behaviour:
 * - selecting a folder loads its children without expanding it
 * - a file (or several nodes) picked in the tree is the selection of the file list
 * - a right click selects the node under the pointer, and keeps a selection that holds it
 * - copy/cut/delete act on the tree selection (context menu and keyboard)
 * - clipboard sources record the selected items' own parent folder
 * - paste conflicts are detected against the destination listing
 * - deleted nodes leave the tree selection
 * - a folder to open that the tree does not have (a search) opens the nearest folder above it
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { isPathRemoved, liveSelectionEntries, selectionBasePath, nearestKnownChain } from './treeSelection';
import { setActivePinia, createPinia } from 'pinia';
import { useClipboardStore } from '@/stores/clipboard';
import { ref, computed } from 'vue';
import { useDatasetClipboard } from '@/composables/useDatasetClipboard';
import { notify } from '@/libs/notify';
import ddb from 'ddb';

const FILE = ddb.entry.type.GENERIC;
const DIR = ddb.entry.type.DIRECTORY;

function nodeData(path, type = FILE) {
    return { path: `ddb://host/org/ds/${path}`, label: path.split('/').pop(), selected: false, entry: { path, type } };
}

// Fake TreeNode component as held in TreeView.selectedNodes.
function treeNode(path, type = FILE, { unmounted = false } = {}) {
    return { node: nodeData(path, type), $: { isUnmounted: unmounted } };
}

let FileBrowser;

beforeAll(async () => {
    // FileBrowser reads the runtime env at import time.
    FileBrowser = (await import('./FileBrowser.vue')).default;
});

function fakeBrowser(selectedNodes, { canWrite = true } = {}) {
    const vm = {
        canWrite,
        $refs: { treeView: { selectedNodes } },
        $emit: vi.fn()
    };
    for (const name of ['getTreeSelectionEntries', 'emitTreeAction', 'handleTreeKeyDown', 'handleSelectionChanged']) {
        vm[name] = (...args) => FileBrowser.methods[name].apply(vm, args);
    }
    return vm;
}

function keyEvent(key, { ctrl = false } = {}) {
    return { key, ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() };
}

describe('treeSelection helpers', () => {
    it('isPathRemoved matches the deleted paths and their descendants only', () => {
        expect(isPathRemoved('a/b', ['a/b'])).toBe(true);
        expect(isPathRemoved('a/b/c.jpg', ['a/b'])).toBe(true);
        expect(isPathRemoved('a/bc', ['a/b'])).toBe(false);
        expect(isPathRemoved('a', ['a/b'])).toBe(false);
        expect(isPathRemoved(null, ['a'])).toBe(false);
    });

    it('liveSelectionEntries skips unmounted nodes', () => {
        const live = treeNode('a.jpg');
        const gone = treeNode('b.jpg', FILE, { unmounted: true });
        expect(liveSelectionEntries([live, gone])).toEqual([live.node]);
        expect(liveSelectionEntries(null)).toEqual([]);
    });

    it('selectionBasePath is the parent of the first entry, "" at the root', () => {
        expect(selectionBasePath([nodeData('a/b/folder', DIR)])).toBe('a/b');
        expect(selectionBasePath([nodeData('top.jpg')])).toBe('');
        expect(selectionBasePath([])).toBe('');
    });
});

describe('FileBrowser.handleSelectionChanged', () => {
    it('loads the children of an unloaded folder without expanding it', async () => {
        const children = [nodeData('folder/a.jpg')];
        const folder = {
            node: nodeData('folder', DIR),
            isExpandable: true,
            expanded: false,
            loadedChildren: false,
            children: [],
            loadChildren: vi.fn(async function () { folder.children = children; folder.loadedChildren = true; }),
            expand: vi.fn()
        };
        const vm = fakeBrowser([]);

        await vm.handleSelectionChanged([folder]);

        expect(folder.loadChildren).toHaveBeenCalledOnce();
        expect(folder.expand).not.toHaveBeenCalled();
        expect(folder.expanded).toBe(false);
        expect(vm.$emit).toHaveBeenCalledWith('currentUriChanged', folder.node.path);
        expect(vm.$emit).toHaveBeenCalledWith('selectionChanged', children);
    });

    it('gives a file picked in the tree as the selection of the list, in the folder that holds it', async () => {
        const file = treeNode('folder/a.jpg');
        const vm = fakeBrowser([file]);

        await vm.handleSelectionChanged([file]);

        expect(vm.$emit.mock.calls).toEqual([
            ['currentUriChanged', 'ddb://host/org/ds/folder'],
            ['selectionChanged', [file.node], { selected: true }]
        ]);
    });

    it('gives several picked nodes as the selection of the list, a folder among them as an item', async () => {
        const file = treeNode('folder/a.jpg');
        const folder = { ...treeNode('folder/sub', DIR), isExpandable: true, loadChildren: vi.fn() };
        const vm = fakeBrowser([file, folder]);

        await vm.handleSelectionChanged([file, folder]);

        expect(folder.loadChildren).not.toHaveBeenCalled();
        expect(vm.$emit).toHaveBeenCalledWith('selectionChanged', [file.node, folder.node], { selected: true });
    });
});

describe('TreeView.handleSelection', () => {
    let TreeView, Mouse;
    beforeAll(async () => {
        TreeView = (await import('./TreeView.vue')).default;
        Mouse = (await import('@/libs/mouse')).default;
    });

    // The tree as its click handler sees it: the selected node components and what it emits
    function fakeTree(selectedNodes) {
        const vm = { selectedNodes, rangeStartNode: selectedNodes[0] ?? null, focusedNode: null, $refs: {}, $emit: vi.fn() };
        vm.handleSelection = (node, button) => TreeView.methods.handleSelection.call(vm, node, button);
        return vm;
    }
    const component = path => ({ ...treeNode(path), selected: false });
    const select = nodes => nodes.map(n => Object.assign(n, { selected: true }));

    it('a right click on a node that is not selected selects it alone, as a click does', async () => {
        const [a, b, other] = [component('f/a.jpg'), component('f/b.jpg'), component('f/c.jpg')];
        const vm = fakeTree(select([a, b]));

        await vm.handleSelection(other, Mouse.RIGHT);

        expect(vm.selectedNodes).toEqual([other]);
        expect([a.selected, b.selected, other.selected]).toEqual([false, false, true]);
        expect(vm.focusedNode).toBe(other);
        expect(vm.$emit).toHaveBeenCalledWith('selectionChanged', [other], 'f');
    });

    it('a right click on a selected node keeps the selection (the menu acts on all of it) and announces it again', async () => {
        const [a, b] = [component('f/a.jpg'), component('f/b.jpg')];
        const vm = fakeTree(select([a, b]));

        await vm.handleSelection(b, Mouse.RIGHT);

        expect(vm.selectedNodes).toEqual([a, b]);
        expect([a.selected, b.selected]).toEqual([true, true]);
        // The page shows the selection of the tree again: the list may show something else by now
        expect(vm.$emit).toHaveBeenCalledExactlyOnceWith('selectionChanged', [a, b], 'f');
    });

    it('a right click on the one selected node keeps it selected and announces it again', async () => {
        const a = component('f/a.jpg');
        const vm = fakeTree(select([a]));

        await vm.handleSelection(a, Mouse.RIGHT);

        expect(vm.selectedNodes).toEqual([a]);
        expect(a.selected).toBe(true);
        expect(vm.$emit).toHaveBeenCalledExactlyOnceWith('selectionChanged', [a], 'f');
    });

    it('a right click with nothing selected selects the node', async () => {
        const a = component('f/a.jpg');
        const vm = fakeTree([]);

        await vm.handleSelection(a, Mouse.RIGHT);

        expect(vm.selectedNodes).toEqual([a]);
        expect(a.selected).toBe(true);
    });
});

describe('FileBrowser.emitTreeAction', () => {
    it('emits copy/cut with the whole tree selection', () => {
        const a = treeNode('f/a.jpg');
        const b = treeNode('f/b.jpg');
        const vm = fakeBrowser([a, b]);

        vm.emitTreeAction('copySelectedItems');
        vm.emitTreeAction('cutSelectedItems');

        expect(vm.$emit).toHaveBeenNthCalledWith(1, 'copySelectedItems', [a.node, b.node]);
        expect(vm.$emit).toHaveBeenNthCalledWith(2, 'cutSelectedItems', [a.node, b.node]);
        expect(vm.$emit).not.toHaveBeenCalledWith('selectionChanged', expect.anything());
    });

    it('emits the other actions as they are and leaves the file list alone: the page runs them on the tree selection', () => {
        const folder = treeNode('f', DIR);
        const vm = fakeBrowser([folder]);

        for (const event of ['deleteSelecteditems', 'moveSelectedItems', 'openProperties', 'transferSelectedItems']) vm.emitTreeAction(event);
        vm.emitTreeAction('setAsCover', folder.node);

        expect(vm.$emit.mock.calls).toEqual([
            ['deleteSelecteditems'], ['moveSelectedItems'], ['openProperties'], ['transferSelectedItems'], ['setAsCover', folder.node]
        ]);
    });
});

describe('FileBrowser.handleTreeKeyDown', () => {
    it('Ctrl+C copies and Ctrl+X cuts the tree selection', () => {
        const a = treeNode('f/a.jpg');
        const vm = fakeBrowser([a]);
        const copy = keyEvent('c', { ctrl: true });
        const cut = keyEvent('X', { ctrl: true });

        vm.handleTreeKeyDown(copy);
        vm.handleTreeKeyDown(cut);

        expect(copy.preventDefault).toHaveBeenCalled();
        expect(cut.preventDefault).toHaveBeenCalled();
        expect(vm.$emit).toHaveBeenCalledWith('copySelectedItems', [a.node]);
        expect(vm.$emit).toHaveBeenCalledWith('cutSelectedItems', [a.node]);
    });

    it('does not cut or delete without write access', () => {
        const vm = fakeBrowser([treeNode('f/a.jpg')], { canWrite: false });

        vm.handleTreeKeyDown(keyEvent('x', { ctrl: true }));
        vm.handleTreeKeyDown(keyEvent('Delete'));

        expect(vm.$emit).not.toHaveBeenCalled();
    });

    it('Delete opens the delete flow, but never for the dataset root', () => {
        const vm = fakeBrowser([treeNode('f/a.jpg')]);
        vm.handleTreeKeyDown(keyEvent('Delete'));
        expect(vm.$emit).toHaveBeenCalledWith('deleteSelecteditems');

        const rootVm = fakeBrowser([treeNode('', ddb.entry.type.DRONEDB)]);
        rootVm.handleTreeKeyDown(keyEvent('Delete'));
        expect(rootVm.$emit).not.toHaveBeenCalled();
    });

    it('does nothing with an empty tree selection', () => {
        const vm = fakeBrowser([]);
        const e = keyEvent('c', { ctrl: true });
        vm.handleTreeKeyDown(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(vm.$emit).not.toHaveBeenCalled();
    });
});

// A dataset page for the clipboard: its folder on show, its files and selection
function fakePage({ currentPath = 'other', files = [], list = vi.fn(async () => []) } = {}) {
    const filesRef = ref(files);
    const listing = { currentPath: ref(currentPath), files: filesRef, selected: computed(() => filesRef.value.filter(f => f.selected)) };
    const dataset = { org: 'org', ds: 'ds', list };
    const dialogs = { open: vi.fn(() => Object.assign(Promise.resolve(), { close: vi.fn() })) };
    const showError = vi.fn();
    const clip = useDatasetClipboard({ dataset, listing, dialogs, busy: ref(false), canWrite: ref(true), showError });
    return { clip, dataset, dialogs, showError };
}

describe('clipboard copy/cut from the tree', () => {
    let clipboard;
    beforeEach(() => {
        sessionStorage.clear(); // the store restores the last clipboard of the tab
        setActivePinia(createPinia());
        clipboard = useClipboardStore();
        for (const k of ['success', 'info', 'warn']) vi.spyOn(notify, k).mockImplementation(() => {});
    });

    it('records a selected folder with its parent as the source folder', () => {
        // Selecting a folder in the tree sets currentPath to the folder itself.
        const { clip } = fakePage({ currentPath: 'a/folder' });
        clip.copy([nodeData('a/folder', DIR)]);
        expect(clipboard.mode).toBe('copy');
        expect(clipboard.source).toEqual({ orgSlug: 'org', dsSlug: 'ds', basePath: 'a' });
        expect(clipboard.items.map(i => i.path)).toEqual(['a/folder']);
    });

    it('cuts explicit items and skips the dataset root', () => {
        const { clip } = fakePage();
        clip.cut([nodeData('', ddb.entry.type.DRONEDB), nodeData('top.jpg')]);
        expect(clipboard.mode).toBe('cut');
        expect(clipboard.source.basePath).toBe('');
        expect(clipboard.items.map(i => i.path)).toEqual(['top.jpg']);
    });

    it('still uses the explorer selection and current folder without arguments', () => {
        const file = { ...nodeData('other/x.jpg'), selected: true };
        const { clip } = fakePage({ currentPath: 'other', files: [file] });
        clip.copy();
        expect(clipboard.source.basePath).toBe('other');
        expect(clipboard.items.map(i => i.path)).toEqual(['other/x.jpg']);
    });

    it('warns when the explicit selection is empty', () => {
        const { clip } = fakePage();
        clip.copy([]);
        expect(clipboard.mode).toBe(null);
        expect(notify.info).toHaveBeenCalledWith('No items selected', { summary: 'Copy' });
    });
});

describe('paste conflict detection', () => {
    let clipboard;
    beforeEach(() => {
        sessionStorage.clear();
        setActivePinia(createPinia());
        clipboard = useClipboardStore();
        for (const k of ['success', 'info', 'warn']) vi.spyOn(notify, k).mockImplementation(() => {});
    });

    // The conflict dialog answers "cancel": the paste stops there
    const cancelConflicts = dialogs => dialogs.open.mockImplementation((component, props) => {
        queueMicrotask(() => props.onResolve('cancel'));
        return Object.assign(Promise.resolve(), { close: vi.fn() });
    });

    it('asks about conflicts that are not in the loaded file list', async () => {
        clipboard.copy({ orgSlug: 'org', dsSlug: 'ds', basePath: 'src' }, [nodeData('src/a.jpg')]);
        // A file selected in the tree leaves only that file in the list
        const { clip, dataset, dialogs } = fakePage({
            currentPath: 'dest',
            list: vi.fn(async () => [{ path: 'dest/a.jpg' }, { path: 'dest/b.jpg' }]),
            files: [nodeData('dest/b.jpg')]
        });
        cancelConflicts(dialogs);
        await clip.paste();
        expect(dataset.list).toHaveBeenCalledWith('dest');
        expect(dialogs.open).toHaveBeenCalledOnce();
        expect(dialogs.open.mock.calls[0][1].items.map(i => i.path)).toEqual(['src/a.jpg']);
    });

    it('lists the dataset root for a root destination', async () => {
        clipboard.copy({ orgSlug: 'org', dsSlug: 'ds', basePath: 'src' }, [nodeData('src/a.jpg')]);
        const { clip, dataset, dialogs } = fakePage({ currentPath: null, list: vi.fn(async () => [{ path: 'a.jpg' }]) });
        cancelConflicts(dialogs);
        await clip.paste();
        expect(dataset.list).toHaveBeenCalledWith(undefined);
        expect(dialogs.open).toHaveBeenCalledOnce();
    });

    it('falls back to the loaded files of the destination when listing fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        clipboard.copy({ orgSlug: 'org', dsSlug: 'ds', basePath: 'src' }, [nodeData('src/a.jpg'), nodeData('src/b.jpg')]);
        const { clip, dialogs } = fakePage({
            currentPath: 'dest',
            list: vi.fn(async () => { throw new Error('offline'); }),
            files: [nodeData('dest/a.jpg'), nodeData('elsewhere/b.jpg')]
        });
        cancelConflicts(dialogs);
        await clip.paste();
        expect(dialogs.open.mock.calls[0][1].items.map(i => i.path)).toEqual(['src/a.jpg']);
        warn.mockRestore();
    });
});

describe('a folder to open that the tree does not have', () => {
    const has = (...paths) => path => paths.includes(path);

    it('nearestKnownChain keeps the chain of a folder that the tree has', () => {
        expect(nearestKnownChain(['a', 'a/b'], has('a', 'a/b'))).toEqual(['a', 'a/b']);
        expect(nearestKnownChain(['', '/'], has('/'))).toEqual(['', '/']);
        // The folders above it need no node of their own (a search result nested in folders it did not find)
        expect(nearestKnownChain(['a', 'a/b'], has('a/b'))).toEqual(['a', 'a/b']);
    });

    it('nearestKnownChain stops at the nearest folder above it that the tree has', () => {
        expect(nearestKnownChain(['a', 'a/b', 'a/b/c'], has('a'))).toEqual(['a']);
        expect(nearestKnownChain(['a', 'a/b', 'a/b/c'], has('a', 'a/b'))).toEqual(['a', 'a/b']);
    });

    it('nearestKnownChain is the chain of the root when the tree has none of the folders', () => {
        expect(nearestKnownChain(['a', 'a/b'], has('/'))).toEqual(['', '/']);
        expect(nearestKnownChain([], has('/'))).toEqual(['', '/']);
    });

    it('TreeView opens the root when a search does not list the folder to open, and the folder itself when it does', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const TreeView = (await import('./TreeView.vue')).default;
        const TreeNode = (await import('./TreeNode.vue')).default;
        const vm = {};
        TreeView.created.call(vm);
        TreeView.mounted.call(vm);
        // Real nodes, as far as the event goes: what they are at, and what they do with a chain
        const node = (path, { root = false } = {}) => {
            const n = { node: { root, entry: { path, type: DIR } }, expand: vi.fn(async () => {}), $emit: vi.fn() };
            n.isAt = p => TreeNode.methods.isAt.call(n, p);
            n.openFromTree = chain => TreeNode.methods.openFromTree.call(n, chain);
            return n;
        };
        // A search for "sub": the root of the tree and the folder it found
        const root = node('', { root: true });
        const found = node('out/sub');
        [root, found].forEach(n => vm._nodes.add(n));
        const opened = n => n.$emit.mock.calls.filter(c => c[0] === 'opened').length;

        // "out" is not in the tree: the root (the results) opens
        emitter.emit('folderOpened', ['out']);
        await Promise.resolve();
        expect([opened(root), opened(found)]).toEqual([1, 0]);

        // The folder it found opens as itself
        emitter.emit('folderOpened', ['out', 'out/sub']);
        await Promise.resolve();
        expect([opened(root), opened(found)]).toEqual([1, 1]);
        expect(found.$emit).toHaveBeenCalledWith('opened', found, 'explorer');
        TreeView.beforeUnmount.call(vm);
    });
});

describe('selection cleanup on deleteEntries', () => {
    it('TreeView drops deleted nodes and their descendants', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const TreeView = (await import('./TreeView.vue')).default;
        const kept = treeNode('keep.jpg');
        const inside = treeNode('gone/a.jpg');
        const vm = {};
        TreeView.created.call(vm);
        TreeView.mounted.call(vm);
        vm.selectedNodes = [kept, inside];
        vm.rangeStartNode = inside;
        vm.focusedNode = kept;

        emitter.emit('deleteEntries', ['gone']);

        expect(vm.selectedNodes).toEqual([kept]);
        expect(vm.rangeStartNode).toBe(null);
        expect(vm.focusedNode).toBe(kept);
        TreeView.beforeUnmount.call(vm);
    });

    it('TreeView forwards file-system events to its nodes and moves the other selected nodes', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const TreeView = (await import('./TreeView.vue')).default;
        const vm = { datasetDrop: { move: vi.fn() } };
        TreeView.created.call(vm);
        TreeView.mounted.call(vm);
        vm.moveSelected = (dest, primary) => TreeView.methods.moveSelected.call(vm, dest, primary);
        const node = path => ({ selected: false, node: { entry: { path } }, removeChildren: vi.fn(), addItems: vi.fn(), openFromTree: vi.fn(), isAt: p => p === path });
        const a = node('a.jpg'), b = node('b.jpg'), c = node('f');
        [a, b, c].forEach(n => vm._nodes.add(n));

        const items = [{ entry: { path: 'x.jpg' } }];
        emitter.emit('addItems', items);
        emitter.emit('folderOpened', ['/', 'f']);
        emitter.emit('deleteEntries', ['gone']);
        for (const n of [a, b, c]) {
            expect(n.addItems).toHaveBeenCalledWith(items);
            expect(n.openFromTree).toHaveBeenCalledWith(['/', 'f']);
            expect(n.removeChildren).toHaveBeenCalledWith(['gone']);
        }

        a.selected = b.selected = true;
        const dest = { entry: { path: 'dest' } };
        vm.moveSelected(dest, 'a.jpg');
        expect(vm.datasetDrop.move).toHaveBeenCalledTimes(1);
        expect(vm.datasetDrop.move).toHaveBeenCalledWith(b.node, dest);
        expect(a.selected || b.selected).toBe(false);
        TreeView.beforeUnmount.call(vm);
    });

    it('TreeView moves no other node when the dragged node is not one of the selected', async () => {
        const TreeView = (await import('./TreeView.vue')).default;
        const vm = { datasetDrop: { move: vi.fn() } };
        TreeView.created.call(vm);
        TreeView.mounted.call(vm);
        const node = (path, selected) => ({ selected, node: { entry: { path } }, removeChildren: vi.fn(), addItems: vi.fn(), openFromTree: vi.fn() });
        const a = node('a.jpg', false), b = node('b.jpg', true), c = node('c.jpg', true);
        [a, b, c].forEach(n => vm._nodes.add(n));

        // a.jpg was moved by its own drop handler: b.jpg and c.jpg stay, and stay selected
        TreeView.methods.moveSelected.call(vm, { entry: { path: 'dest' } }, 'a.jpg');
        expect(vm.datasetDrop.move).not.toHaveBeenCalled();
        expect(b.selected && c.selected).toBe(true);
        TreeView.beforeUnmount.call(vm);
    });

    describe('a drag from one tree node dropped on another', () => {
        // Real TreeNodes registered with the real TreeView.moveSelected; dataTransfer is shared
        // by the dragstart and the drop, as in a browser
        async function mountTree() {
            const { mount } = await import('@vue/test-utils');
            const TreeView = (await import('./TreeView.vue')).default;
            const TreeNode = (await import('./TreeNode.vue')).default;
            const datasetDrop = { move: vi.fn(), upload: vi.fn() };
            const tree = { datasetDrop, _nodes: new Set() };
            const treeRegistry = {
                add: n => tree._nodes.add(n), remove: n => tree._nodes.delete(n),
                moveSelected: (dest, primary) => TreeView.methods.moveSelected.call(tree, dest, primary)
            };
            const mountNode = (path, type = FILE) => mount(TreeNode, {
                props: { node: nodeData(path, type), getChildren: async () => [], canWrite: true },
                global: { provide: { treeRegistry, datasetDrop } }
            });
            const nodes = { a: mountNode('a.jpg'), b: mountNode('b.jpg'), dest: mountNode('dest', DIR) };
            const store = {};
            const evt = {
                preventDefault: vi.fn(), stopPropagation: vi.fn(),
                dataTransfer: { setData: (k, v) => { store[k] = v; }, getData: k => store[k] || '', types: ['item'] }
            };
            const drag = (from, to) => {
                from.vm.onDragStart(evt, from.props('node'));
                to.vm.onItemDrop(evt, to.props('node'));
            };
            return { nodes, datasetDrop, drag };
        }

        it('moves only the dragged node when it is not selected, and keeps the selection', async () => {
            const { nodes, datasetDrop, drag } = await mountTree();
            nodes.b.vm.selected = true;
            drag(nodes.a, nodes.dest);
            expect(datasetDrop.move).toHaveBeenCalledTimes(1);
            expect(datasetDrop.move.mock.calls[0][0].entry.path).toBe('a.jpg');
            expect(datasetDrop.move.mock.calls[0][1].entry.path).toBe('dest');
            expect(nodes.a.vm.selected).toBe(false);
            expect(nodes.b.vm.selected).toBe(true);
        });

        it('moves the whole selection when the dragged node is one of the selected', async () => {
            const { nodes, datasetDrop, drag } = await mountTree();
            nodes.a.vm.selected = nodes.b.vm.selected = true;
            drag(nodes.a, nodes.dest);
            expect(datasetDrop.move.mock.calls.map(c => c[0].entry.path)).toEqual(['a.jpg', 'b.jpg']);
            expect(nodes.a.vm.selected || nodes.b.vm.selected).toBe(false);
        });
    });

    it('FileBrowser forgets a deleted lastSelectedNode', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const vm = { lastSelectedNode: treeNode('gone.jpg'), refreshNodes: vi.fn() };
        await FileBrowser.mounted.call(vm);

        emitter.emit('deleteEntries', ['other.jpg']);
        expect(vm.lastSelectedNode).not.toBe(null);
        emitter.emit('deleteEntries', ['gone.jpg']);
        expect(vm.lastSelectedNode).toBe(null);
        FileBrowser.beforeUnmount.call(vm);
    });
});

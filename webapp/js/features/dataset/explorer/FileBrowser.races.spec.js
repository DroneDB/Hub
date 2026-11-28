/**
 * The tree answers late and out of order: two refreshes in a row list the dataset root once, and of two folders
 * clicked the list follows the one clicked last, whichever answers first.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const ROOT = 'ddb://hub.test/org/ds';

let FileBrowser;
beforeAll(async () => {
    FileBrowser = (await import('./FileBrowser.vue')).default;
});

const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};

function mountBrowser(rootNodes) {
    return mount(FileBrowser, {
        props: { rootNodes },
        global: { plugins: [PrimeVue], stubs: { TreeView: true, SavedViews: true, ContextMenu: true, LoadingSpinner: true } }
    });
}

describe('FileBrowser refreshNodes', () => {
    it('lists the dataset root once when two refreshes overlap, whichever ends first', async () => {
        const root = [{ path: ROOT, label: 'ds', entry: { path: '', type: ddb.entry.type.DRONEDB } }];
        const first = deferred();
        const second = deferred();
        const rootNodes = vi.fn()
            .mockResolvedValueOnce(root)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const w = mountBrowser(rootNodes);
        await flushPromises();

        const a = w.vm.refreshNodes();
        const b = w.vm.refreshNodes();
        second.resolve(root);
        await b;
        first.resolve(root);
        await a;

        expect(w.vm.nodes.filter(n => n.root)).toHaveLength(1);
        expect(w.vm.loading).toBe(false);
        w.unmount();
    });

    it('does not clear the loading state for a refresh that a newer one replaced', async () => {
        const root = [{ path: ROOT, label: 'ds', entry: { path: '', type: ddb.entry.type.DRONEDB } }];
        const first = deferred();
        const second = deferred();
        const rootNodes = vi.fn()
            .mockResolvedValueOnce(root)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const w = mountBrowser(rootNodes);
        await flushPromises();

        const a = w.vm.refreshNodes();
        const b = w.vm.refreshNodes();
        first.resolve(root);
        await a;
        expect(w.vm.loading).toBe(true);
        expect(w.vm.nodes).toEqual([]);
        second.resolve(root);
        await b;
        expect(w.vm.nodes).toHaveLength(1);
        w.unmount();
    });
});

describe('FileBrowser handleSelectionChanged', () => {
    const folder = (path, load) => ({
        isExpandable: true, expanded: false, loadedChildren: false, loadChildren: () => load.promise,
        node: { path }, children: [{ node: { path: path + '/child' } }]
    });

    it('follows the folder clicked last when an earlier folder answers after it', async () => {
        const w = mountBrowser(async () => []);
        await flushPromises();
        const slow = deferred();
        const quick = deferred();

        const a = w.vm.handleSelectionChanged([folder('slow', slow)]);
        const b = w.vm.handleSelectionChanged([folder('quick', quick)]);
        quick.resolve();
        await b;
        slow.resolve();
        await a;

        expect(w.emitted('currentUriChanged').map(args => args[0])).toEqual(['quick']);
        expect(w.emitted('selectionChanged')).toHaveLength(1);
        w.unmount();
    });
});

describe('FileBrowser refreshAndNavigate', () => {
    const root = [{ path: ROOT, label: 'ds', entry: { path: '', type: ddb.entry.type.DRONEDB } }];
    // The tree as refreshAndNavigate walks it: one root node, a folder with nothing to expand
    const TreeNode = defineComponent({
        data: () => ({ isExpandable: false, expanded: false, node: { path: `${ROOT}/target`, entry: { path: 'target' } } }),
        render: () => h('div')
    });
    const TreeView = defineComponent({ render: () => h('div', [h(TreeNode, { ref: 'treeNodes', ref_for: true })]) });
    const mountWithTree = rootNodes => mount(FileBrowser, {
        props: { rootNodes },
        global: { plugins: [PrimeVue], stubs: { TreeView, SavedViews: true, ContextMenu: true, LoadingSpinner: true } }
    });
    const file = path => ({ isExpandable: false, expanded: false, node: { path } });
    const selections = w => (w.emitted('selectionChanged') ?? []).map(args => args[0].map(n => n.path));

    it('leaves the folder that the user clicked while it read the tree', async () => {
        const reading = deferred();
        const rootNodes = vi.fn().mockResolvedValueOnce(root).mockReturnValueOnce(reading.promise);
        const w = mountWithTree(rootNodes);
        await flushPromises();

        const navigation = w.vm.refreshAndNavigate('target');
        await w.vm.handleSelectionChanged([file(`${ROOT}/clicked.jpg`)]);
        reading.resolve(root);
        await navigation;

        expect(selections(w)).toEqual([[`${ROOT}/clicked.jpg`]]);
        w.unmount();
    });

    it('of two that overlap, only the newer one selects, whichever ends last', async () => {
        const older = deferred();
        const newer = deferred();
        const rootNodes = vi.fn().mockResolvedValueOnce(root).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
        const w = mountWithTree(rootNodes);
        await flushPromises();

        const a = w.vm.refreshAndNavigate('target');
        const b = w.vm.refreshAndNavigate('target');
        newer.resolve(root);
        await b;
        older.resolve(root);
        await a;

        expect(selections(w)).toEqual([[`${ROOT}/target`]]);
        w.unmount();
    });
});

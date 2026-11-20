/**
 * The root of the tree shows the name of the dataset (FR-EXP-24): a rename changes the label in place, the tree is not read
 * again, so the folders that are open stay open.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const ROOT = 'ddb://hub.test/org/ds';

let FileBrowser;
beforeAll(async () => {
    FileBrowser = (await import('./FileBrowser.vue')).default;
});

async function mountBrowser() {
    const rootNodes = vi.fn(async () => [{ path: ROOT, label: 'Old Name', entry: { path: '', type: ddb.entry.type.DRONEDB } }]);
    const w = mount(FileBrowser, {
        props: { rootNodes },
        global: { plugins: [PrimeVue], stubs: { TreeView: true, SavedViews: true, ContextMenu: true, LoadingSpinner: true } }
    });
    await flushPromises();
    return { w, rootNodes };
}

describe('FileBrowser setRootLabel', () => {
    it('patches the label of the root node without reading the tree again', async () => {
        const { w, rootNodes } = await mountBrowser();
        expect(w.vm.nodes[0].label).toBe('Old Name');

        w.vm.setRootLabel('New Name');

        expect(w.vm.nodes[0].label).toBe('New Name');
        expect(rootNodes).toHaveBeenCalledTimes(1);
        w.unmount();
    });

    it('keeps the node object (and its expanded state) and ignores an empty label', async () => {
        const { w } = await mountBrowser();
        const node = w.vm.nodes[0];
        node.expanded = true;

        w.vm.setRootLabel('');
        w.vm.setRootLabel('New Name');

        expect(w.vm.nodes[0]).toBe(node);
        expect(node.expanded).toBe(true);
        expect(node.label).toBe('New Name');
        w.unmount();
    });
});

/**
 * The search box of the file tree: Enter searches what is in the box at once (even before the
 * search-as-you-type delay has passed) and the delayed search does not run it a second time;
 * typing still searches by itself, and emptying the box goes back to the tree. The saved views
 * listed under the tree are hidden while a search is shown.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const ROOT = 'ddb://hub.test/org/ds';
const rootNodes = async () => [{ path: ROOT, label: 'ds', entry: { path: '', type: ddb.entry.type.DRONEDB } }];

let FileBrowser;

beforeAll(async () => {
    // FileBrowser reads the runtime env at import time.
    FileBrowser = (await import('./FileBrowser.vue')).default;
});

// Takes the props of the real group without drawing it
const SavedViewsStub = { name: 'SavedViews', props: ['views', 'dataset', 'canWrite'], emits: ['rename', 'delete'], render: () => null };

const mountBrowser = (props = {}) => mount(FileBrowser, {
    props: { rootNodes, ...props },
    global: {
        plugins: [PrimeVue],
        stubs: { TreeView: true, SavedViews: SavedViewsStub, ContextMenu: true, LoadingSpinner: true }
    }
});

const searchBox = (w) => w.find('input[aria-label="Search files"]');

describe('FileBrowser search box', () => {
    let searchEntries;

    beforeEach(() => {
        vi.useFakeTimers();
        searchEntries = vi.spyOn(ddb, 'searchEntries').mockResolvedValue([
            { path: 'flight/IMG_0001.JPG', type: ddb.entry.type.IMAGE }
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('searches what was typed when Enter comes before the typing delay, and only once', async () => {
        const w = mountBrowser();
        await flushPromises();

        await searchBox(w).setValue('IMG');
        await searchBox(w).trigger('keyup', { key: 'Enter' });
        await flushPromises();

        expect(searchBox(w).element.value).toBe('IMG');
        expect(searchEntries).toHaveBeenCalledTimes(1);
        expect(searchEntries).toHaveBeenCalledWith(ROOT, '*IMG*');
        expect(w.vm.searchStaticPaths[ROOT]).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();
        expect(searchEntries).toHaveBeenCalledTimes(1);
        expect(searchBox(w).element.value).toBe('IMG');
        w.unmount();
    });

    it('searches as the user types, and goes back to the tree when the box is emptied', async () => {
        const w = mountBrowser();
        await flushPromises();

        await searchBox(w).setValue('IMG');
        expect(searchEntries).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();
        expect(searchEntries).toHaveBeenCalledTimes(1);
        expect(w.vm.searchStaticPaths).not.toBeNull();

        await searchBox(w).setValue('');
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();
        expect(w.vm.searchStaticPaths).toBeNull();
        expect(searchEntries).toHaveBeenCalledTimes(1);
        w.unmount();
    });

    it('clears the search from the clear button', async () => {
        const w = mountBrowser();
        await flushPromises();

        await searchBox(w).setValue('IMG');
        await searchBox(w).trigger('keyup', { key: 'Enter' });
        await flushPromises();
        await w.find('button[aria-label="Clear search"]').trigger('click');
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();

        expect(searchBox(w).element.value).toBe('');
        expect(w.vm.searchStaticPaths).toBeNull();
        expect(searchEntries).toHaveBeenCalledTimes(1);
        w.unmount();
    });
});

describe('FileBrowser search field (FR-EXP-31, FR-ORG-18)', () => {
    let searchEntries;
    const found = n => Array.from({ length: n }, (_, i) => ({ path: `flight/DJI_${i}.JPG`, type: ddb.entry.type.IMAGE }));

    beforeEach(() => {
        vi.useFakeTimers();
        searchEntries = vi.spyOn(ddb, 'searchEntries').mockResolvedValue(found(18));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    async function searchFor(w, text) {
        await searchBox(w).setValue(text);
        await searchBox(w).trigger('keyup', { key: 'Enter' });
        await flushPromises();
    }

    it('is the shared SearchField, with the one Clear search button', async () => {
        const w = mountBrowser();
        await flushPromises();
        expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(true);
        expect(w.findAll('button[aria-label="Clear search"]')).toHaveLength(0);
        await searchFor(w, 'DJI');
        expect(w.findAll('button[aria-label="Clear search"]')).toHaveLength(1);
        w.unmount();
    });

    it('is emptied by Escape, which goes back to the tree', async () => {
        const w = mountBrowser();
        await flushPromises();
        await searchFor(w, 'DJI');
        expect(w.vm.searchStaticPaths).not.toBeNull();

        await searchBox(w).trigger('keydown', { key: 'Escape' });
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();

        expect(searchBox(w).element.value).toBe('');
        expect(w.vm.searchStaticPaths).toBeNull();
        expect(w.vm.filter).toBeNull();
        expect(searchEntries).toHaveBeenCalledTimes(1);
        w.unmount();
    });

    it('says how many results the search has, and for what', async () => {
        const w = mountBrowser();
        await flushPromises();
        expect(w.find('.search-summary').exists()).toBe(false);
        await searchFor(w, 'DJI');
        expect(w.find('.search-summary').text()).toBe('18 results for \u201CDJI\u201D');
        expect(w.find('.search-summary').attributes('role')).toBe('status');

        searchEntries.mockResolvedValue(found(1));
        await searchFor(w, 'DJI_0');
        expect(w.find('.search-summary').text()).toBe('1 result for \u201CDJI_0\u201D');
        w.unmount();
    });

    it('names the query when nothing was found, and clears it from the empty state', async () => {
        searchEntries.mockResolvedValue([]);
        const w = mountBrowser();
        await flushPromises();
        await searchFor(w, 'nomatchxyz');
        expect(w.find('.search-summary').exists()).toBe(false);
        expect(w.find('.empty-state h3').text()).toBe('No files match "nomatchxyz"');

        await w.find('.empty-state button').trigger('click');
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();
        expect(searchBox(w).element.value).toBe('');
        expect(w.find('.empty-state').exists()).toBe(false);
        expect(w.vm.searchStaticPaths).toBeNull();
        w.unmount();
    });
});

describe('FileBrowser saved views', () => {
    const dataset = { org: 'org', ds: 'ds' };
    const views = [{ uid: 'v_aaaaaaaa', name: 'Alpha' }];
    const group = w => w.findComponent({ name: 'SavedViews' });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(ddb, 'searchEntries').mockResolvedValue([{ path: 'a.jpg', type: ddb.entry.type.IMAGE }]);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('lists the views of the dataset under the tree', async () => {
        const w = mountBrowser({ views, dataset });
        await flushPromises();
        expect(group(w).exists()).toBe(true);
        expect(group(w).props('views')).toEqual(views);
        w.unmount();
    });

    it('has no group without views, or without a dataset to link them to', async () => {
        const none = mountBrowser({ views: [], dataset });
        const noDataset = mountBrowser({ views });
        await flushPromises();
        expect(group(none).exists()).toBe(false);
        expect(group(noDataset).exists()).toBe(false);
        none.unmount();
        noDataset.unmount();
    });

    it('hides the group while a search is shown and brings it back with the tree', async () => {
        const w = mountBrowser({ views, dataset });
        await flushPromises();
        await searchBox(w).setValue('a');
        await searchBox(w).trigger('keyup', { key: 'Enter' });
        await flushPromises();
        expect(w.vm.searchStaticPaths).not.toBeNull();
        expect(group(w).exists()).toBe(false);

        await searchBox(w).setValue('');
        await vi.advanceTimersByTimeAsync(600);
        await flushPromises();
        expect(group(w).exists()).toBe(true);
        w.unmount();
    });

    it('passes the rename and delete of a view on to the page', async () => {
        const w = mountBrowser({ views, dataset, canWrite: true });
        await flushPromises();
        group(w).vm.$emit('rename', views[0]);
        group(w).vm.$emit('delete', views[0]);
        expect(w.emitted('renameView')[0]).toEqual([views[0]]);
        expect(w.emitted('deleteView')[0]).toEqual([views[0]]);
        w.unmount();
    });
});

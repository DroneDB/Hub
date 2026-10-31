/**
 * The search box of the file tree: Enter searches what is in the box at once (even before the
 * search-as-you-type delay has passed) and the delayed search does not run it a second time;
 * typing still searches by itself, and emptying the box goes back to the tree.
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

const mountBrowser = () => mount(FileBrowser, {
    props: { rootNodes },
    global: {
        plugins: [PrimeVue],
        stubs: { TreeView: true, SavedComparisons: true, ContextMenu: true, LoadingSpinner: true }
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

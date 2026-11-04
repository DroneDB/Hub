/**
 * The saved views on the dataset page: read from meta/get/views (not from the dataset info),
 * given to the folder tree and the details panel, read again from the server when the window
 * is focused and after a rename or delete, absent from the page when they cannot be read at
 * first, and kept as they were when a read again fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, h, defineComponent } from 'vue';
import { createPinia } from 'pinia';

const h_ = vi.hoisted(() => ({ dataset: null, actions: null }));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'org', ds: 'ds' } }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset }),
        isLoggedIn: () => true,
        getUsername: () => 'user',
        features: { value: () => null, get: () => false }
    }
}));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve() }
}));
vi.mock('@/composables/useDatasetListing', () => ({
    useDatasetListing: () => ({
        files: ref([]), selected: ref([]), currentPath: ref(null), isLoading: ref(false), addEntry: vi.fn(), removed: vi.fn()
    })
}));
vi.mock('@/composables/useDatasetActions', () => ({ useDatasetActions: () => ({ showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn() }) }));
vi.mock('@/composables/useDatasetClipboard', () => ({ useDatasetClipboard: () => ({}) }));
vi.mock('@/composables/useOpenItem', () => ({ useOpenItem: () => ({ openItem: vi.fn() }) }));
vi.mock('@/composables/useDatasetShortcuts', () => ({ useDatasetShortcuts: vi.fn() }));
vi.mock('@/composables/useBuildEvents', () => ({ useBuildEvents: () => ({ watchBuildEvents: vi.fn(), handleBuildStarted: vi.fn(), handleBuildError: vi.fn() }) }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
vi.mock('@/features/viewers/splat/useSplatDownloads', () => ({ useSplatDownloads: () => ({ download: vi.fn() }) }));
vi.mock('@/composables/useViewActions', () => ({
    useViewActions: opts => {
        h_.actions = { opts, rename: vi.fn(), remove: vi.fn() };
        return h_.actions;
    }
}));
vi.mock('@/features/viewers/map/DatasetMap.vue', () => ({ default: { render: () => null } }));
vi.mock('./TaskHistory.vue', () => ({ default: { render: () => null } }));

const { default: ViewDataset } = await import('./ViewDataset.vue');

const item = (id, uid, name, path = 'ortho.tif') => ({
    id, mtime: 1, data: JSON.stringify({
        v: 1, uid, name, base: { path, hash: '' }, layers: [{ path, hash: '', opacity: 1, visible: true, vizParams: null }],
        split: { on: false, positions: [1] }, view: null, display: { basemap: null }, analysis: { target: null }
    })
});

// The tree and the details panel only record what the page gives them
const FileBrowserStub = defineComponent({
    props: {
        views: { type: Array, default: () => [] },
        canWrite: Boolean,
        dataset: { type: Object, default: null },
        rootNodes: { type: Function, default: null }
    },
    render() { return h('div', { class: 'browser' }, this.views.map(v => v.name).join('|')); }
});
const slotted = { render() { return h('div', [this.$slots.first?.(), this.$slots.second?.()]); } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser: FileBrowserStub, Panel: slotted, TabSwitcher: slotted, Message: nothing, Loader: nothing,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer: nothing, TableView: nothing, DetailPanel: nothing
};

let wrapper;
const mountPage = async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [createPinia()] } });
    await flushPromises();
};
const shown = () => wrapper.findComponent(FileBrowserStub).props('views').map(v => v.name);

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    h_.dataset = {
        info: vi.fn(() => Promise.resolve([])),
        metaGet: vi.fn(() => Promise.resolve([item('1', 'v_bbbbbbbb', 'Beta'), item('2', 'v_aaaaaaaa', 'Alpha')]))
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('ViewDataset saved views', () => {
    it('reads them with meta/get/views and gives the tree the list sorted by name', async () => {
        await mountPage();
        expect(h_.dataset.metaGet).toHaveBeenCalledTimes(1);
        expect(h_.dataset.metaGet.mock.calls[0][0]).toBe('views');
        expect(shown()).toEqual(['Alpha', 'Beta']);
    });

    it('reads the list again from the server, not from the cache, when the window is focused', async () => {
        await mountPage();
        h_.dataset.metaGet.mockResolvedValueOnce([item('3', 'v_cccccccc', 'Gamma')]);
        window.dispatchEvent(new Event('focus'));
        await flushPromises();
        expect(h_.dataset.metaGet).toHaveBeenCalledTimes(2);
        expect(h_.dataset.metaGet.mock.calls[1]).toEqual(['views', '', { cache: false }]);
        expect(shown()).toEqual(['Gamma']);
    });

    it('reads the list again from the server after a rename or a delete', async () => {
        await mountPage();
        h_.dataset.metaGet.mockResolvedValueOnce([item('4', 'v_aaaaaaaa', 'Alpha, renamed')]);
        h_.actions.opts.onChanged();
        await flushPromises();
        expect(h_.dataset.metaGet.mock.calls[1]).toEqual(['views', '', { cache: false }]);
        expect(shown()).toEqual(['Alpha, renamed']);
    });

    it('ends up with the answer of the latest read when an older one is slower', async () => {
        await mountPage();
        let slow;
        h_.dataset.metaGet.mockImplementationOnce(() => new Promise(resolve => { slow = resolve; }));
        h_.dataset.metaGet.mockResolvedValueOnce([item('5', 'v_dddddddd', 'Newest')]);
        window.dispatchEvent(new Event('focus'));
        h_.actions.opts.onChanged();
        await flushPromises();
        slow([item('6', 'v_eeeeeeee', 'Stale')]);
        await flushPromises();
        expect(shown()).toEqual(['Newest']);
    });

    it('has no views when the dataset has none (a 404)', async () => {
        h_.dataset.metaGet.mockRejectedValue(Object.assign(new Error('No metadata found for key views'), { status: 404 }));
        await mountPage();
        expect(shown()).toEqual([]);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('shows no views and logs when the list cannot be read, and the page stays', async () => {
        h_.dataset.metaGet.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
        await mountPage();
        expect(shown()).toEqual([]);
        expect(console.error).toHaveBeenCalledWith('Cannot load the saved views:', expect.any(Error));
        expect(wrapper.find('.browser').exists()).toBe(true);
    });

    it('keeps the last list when a read again (on focus, after a rename or a delete) fails', async () => {
        await mountPage();
        h_.dataset.metaGet.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }));
        window.dispatchEvent(new Event('focus'));
        await flushPromises();
        expect(shown()).toEqual(['Alpha', 'Beta']);
        h_.dataset.metaGet.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
        h_.actions.opts.onChanged();
        await flushPromises();
        expect(shown()).toEqual(['Alpha', 'Beta']);
        expect(console.error).toHaveBeenCalledWith('Cannot load the saved views:', expect.any(Error));
    });

    it('gives the tree the rename and delete of the view actions', async () => {
        await mountPage();
        const browser = wrapper.findComponent(FileBrowserStub);
        browser.vm.$emit('renameView', { uid: 'v_aaaaaaaa' });
        browser.vm.$emit('deleteView', { uid: 'v_aaaaaaaa' });
        expect(h_.actions.rename).toHaveBeenCalledWith({ uid: 'v_aaaaaaaa' });
        expect(h_.actions.remove).toHaveBeenCalledWith({ uid: 'v_aaaaaaaa' });
    });
});

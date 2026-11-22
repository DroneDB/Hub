/**
 * The dataset page and the folder tree: a file (or several nodes) picked in the tree is listed as
 * the selection, which the page header acts on (Download, Share/Embed); a folder of the tree is
 * listed by what it holds, with nothing selected; and the actions of the tree (its context menu,
 * its keys) run on what is selected in the tree, whatever the list shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { h, defineComponent, onMounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, actions: null, treeAttrs: null, treeSelection: [], panelProps: null, dialog: null, open: null, download: null }));

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }), useRoute: () => ({ params: { org: 'acme', ds: 'site' } }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset, datasets: () => Promise.resolve([]) }),
        isLoggedIn: () => true,
        getUsername: () => 'u',
        features: { value: () => null, get: () => false }
    }
}));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { on: vi.fn(), off: vi.fn(), getBusy: () => null }, datasetKey: ds => ds.baseApi }));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve(), on: vi.fn(), off: vi.fn(), onFilesAdded: vi.fn() }
}));
vi.mock('@/composables/useDatasetActions', () => ({ useDatasetActions: () => h_.actions }));
// The question before an archive download opens on the dialog registry; the test answers Download
vi.mock('@/composables/useDialogs', async () => {
    const { shallowRef } = await import('vue');
    return { useDialogs: () => ({ stack: shallowRef([]), open: (...args) => h_.open(...args), close: vi.fn(), isOpen: () => false }) };
});
vi.mock('@/libs/datasetDownloads', async importOriginal => ({ ...(await importOriginal()), downloadFromDataset: (...args) => h_.download(...args) }));
vi.mock('@/composables/useDatasetClipboard', () => ({ useDatasetClipboard: () => ({}) }));
vi.mock('@/composables/useOpenItem', () => ({ useOpenItem: () => ({ openItem: vi.fn() }) }));
vi.mock('@/composables/useDatasetShortcuts', () => ({ useDatasetShortcuts: vi.fn() }));
vi.mock('@/composables/useBuildEvents', () => ({ useBuildEvents: () => ({ watchBuildEvents: vi.fn(), handleBuildStarted: vi.fn(), handleBuildError: vi.fn() }) }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
vi.mock('@/features/viewers/splat/useSplatDownloads', () => ({ useSplatDownloads: () => ({ download: vi.fn() }) }));
vi.mock('@/composables/useViewActions', () => ({ useViewActions: () => ({ rename: vi.fn(), remove: vi.fn() }) }));
vi.mock('@/features/viewers/map/DatasetMap.vue', () => ({ default: { render: () => null } }));
vi.mock('./TaskHistory.vue', () => ({ default: { render: () => null } }));

const { default: ViewDataset } = await import('./ViewDataset.vue');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');

const T = ddb.entry.type;
// A node of the tree, which the list shows as its item (one object for both)
const node = (path, type = T.GENERIC) => ({ label: path.split('/').pop(), path: `ddb://h/acme/site/${path}`, selected: false, entry: { path, type, size: 1 } });
const ROOT = { path: 'ddb://h/acme/site', type: T.DRONEDB, size: 10, properties: { entries: 3, permissions: { canRead: true, canWrite: true } } };

// The tree keeps the events the page binds and answers for its selection; the list and the detail panel keep their props
const FileBrowser = defineComponent({
    inheritAttrs: false,
    props: { rootNodes: { type: Function, default: null } },
    setup(props, { attrs, expose }) {
        h_.treeAttrs = attrs;
        expose({ getTreeSelectionEntries: () => h_.treeSelection, setRootLabel: () => {}, refreshAndNavigate: vi.fn() });
        onMounted(() => props.rootNodes?.());
        return () => h('div', { class: 'browser' });
    }
});
const Explorer = defineComponent({ inheritAttrs: false, props: { files: { type: Array, default: () => [] } }, setup: () => () => h('div', { class: 'explorer-stub' }) });
const DetailPanel = defineComponent({ inheritAttrs: false, setup(_, { attrs }) { h_.panelProps = attrs; return () => h('div', { class: 'panel-stub' }); } });
const slots = { render() { return h('div', [this.$slots.first?.(), this.$slots.second?.(), this.$slots.explorer?.()]); } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser, Panel: slots, TabSwitcher: slots, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, DatasetHeader: nothing, DatasetReadme: nothing,
    Explorer, TableView: Explorer, DetailPanel
};

let wrapper;
async function open() {
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([ROOT])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [createPinia()] } });
    await flushPromises();
}
const listed = () => wrapper.findComponent(Explorer).props('files');
const headerSelection = () => useDatasetSessionStore().selectedFiles;

beforeEach(() => {
    setActivePinia(createPinia());
    window.HubOptions = { appName: 'DroneDB' };
    h_.treeSelection = [];
    h_.actions = {
        showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(),
        remove: vi.fn(), rename: vi.fn(), transfer: vi.fn(), properties: vi.fn()
    };
    h_.dialog = null;
    h_.open = vi.fn((component, props) => {
        h_.dialog = { component, props: typeof props === 'function' ? props : () => props };
        return Promise.resolve('confirm');
    });
    h_.download = vi.fn(() => Promise.resolve());
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('ViewDataset and the selection of the tree', () => {
    it('lists a file picked in the tree as the selection: the header acts on it and the detail panel shows it', async () => {
        await open();
        const file = node('out/model.nxz');
        h_.treeAttrs.onCurrentUriChanged('ddb://h/acme/site/out');
        h_.treeAttrs.onSelectionChanged([file], { selected: true });
        await flushPromises();

        expect(listed()).toEqual([file]);
        expect(file.selected).toBe(true);
        expect(headerSelection()).toEqual([file]);
        expect(wrapper.find('.panel-stub').exists()).toBe(true);
        expect(h_.panelProps.file).toEqual(file);
    });

    it('lists several nodes picked in the tree as the selection, a folder among them', async () => {
        await open();
        const picked = [node('out/a.jpg'), node('out/sub', T.DIRECTORY)];
        h_.treeAttrs.onSelectionChanged(picked, { selected: true });
        await flushPromises();

        expect(listed()).toEqual(picked);
        expect(headerSelection()).toEqual(picked);
    });

    it('lists a folder of the tree by what it holds, with nothing selected: the header is back to the whole dataset', async () => {
        await open();
        const [a, b] = [node('out/a.jpg'), node('out/b.jpg')];
        h_.treeAttrs.onSelectionChanged([a], { selected: true });
        await flushPromises();
        expect(headerSelection()).toEqual([a]);

        // The folder that holds the picked file: the same items, none selected any more
        h_.treeAttrs.onSelectionChanged([a, b]);
        await flushPromises();

        expect(listed()).toEqual([a, b]);
        expect([a.selected, b.selected]).toEqual([false, false]);
        expect(headerSelection()).toEqual([]);
        expect(wrapper.find('.panel-stub').exists()).toBe(false);
    });

    it('runs the actions of the tree on what is selected in the tree, not on what the list shows', async () => {
        await open();
        // A folder of the tree: the list shows what it holds
        const folder = node('out', T.DIRECTORY);
        const inside = [node('out/a.jpg'), node('out/b.jpg')];
        h_.treeSelection = [folder];
        h_.treeAttrs.onSelectionChanged(inside);
        await flushPromises();

        h_.treeAttrs.onDeleteSelecteditems();
        h_.treeAttrs.onMoveSelectedItems();
        h_.treeAttrs.onOpenProperties();
        h_.treeAttrs.onTransferSelectedItems();

        expect(h_.actions.remove).toHaveBeenCalledWith([folder]);
        expect(h_.actions.rename).toHaveBeenCalledWith(folder);
        expect(h_.actions.properties).toHaveBeenCalledWith([folder]);
        expect(h_.actions.transfer).toHaveBeenCalledWith([folder]);
        // The list still shows the folder's files
        expect(listed()).toEqual(inside);
    });

    it('downloads the whole dataset for the dataset itself (the root of the tree), with the question of the header', async () => {
        await open();
        const root = { label: 'site', path: ROOT.path, selected: false, entry: ROOT };
        await h_.treeAttrs.onDownloadItems([root]);

        expect(h_.dialog.props().message).toBe('Download all 3 items (10 B) as a ZIP?');
        expect(h_.download).toHaveBeenCalledTimes(1);
        expect(h_.download.mock.calls[0][0]).toEqual(expect.objectContaining({ paths: undefined, files: [] }));
    });

    it('downloads a folder of the tree as that folder', async () => {
        await open();
        h_.dataset.search = vi.fn(() => Promise.resolve([]));
        const folder = node('out', T.DIRECTORY);
        await h_.treeAttrs.onDownloadItems([folder]);

        expect(h_.dialog.props().message).toContain('Download the folder <strong>out</strong>');
        expect(h_.download.mock.calls[0][0]).toEqual(expect.objectContaining({ paths: ['out'], files: [folder] }));
    });

    it('renames nothing from the tree when several nodes are selected in it', async () => {
        await open();
        h_.treeSelection = [node('a.jpg'), node('b.jpg')];
        h_.treeAttrs.onMoveSelectedItems();
        expect(h_.actions.rename).not.toHaveBeenCalled();
    });
});

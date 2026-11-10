/**
 * The dataset page and the selection (FR-EXP-32, FR-EXP-27): the detail panel gets the live
 * selection (several items: the summary), the page stores the dataset's root entry for the header's
 * whole-dataset question, and a download from the menu asks for several items or a folder but not
 * for one file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, defineComponent, onMounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, selected: null, dialog: null, open: null, download: null, remove: null, explorerAttrs: null, panelProps: null }));

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }), useRoute: () => ({ params: { org: 'acme', ds: 'site' } }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset }),
        isLoggedIn: () => true,
        getUsername: () => 'u',
        features: { value: () => null, get: () => false }
    }
}));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { on: vi.fn(), off: vi.fn() }, datasetKey: ds => ds.baseApi }));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve() }
}));
vi.mock('@/composables/useDatasetListing', () => ({
    useDatasetListing: () => ({
        files: ref([]), selected: h_.selected, currentPath: ref(null), isLoading: ref(false), addEntry: vi.fn(), removed: vi.fn()
    })
}));
vi.mock('@/composables/useDatasetActions', () => ({
    useDatasetActions: () => ({ showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), remove: h_.remove })
}));
// The question opens on the dialog registry; the test answers it
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
const { default: ConfirmDialog } = await import('@/components/ConfirmDialog.vue');

const T = ddb.entry.type;
const MB = 1048576;
const file = (name, type, size) => ({ label: name, path: `ddb://h/acme/site/${name}`, selected: true, entry: { path: name, type, size } });
const ROOT = { path: 'ddb://h/acme/site', type: T.DRONEDB, size: 42050000, properties: { entries: 16, permissions: { canRead: true, canWrite: true } } };

// The explorer keeps the events the page binds; the detail panel keeps the props it gets
const Explorer = defineComponent({ inheritAttrs: false, setup(_, { attrs }) { h_.explorerAttrs = attrs; return () => h('div', { class: 'explorer-stub' }); } });
const DetailPanel = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) { h_.panelProps = attrs; return () => h('div', { class: 'panel-stub' }); }
});
// The tree asks for the root of the dataset when it mounts, as the real one does
const FileBrowser = defineComponent({
    props: { rootNodes: { type: Function, default: null } },
    setup(props) {
        onMounted(() => props.rootNodes?.());
        return () => h('div', { class: 'browser' });
    }
});
const slots = { render() { return h('div', [this.$slots.first?.(), this.$slots.second?.(), this.$slots.explorer?.()]); } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser, Panel: slots, TabSwitcher: slots, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer, TableView: Explorer, DetailPanel
};

let wrapper;
async function open() {
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([ROOT])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [createPinia()] } });
    await flushPromises();
}

beforeEach(() => {
    setActivePinia(createPinia());
    window.HubOptions = { appName: 'DroneDB' };
    h_.selected = ref([]);
    h_.dialog = null;
    // Answers Download, unless a test answers itself
    h_.open = vi.fn((component, props) => {
        h_.dialog = { component, props: typeof props === 'function' ? props : () => props };
        return Promise.resolve('confirm');
    });
    h_.download = vi.fn(() => Promise.resolve());
    h_.remove = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('ViewDataset detail panel and root entry', () => {
    it('keeps the root entry of the dataset in the session (the header\'s question reads its count and size)', async () => {
        await open();
        expect(useDatasetSessionStore().rootEntry).toEqual(ROOT);
        wrapper.unmount();
        wrapper = null;
        expect(useDatasetSessionStore().rootEntry).toBeNull();
    });

    it('starts without the root entry of another dataset a late answer left in the session, until its own arrives (FR-NAV-03)', async () => {
        const pinia = createPinia();
        setActivePinia(pinia);
        useDatasetSessionStore().setRootEntry({ path: 'ddb://h/acme/other', properties: { meta: { name: { data: 'Other' } } } });
        let answer;
        h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => new Promise(resolve => { answer = resolve; })), metaGet: vi.fn(() => Promise.resolve([])) };
        document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
        wrapper = mount(ViewDataset, { global: { stubs, plugins: [pinia] } });
        await flushPromises();

        expect(useDatasetSessionStore().rootEntry).toBeNull();

        answer([ROOT]);
        await flushPromises();
        expect(useDatasetSessionStore().rootEntry).toEqual(ROOT);
    });

    it('gives the open detail panel the live selection and the write permission', async () => {
        await open();
        const [a, b, c] = [file('a.jpg', T.IMAGE, MB), file('b.jpg', T.IMAGE, MB), file('c.jpg', T.IMAGE, MB)];
        h_.selected.value = [a, b, c];
        h_.explorerAttrs.onSelectionChanged(c);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));
        expect(h_.panelProps.selection).toEqual([a, b, c]);
        expect(h_.panelProps['can-write']).toBe(true);
        // It follows the selection as it changes, with no event
        h_.selected.value = [a];
        await flushPromises();
        expect(h_.panelProps.selection).toEqual([a]);
    });

    it('runs the summary\'s Delete on the selection', async () => {
        await open();
        const [a, b] = [file('a.jpg', T.IMAGE, MB), file('b.jpg', T.IMAGE, MB)];
        h_.selected.value = [a, b];
        h_.explorerAttrs.onSelectionChanged(b);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));
        h_.panelProps.onDeleteSelecteditems();
        expect(h_.remove).toHaveBeenCalledWith([a, b]);
    });
});

describe('ViewDataset downloads from the menu (FR-EXP-27)', () => {
    it('downloads one file at once, without a question', async () => {
        await open();
        await h_.explorerAttrs.onDownloadItems([file('a.jpg', T.IMAGE, MB)]);
        expect(h_.open).not.toHaveBeenCalled();
        expect(h_.download).toHaveBeenCalledTimes(1);
    });

    it('asks for several files, with their count and size, and downloads when confirmed', async () => {
        await open();
        await h_.explorerAttrs.onDownloadItems([file('a.jpg', T.IMAGE, 3 * MB), file('b.jpg', T.IMAGE, 6.3 * MB)]);
        expect(h_.dialog.component).toBe(ConfirmDialog);
        expect(h_.dialog.props()).toEqual(expect.objectContaining({ title: 'Download', message: 'Download 2 files (9.3 MB) as a ZIP?', confirmText: 'Download', cancelText: 'Cancel' }));
        expect(h_.download).toHaveBeenCalledTimes(1);
    });

    it('asks for a folder with "Calculating size…", then its total size, and stops reading it when the user cancels', async () => {
        await open();
        let found;
        h_.dataset.search = vi.fn(() => new Promise(resolve => { found = resolve; }));
        let answer;
        h_.open = vi.fn((component, props) => {
            h_.dialog = { component, props };
            return new Promise(resolve => { answer = resolve; });
        });
        const done = h_.explorerAttrs.onDownloadItems([file('newdir', T.DIRECTORY, 0)]);
        await flushPromises();
        expect(h_.dataset.search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'newdir', recursive: true }));
        expect(h_.dialog.props().message).toBe('Download the folder <strong>newdir</strong> and everything inside it as a ZIP? Calculating size…');
        found([{ path: 'newdir/a.jpg', type: T.IMAGE, size: 1024 }, { path: 'newdir/sub', type: T.DIRECTORY, size: 0 }, { path: 'newdir/sub/b.jpg', type: T.IMAGE, size: 512 }]);
        await flushPromises();
        expect(h_.dialog.props().message).toBe('Download the folder <strong>newdir</strong> and everything inside it (1.5 KB) as a ZIP?');
        const { signal } = h_.dataset.search.mock.calls[0][1];
        expect(signal.aborted).toBe(false);
        answer('cancel');
        await done;
        expect(signal.aborted).toBe(true);
        expect(h_.download).not.toHaveBeenCalled();
    });

    it('says when the size of a selection with a folder could not be read', async () => {
        await open();
        h_.dataset.search = vi.fn(() => Promise.reject(new Error('offline')));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let answer;
        h_.open = vi.fn((component, props) => {
            h_.dialog = { component, props };
            return new Promise(resolve => { answer = resolve; });
        });
        const done = h_.explorerAttrs.onDownloadItems([file('newdir', T.DIRECTORY, 0), file('a.jpg', T.IMAGE, MB)]);
        await flushPromises();
        expect(h_.dialog.props().message).toBe('Download 2 items as a ZIP? A folder goes with everything inside it. The size could not be calculated.');
        expect(warn).toHaveBeenCalled();
        answer('confirm');
        await done;
        expect(h_.download).toHaveBeenCalledTimes(1);
    });
});

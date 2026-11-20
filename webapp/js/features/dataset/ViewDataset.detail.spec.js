/**
 * The dataset page: the detail panel follows the list (FR-EXP-06), the page has a header with the name, the visibility and the
 * tagline of the dataset (FR-EXP-14), and the README of the dataset shows under the files at its root (FR-EXP-14).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, defineComponent, onMounted, computed } from 'vue';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, listing: null, explorerAttrs: null, panelProps: null, actionsArgs: null, rootLabels: [], datasets: null }));

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }), useRoute: () => ({ params: { org: 'acme', ds: 'site' } }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset, datasets: (...args) => h_.datasets(...args) }),
        isLoggedIn: () => true,
        getUsername: () => 'u',
        features: { value: () => null, get: () => false }
    }
}));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { on: vi.fn(), off: vi.fn() }, datasetKey: ds => ds.baseApi }));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve() }
}));
vi.mock('@/composables/useDatasetListing', () => ({ useDatasetListing: () => h_.listing }));
vi.mock('@/composables/useDatasetActions', () => ({
    useDatasetActions: args => {
        h_.actionsArgs = args;
        return { showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), remove: vi.fn() };
    }
}));
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
const { default: emitter } = await import('@/libs/eventBus');

const T = ddb.entry.type;
const item = (name, selected = true) => ({ label: name, path: `ddb://h/acme/site/${name}`, selected, entry: { path: name, type: T.IMAGE, size: 10 } });
const ROOT = {
    path: 'ddb://h/acme/site', type: T.DRONEDB, size: 42050000,
    properties: {
        entries: 16, readme: 'README.md', permissions: { canRead: true, canWrite: true },
        meta: {
            name: { id: 'a1', data: 'Brighton Beach', mtime: 1 }, tagline: { id: 'b2', data: 'Survey of the shore', mtime: 1 },
            visibility: { id: 'c3', data: 1, mtime: 1 }
        }
    }
};

const Explorer = defineComponent({ inheritAttrs: false, setup(_, { attrs }) { h_.explorerAttrs = attrs; return () => h('div', { class: 'explorer-stub' }); } });
const DetailPanel = defineComponent({ inheritAttrs: false, setup(_, { attrs }) { h_.panelProps = attrs; return () => h('div', { class: 'panel-stub' }); } });
const FileBrowser = defineComponent({
    props: { rootNodes: { type: Function, default: null } },
    setup(props) {
        onMounted(() => props.rootNodes?.());
        return () => h('div', { class: 'browser' });
    },
    methods: { setRootLabel(label) { h_.rootLabels.push(label); } }
});
const slots = { render() { return h('div', [this.$slots.first?.(), this.$slots.second?.(), this.$slots.explorer?.()]); } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser, Panel: slots, TabSwitcher: slots, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer, TableView: Explorer, DetailPanel
};

/** A listing as the page's composable gives it: the selection is the files that are selected, removed drops them. */
function makeListing(files, currentPath = null) {
    const list = ref(files);
    return {
        files: list, currentPath: ref(currentPath), isLoading: ref(false), selected: computed(() => list.value.filter(f => f.selected)),
        addEntry: vi.fn(), uploaded: vi.fn(), reload: vi.fn(),
        removed: paths => { list.value = list.value.filter(f => !paths.includes(f.entry.path)); }
    };
}

let wrapper;
const README_ENTRY = { path: 'README.md', type: T.MARKDOWN ?? 8, size: 120, hash: 'h1', mtime: 1700000000 };
async function open({ root = ROOT, files = [], currentPath = null, readme = '# Hello\n\nSite notes.', readmeEntry = README_ENTRY } = {}) {
    h_.listing = makeListing(files, currentPath);
    h_.rootLabels = [];
    h_.datasets = vi.fn(() => Promise.resolve([{ slug: 'site', creationDate: '2026-03-04T10:30:15Z' }]));
    h_.dataset = {
        baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([root])), listOne: vi.fn(() => Promise.resolve(readmeEntry)), metaGet: vi.fn(() => Promise.resolve([])),
        getFileContents: vi.fn(() => (readme instanceof Error ? Promise.reject(readme) : Promise.resolve(readme))), downloadUrl: path => `/dl/${path}`
    };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
}

beforeEach(() => {
    setActivePinia(createPinia());
    window.HubOptions = { appName: 'DroneDB' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('ViewDataset detail panel follows the list (FR-EXP-06)', () => {
    it('closes the panel of a file that is removed from the list', async () => {
        const file = item('DJI_0022.JPG');
        await open({ files: [file, item('DJI_0023.JPG', false)] });
        h_.explorerAttrs.onSelectionChanged(file);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));
        expect(h_.panelProps.file.entry.path).toBe('DJI_0022.JPG');

        h_.listing.removed(['DJI_0022.JPG']);
        await flushPromises();

        expect(wrapper.find('.panel-stub').exists()).toBe(false);
    });

    it('shows the next selected item when the shown one is removed but others stay selected', async () => {
        const [a, b] = [item('a.jpg'), item('b.jpg')];
        await open({ files: [a, b] });
        h_.explorerAttrs.onSelectionChanged(b);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));

        h_.listing.removed(['b.jpg']);
        await flushPromises();

        expect(h_.panelProps.file.entry.path).toBe('a.jpg');
    });

    it('does not open again for a file that comes back at the path of the removed one', async () => {
        const file = item('a.jpg');
        await open({ files: [file] });
        h_.explorerAttrs.onSelectionChanged(file);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));
        h_.listing.removed(['a.jpg']);
        await flushPromises();

        h_.listing.files.value = [item('a.jpg', false)];
        await flushPromises();

        expect(wrapper.find('.panel-stub').exists()).toBe(false);
    });

    it('keeps the panel when the list replaces the item of the shown file with a newer one', async () => {
        const file = item('a.jpg');
        await open({ files: [file] });
        h_.explorerAttrs.onSelectionChanged(file);
        await vi.waitFor(() => expect(wrapper.find('.panel-stub').exists()).toBe(true));

        const newer = item('a.jpg');
        newer.entry.size = 99;
        h_.listing.files.value = [newer];
        await flushPromises();

        expect(h_.panelProps.file.entry.size).toBe(99);
    });
});

describe('ViewDataset header (FR-EXP-14)', () => {
    it('shows the name, the visibility and the tagline of the dataset above the tabs', async () => {
        await open();
        const header = wrapper.find('header.dataset-header');
        expect(header.exists()).toBe(true);
        expect(header.find('h1').text()).toBe('Brighton Beach');
        expect(header.text()).toContain('Unlisted');
        expect(header.find('.dataset-tagline').text()).toBe('Survey of the shore');
    });

    it('names the dataset by its slug when it has no display name, and shows no tagline', async () => {
        await open({ root: { path: 'site', type: T.DRONEDB, size: 1, properties: { entries: 1, meta: { visibility: { data: 0 } } } } });
        const header = wrapper.find('header.dataset-header');
        expect(header.find('h1').text()).toBe('site');
        expect(header.text()).toContain('Private');
        expect(header.find('.dataset-tagline').exists()).toBe(false);
    });

    it('keeps the root entry in the session, for the header of the page (FR-NAV-03)', async () => {
        await open();
        expect(useDatasetSessionStore().rootEntry.properties.meta.name.data).toBe('Brighton Beach');
    });

    it('reads the dataset again when the README appears in the list (a new README shows without a reload)', async () => {
        await open({ root: { ...ROOT, properties: { ...ROOT.properties, readme: undefined } } });
        expect(wrapper.find('.dataset-readme').exists()).toBe(false);
        h_.dataset.info.mockResolvedValue([ROOT]);

        emitter.emit('addItems', [item('README.md', false)]);
        await flushPromises();

        expect(wrapper.find('.dataset-readme').exists()).toBe(true);
    });
});

describe('ViewDataset README panel (FR-EXP-14)', () => {
    it('renders the README of the dataset under the files at the root, as Markdown', async () => {
        await open();
        const panel = wrapper.find('.dataset-readme');
        expect(panel.exists()).toBe(true);
        expect(h_.dataset.getFileContents).toHaveBeenCalledWith('README.md');
        expect(panel.find('.content h1').text()).toBe('Hello');
        expect(panel.find('.content p').text()).toBe('Site notes.');
    });

    it('collapses', async () => {
        await open();
        const toggle = wrapper.find('.readme-bar button');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        await toggle.trigger('click');
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(wrapper.find('#dataset-readme-body').attributes('style')).toContain('display: none');
    });

    it('is not shown in a subfolder, nor for a dataset without a README', async () => {
        await open({ currentPath: 'sub' });
        expect(wrapper.find('.dataset-readme').exists()).toBe(false);
        wrapper.unmount();
        document.body.innerHTML = '';
        await open({ root: { ...ROOT, properties: { ...ROOT.properties, readme: undefined } } });
        expect(wrapper.find('.dataset-readme').exists()).toBe(false);
        expect(h_.dataset.getFileContents).not.toHaveBeenCalled();
    });

    it('says when the file cannot be read, and keeps the panel', async () => {
        await open({ readme: new Error('offline') });
        expect(wrapper.find('.readme-note').text()).toBe('Cannot read README.md: offline');
        expect(wrapper.find('.dataset-readme').exists()).toBe(true);
    });
});

describe('ViewDataset README load (FR-EXP-14)', () => {
    it('does not download a README above the cap: it says so, and Open stays', async () => {
        await open({ readmeEntry: { ...README_ENTRY, size: 5 * 1024 * 1024 } });
        expect(h_.dataset.listOne).toHaveBeenCalledWith('README.md');
        expect(h_.dataset.getFileContents).not.toHaveBeenCalled();
        expect(wrapper.find('.readme-note').text()).toContain('README is too large to show here');
        expect(wrapper.find('.readme-bar').text()).toContain('Open');
    });

    it('reads the file once, and not again when the dataset is read again without a change of the README', async () => {
        await open();
        expect(h_.dataset.getFileContents).toHaveBeenCalledTimes(1);

        // A setting, the cover or an upload: the root entry is read again, the README entry has the same hash and time
        await h_.actionsArgs.rootChanged();
        await h_.actionsArgs.rootChanged();
        await flushPromises();

        expect(h_.dataset.info.mock.calls.length).toBeGreaterThanOrEqual(3);
        expect(h_.dataset.getFileContents).toHaveBeenCalledTimes(1);
    });

    it('reads the file again when its hash or time changed', async () => {
        await open();
        h_.dataset.listOne.mockResolvedValue({ ...README_ENTRY, hash: 'h2', mtime: 1700000500 });
        h_.dataset.getFileContents.mockResolvedValue('# Changed');

        await h_.actionsArgs.rootChanged();
        await flushPromises();

        expect(h_.dataset.getFileContents).toHaveBeenCalledTimes(2);
        expect(wrapper.find('.dataset-readme .content h1').text()).toBe('Changed');
    });
});

describe('ViewDataset after a name change (FR-EXP-24)', () => {
    it('patches the label of the root of the tree, in place', async () => {
        await open();
        const renamed = { ...ROOT, properties: { ...ROOT.properties, meta: { ...ROOT.properties.meta, name: { id: 'a1', data: 'New Name', mtime: 2 } } } };
        h_.dataset.info.mockResolvedValue([renamed]);
        h_.rootLabels.length = 0;

        await h_.actionsArgs.rootChanged();
        await flushPromises();

        expect(h_.rootLabels).toContain('New Name');
        expect(wrapper.find('header.dataset-header h1').text()).toBe('New Name');
    });
});

describe('ViewDataset creation date (FR-EXP-25)', () => {
    it('reads the creation date of the dataset once, from the dataset list of the organization, into the session', async () => {
        await open();
        expect(h_.datasets).toHaveBeenCalledTimes(1);
        expect(h_.datasets).toHaveBeenCalledWith({ slugs: ['site'] });
        expect(useDatasetSessionStore().creationDate).toBe('2026-03-04T10:30:15Z');
    });
});

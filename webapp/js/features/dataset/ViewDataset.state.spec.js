/**
 * The dataset page when the dataset does not load (FR-ACC-18, FR-ACC-14, D-048): the page state of
 * ResourceState in place of the panels, with no error modal and no spinner, and the header's
 * Download, Share and Settings withdrawn through the dataset session store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, defineComponent, onMounted, effectScope } from 'vue';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';

const h_ = vi.hoisted(() => ({ dataset: null, showError: null, importFromUrl: null, loggedIn: true, gone: null }));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'r3sharing', ds: 'brighton-beach' } }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset }),
        isLoggedIn: () => h_.loggedIn,
        getUsername: () => 'r3sharingu2',
        features: { value: () => null, get: () => false }
    }
}));
// The shared task poller tells when the dataset is deleted while the page is open
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: (event, fn) => { if (event === 'datasetGone') h_.gone = fn; },
        off: (event, fn) => { if (event === 'datasetGone' && h_.gone === fn) h_.gone = null; }
    },
    datasetKey: ds => ds.baseApi
}));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve() }
}));
vi.mock('@/composables/useDatasetListing', () => ({
    useDatasetListing: () => ({
        files: ref([]), selected: ref([]), currentPath: ref(null), isLoading: ref(true), addEntry: vi.fn(), removed: vi.fn()
    })
}));
vi.mock('@/composables/useDatasetActions', () => ({
    useDatasetActions: () => ({ showError: h_.showError, confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), importFromUrl: (...args) => h_.importFromUrl(...args) })
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
const { ApiError } = await import('@/libs/ddb/apiError');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');
const { useDatasetShortcuts } = await import('@/composables/useDatasetShortcuts');
const { default: PhotoLightbox } = await import('./PhotoLightbox.vue');
const { default: MapFilePopup } = await import('@/features/viewers/map/MapFilePopup.vue');
const { hasOpenOverlay } = await import('@/composables/useOverlay');

// The tree asks for the root of the dataset when it mounts, as the real one does
const FileBrowserStub = defineComponent({
    props: { rootNodes: { type: Function, default: null } },
    setup(props) {
        onMounted(() => props.rootNodes?.());
        return () => h('div', { class: 'browser' });
    }
});
const slotted = { render() { return h('div', { class: 'panel' }, [this.$slots.first?.(), this.$slots.second?.()]); } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser: FileBrowserStub, Panel: slotted, TabSwitcher: slotted, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer: nothing, TableView: nothing, DetailPanel: nothing
};

let wrapper;
let pinia;
async function open(infoResult, extraStubs = {}) {
    h_.dataset = { baseApi: 'r3sharing/brighton-beach', info: vi.fn(() => infoResult), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs: { ...stubs, ...extraStubs }, plugins: [pinia] } });
    await flushPromises();
}

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    pinia = createPinia();
    setActivePinia(pinia);
    h_.loggedIn = true;
    h_.showError = vi.fn();
    h_.importFromUrl = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('ViewDataset page states', () => {
    it('a 403 shows the no access state in place of the panels, with no modal and no spinner', async () => {
        await open(Promise.reject(new ApiError('Forbidden', 403)));
        expect(wrapper.find('h1').text()).toBe('You do not have access to this dataset');
        expect(wrapper.text()).toContain('"brighton-beach" is private.');
        const targets = wrapper.findAllComponents(RouterLinkStub).map(l => [l.text(), l.props('to')]);
        expect(targets).toContainEqual(['Go to my datasets', { name: 'Datasets', params: { org: 'r3sharingu2' } }]);
        expect(wrapper.text()).toContain('Sign in as another user');
        expect(wrapper.find('.panel').exists()).toBe(false);
        expect(h_.showError).not.toHaveBeenCalled();
        expect(useDatasetSessionStore().unavailable).toBe(true);
        expect(document.title).toBe('You do not have access to this dataset - DroneDB');
    });

    it('a 404 shows the not found state of the dataset', async () => {
        await open(Promise.reject(new ApiError('Not found', 404)));
        expect(wrapper.find('h1').text()).toBe('Dataset not found');
        expect(wrapper.text()).toContain('"brighton-beach" does not exist.');
        expect(h_.showError).not.toHaveBeenCalled();
    });

    it('a 401 to a visitor without a session shows the sign-in state (D-048)', async () => {
        h_.loggedIn = false;
        await open(Promise.reject(new ApiError('Unauthorized', 401)));
        expect(wrapper.find('h1').text()).toBe('Sign in to open this dataset');
        expect(wrapper.findAllComponents(RouterLinkStub)[0].props('to')).toMatchObject({ name: 'Login' });
    });

    it('another failure keeps the page and shows its message', async () => {
        await open(Promise.reject(new ApiError('Server error', 500)));
        expect(wrapper.find('.resource-state').exists()).toBe(false);
        expect(wrapper.find('.panel').exists()).toBe(true);
        expect(h_.showError).toHaveBeenCalled();
        expect(useDatasetSessionStore().unavailable).toBe(false);
    });

    it('a dataset that loads keeps the panels and the header actions, and leaving it clears the flag', async () => {
        useDatasetSessionStore().setUnavailable(true);
        await open(Promise.resolve([{ path: '', type: 1, properties: { permissions: { canRead: true } } }]));
        expect(wrapper.find('.panel').exists()).toBe(true);
        expect(useDatasetSessionStore().unavailable).toBe(false);
    });
});

describe('ViewDataset keyboard shortcuts', () => {
    it('leave the keys to an overlay over the page: Delete, Ctrl+C and Ctrl+X do nothing under the photo lightbox', async () => {
        await open(Promise.resolve([{ path: '', type: 1, properties: { permissions: { canRead: true } } }]));
        // The page's rule, run by the real shortcuts
        const { blocked } = useDatasetShortcuts.mock.calls.at(-1)[0];
        const { useDatasetShortcuts: realShortcuts } = await vi.importActual('@/composables/useDatasetShortcuts');
        const actions = { remove: vi.fn(), upload: vi.fn(), importFromUrl: vi.fn() };
        const clipboard = { copy: vi.fn(), cut: vi.fn(), paste: vi.fn() };
        const scope = effectScope();
        scope.run(() => realShortcuts({
            blocked, canWrite: ref(true), selected: () => [{ path: 'a.jpg', entry: { path: 'a.jpg', type: 6 } }], treeFor: () => null, actions, clipboard
        }));
        expect(blocked()).toBe(false);

        const lightbox = mount(PhotoLightbox, {
            props: { dataset: { thumbUrl: p => `/thumb/${p}`, downloadUrl: p => `/download/${p}` }, photos: [{ path: 'a.jpg', entry: { path: 'a.jpg', type: 6 } }] },
            attachTo: document.body, global: { plugins: [PrimeVue, pinia] }
        });
        await flushPromises();
        expect(blocked()).toBe(true);
        const press = (key, mods = {}) => (document.activeElement || document.body)
            .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
        press('Delete');
        press('c', { ctrlKey: true });
        press('x', { ctrlKey: true });
        expect(actions.remove).not.toHaveBeenCalled();
        expect(clipboard.copy).not.toHaveBeenCalled();
        expect(clipboard.cut).not.toHaveBeenCalled();

        // Closed, the page has its keys again
        lightbox.unmount();
        expect(blocked()).toBe(false);
        press('Delete');
        expect(actions.remove).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('keep the keys of the page under a map popup (not modal): Delete, Ctrl+C and Ctrl+X work', async () => {
        await open(Promise.resolve([{ path: '', type: 1, properties: { permissions: { canRead: true } } }]));
        const { blocked } = useDatasetShortcuts.mock.calls.at(-1)[0];
        const { useDatasetShortcuts: realShortcuts } = await vi.importActual('@/composables/useDatasetShortcuts');
        const actions = { remove: vi.fn(), upload: vi.fn(), importFromUrl: vi.fn() };
        const clipboard = { copy: vi.fn(), cut: vi.fn(), paste: vi.fn() };
        const scope = effectScope();
        scope.run(() => realShortcuts({
            blocked, canWrite: ref(true), selected: () => [{ path: 'a.txt', entry: { path: 'a.txt', type: 2 } }], treeFor: () => null, actions, clipboard
        }));

        // The draggable popup of a file on the map, shown: an overlay, but not a modal one
        const target = document.createElement('div');
        document.body.appendChild(target);
        const map = { addOverlay: o => target.appendChild(o.getElement().parentElement), removeOverlay: vi.fn(), getTargetElement: () => target };
        const popup = mount(MapFilePopup, { props: { map }, attachTo: document.body });
        popup.vm.show({ path: 'ddb://localhost/org/ds/a.txt', entry: { path: 'a.txt', type: 2, properties: {}, point_geom: { type: 'Point', coordinates: [9, 45] } } }, [0, 0]);
        await flushPromises();
        expect(hasOpenOverlay()).toBe(true);
        expect(blocked()).toBe(false);

        const press = (key, mods = {}) => document.body
            .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
        press('Delete');
        press('c', { ctrlKey: true });
        press('x', { ctrlKey: true });
        expect(actions.remove).toHaveBeenCalledTimes(1);
        expect(clipboard.copy).toHaveBeenCalledTimes(1);
        expect(clipboard.cut).toHaveBeenCalledTimes(1);

        popup.unmount();
        target.remove();
        scope.stop();
    });
});

describe('ViewDataset when the dataset is deleted while it is open (FR-UPL-05, D-004)', () => {
    const OPEN = [{ path: '', type: 1, properties: { permissions: { canRead: true } } }];

    it('shows the not found state in place of the panels, as for a dataset that is not there', async () => {
        await open(Promise.resolve(OPEN));
        expect(wrapper.find('.panel').exists()).toBe(true);

        h_.gone({ dataset: h_.dataset, error: new ApiError('Not found', 404) });
        await flushPromises();

        expect(wrapper.find('h1').text()).toBe('Dataset not found');
        expect(wrapper.find('.panel').exists()).toBe(false);
        expect(h_.showError).not.toHaveBeenCalled();
        expect(useDatasetSessionStore().unavailable).toBe(true);
    });

    it('ignores the loss of another dataset', async () => {
        await open(Promise.resolve(OPEN));
        h_.gone({ dataset: { baseApi: 'r3sharing/other' }, error: new ApiError('Not found', 404) });
        await flushPromises();
        expect(wrapper.find('.panel').exists()).toBe(true);
        expect(wrapper.find('.resource-state').exists()).toBe(false);
    });

    it('stops listening when the page is left', async () => {
        await open(Promise.resolve(OPEN));
        expect(h_.gone).toBeTypeOf('function');
        wrapper.unmount();
        wrapper = null;
        expect(h_.gone).toBeNull();
    });
});

describe('ViewDataset empty folder (FR-EXP-37)', () => {
    it('runs the Import from URL action of the dataset, with no address, when the file list asks for it', async () => {
        // The grid, whose events are the page's (the empty folder's buttons emit them)
        const Grid = defineComponent({ name: 'FileGridStub', inheritAttrs: false, emits: ['importFromUrl', 'upload'], render: () => h('div', { class: 'file-list' }) });
        await open(Promise.resolve([{ path: '', type: 1, properties: { permissions: { canRead: true, canWrite: true } } }]), { Explorer: Grid, TabSwitcher: { render() { return h('div', this.$slots.explorer?.()); } } });
        wrapper.findComponent(Grid).vm.$emit('importFromUrl');
        expect(h_.importFromUrl).toHaveBeenCalledWith('');
    });
});

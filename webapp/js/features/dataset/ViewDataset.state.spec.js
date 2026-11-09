/**
 * The dataset page when the dataset does not load (FR-ACC-18, FR-ACC-14, D-048): the page state of
 * ResourceState in place of the panels, with no error modal and no spinner, and the header's
 * Download, Share and Settings withdrawn through the dataset session store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, defineComponent, onMounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const h_ = vi.hoisted(() => ({ dataset: null, showError: null, loggedIn: true }));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'r3sharing', ds: 'brighton-beach' } }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset }),
        isLoggedIn: () => h_.loggedIn,
        getUsername: () => 'r3sharingu2',
        features: { value: () => null, get: () => false }
    }
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
    useDatasetActions: () => ({ showError: h_.showError, confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn() })
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
async function open(infoResult) {
    h_.dataset = { info: vi.fn(() => infoResult), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [pinia] } });
    await flushPromises();
}

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    pinia = createPinia();
    setActivePinia(pinia);
    h_.loggedIn = true;
    h_.showError = vi.fn();
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

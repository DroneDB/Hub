/**
 * The dataset page of a busy dataset: while an import or a rescan of its index runs, the Registry refuses every request on
 * the dataset but its delete and its tasks. The page shows the busy state in place of the panels (what runs, how far it is,
 * Back to datasets) and the header offers nothing on the dataset; it is entered on the 409 of the dataset's root, or when
 * the task store lists a task that keeps the dataset busy (a rescan started while the page is open), and when that task
 * ends the panels come back and read the dataset again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, defineComponent, onMounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';

const h_ = vi.hoisted(() => ({ dataset: null, busy: null, handlers: {}, tracked: [], showError: null, loadBuilds: null }));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'acme', ds: 'site' }, query: {}, hash: '' }), useRouter: () => ({ replace: vi.fn() }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset, datasets: () => Promise.resolve([]) }),
        isLoggedIn: () => true,
        getUsername: () => 'u',
        features: { value: () => null, get: () => false }
    }
}));
// The store of the app's tasks: what it lists for the dataset (getBusy) and its events are the subject here (its own spec
// covers the store)
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: (event, fn) => { (h_.handlers[event] ||= []).push(fn); },
        off: (event, fn) => { h_.handlers[event] = (h_.handlers[event] || []).filter(f => f !== fn); },
        getBusy: () => h_.busy,
        trackBusy: (...args) => h_.tracked.push(args)
    },
    datasetKey: ds => ds.baseApi
}));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: (...args) => h_.loadBuilds(...args) }
}));
vi.mock('@/composables/useDatasetListing', () => ({
    useDatasetListing: () => ({ files: ref([]), selected: ref([]), currentPath: ref(null), isLoading: ref(false), addEntry: vi.fn(), removed: vi.fn(), reload: vi.fn() })
}));
vi.mock('@/composables/useDatasetActions', () => ({
    useDatasetActions: () => ({ showError: (...args) => h_.showError(...args), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), remove: vi.fn() })
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
    inheritAttrs: false,
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

const ROOT = [{ path: '', type: 1, properties: { permissions: { canRead: true, canWrite: true } } }];
const busyAnswer = (kind = 'importing') => new ApiError(`Dataset 'acme/site' is ${kind}`, 409, { datasetBusy: kind, taskId: 'task-1', noRetry: true });
const emit = (event, payload) => (h_.handlers[event] || []).forEach(fn => fn({ dataset: h_.dataset, ...payload }));

let wrapper;
async function open(info) {
    h_.dataset = { baseApi: 'acme/site', info, metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
}

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    setActivePinia(createPinia());
    h_.busy = null;
    h_.handlers = {};
    h_.tracked = [];
    h_.showError = vi.fn();
    h_.loadBuilds = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('ViewDataset of a busy dataset', () => {
    it('shows the busy state in place of the panels when the dataset answers 409 busy, and follows its task', async () => {
        await open(vi.fn(() => Promise.reject(busyAnswer('importing'))));

        expect(wrapper.find('.panel').exists()).toBe(false);
        expect(wrapper.find('h1').text()).toBe('This dataset is being imported');
        expect(wrapper.text()).toContain('"site" opens when the import ends. Until then it can only be deleted.');
        const links = wrapper.findAllComponents(RouterLinkStub).map(l => [l.text(), l.props('to')]);
        expect(links[0]).toEqual(['Back to datasets', { name: 'Datasets', params: { org: 'acme' } }]);
        // The header offers nothing on the dataset; no error is shown
        expect(useDatasetSessionStore().unavailable).toBe(true);
        expect(h_.showError).not.toHaveBeenCalled();
        expect(h_.tracked).toEqual([[h_.dataset, 'task-1', 'importing']]);
    });

    it('shows the progress the task store gives', async () => {
        await open(vi.fn(() => Promise.reject(busyAnswer('rescanning'))));
        expect(wrapper.find('h1').text()).toBe('This dataset is being rescanned');
        expect(wrapper.find('.resource-state-progress').text()).toBe('Rescanning…');

        h_.busy = { kind: 'rescanning', taskId: 'task-1', progress: 40 };
        emit('tasksUpdated');
        await flushPromises();

        expect(wrapper.find('.resource-state-progress').text()).toBe('Rescanning… 40 %');
        expect(wrapper.find('.resource-state-progress').attributes('role')).toBe('status');
    });

    it('switches to the busy state when a rescan starts while the page is open, and ignores the tasks of another dataset', async () => {
        await open(vi.fn(() => Promise.resolve(ROOT)));
        expect(wrapper.find('.panel').exists()).toBe(true);

        h_.busy = { kind: 'rescanning', taskId: 'task-2', progress: null };
        (h_.handlers.tasksUpdated || []).forEach(fn => fn({ dataset: { baseApi: 'acme/other' } }));
        await flushPromises();
        expect(wrapper.find('.panel').exists()).toBe(true);

        emit('tasksUpdated');
        await flushPromises();
        expect(wrapper.find('.panel').exists()).toBe(false);
        expect(wrapper.find('h1').text()).toBe('This dataset is being rescanned');
        expect(useDatasetSessionStore().unavailable).toBe(true);
    });

    it('opens the dataset again, reading its root, its builds and its views, when the task ends', async () => {
        const info = vi.fn(() => Promise.reject(busyAnswer('rescanning')));
        await open(info);
        expect(info).toHaveBeenCalledTimes(1);
        const views = h_.dataset.metaGet.mock.calls.length;

        info.mockImplementation(() => Promise.resolve(ROOT));
        emit('busyEnded', { task: { taskId: 'task-1', state: 'Succeeded' }, gone: false, kind: 'rescanning' });
        await flushPromises();

        expect(wrapper.find('.resource-state').exists()).toBe(false);
        expect(wrapper.find('.panel').exists()).toBe(true);
        expect(info).toHaveBeenCalledTimes(2);
        expect(h_.loadBuilds).toHaveBeenCalledTimes(2);
        expect(h_.dataset.metaGet.mock.calls.length).toBeGreaterThan(views);
        expect(useDatasetSessionStore().unavailable).toBe(false);
    });

    it('stays busy when another task keeps the dataset busy as one ends', async () => {
        await open(vi.fn(() => Promise.reject(busyAnswer('importing'))));
        h_.busy = { kind: 'rescanning', taskId: 'task-3', progress: 5 };
        emit('busyEnded', { task: { taskId: 'task-1', state: 'Succeeded' }, gone: false, kind: 'importing' });
        await flushPromises();

        expect(wrapper.find('h1').text()).toBe('This dataset is being rescanned');
    });

    it('shows the not found state when the dataset is deleted while it is busy', async () => {
        await open(vi.fn(() => Promise.reject(busyAnswer('importing'))));
        emit('datasetGone', { error: new ApiError('Not found', 404) });
        emit('busyEnded', { task: null, gone: true, kind: 'importing' });
        await flushPromises();

        expect(wrapper.find('h1').text()).toBe('Dataset not found');
        expect(useDatasetSessionStore().unavailable).toBe(true);
    });
});

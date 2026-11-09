/**
 * The link of the task notification e-mail (FR-PRC-40) is `/r/{org}/{ds}?tab=tasks`: the dataset page opens on its Tasks
 * tab for it, and on its first tab for any other query. The page follows the query afterwards (back/forward, a link to
 * the same dataset) and drops it, with router.replace, once the user switches to another tab.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, reactive } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, route: null, replace: null }));

vi.mock('vue-router', () => ({ useRoute: () => h_.route, useRouter: () => ({ replace: h_.replace }) }));
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
        files: ref([]), selected: ref([]), currentPath: ref(null), isLoading: ref(false), addEntry: vi.fn(), removed: vi.fn()
    })
}));
vi.mock('@/composables/useDatasetActions', () => ({
    useDatasetActions: () => ({ showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), remove: vi.fn() })
}));
vi.mock('@/composables/useDatasetClipboard', () => ({ useDatasetClipboard: () => ({}) }));
vi.mock('@/composables/useOpenItem', () => ({ useOpenItem: () => ({ openItem: vi.fn() }) }));
vi.mock('@/composables/useDatasetShortcuts', () => ({ useDatasetShortcuts: vi.fn() }));
vi.mock('@/composables/useBuildEvents', () => ({ useBuildEvents: () => ({ watchBuildEvents: vi.fn(), handleBuildStarted: vi.fn(), handleBuildError: vi.fn() }) }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
vi.mock('@/features/viewers/splat/useSplatDownloads', () => ({ useSplatDownloads: () => ({ download: vi.fn() }) }));
vi.mock('@/composables/useViewActions', () => ({ useViewActions: () => ({ rename: vi.fn(), remove: vi.fn() }) }));
vi.mock('@/features/viewers/map/DatasetMap.vue', () => ({ default: { render: () => null } }));
vi.mock('./TaskHistory.vue', async () => {
    const vue = await import('vue');
    return { __esModule: true, default: vue.defineComponent({ render: () => vue.h('div', { class: 'tasks-stub' }) }) };
});

const { default: ViewDataset } = await import('./ViewDataset.vue');

const T = ddb.entry.type;
const ROOT = { path: 'ddb://h/acme/site', type: T.DRONEDB, size: 1, properties: { entries: 1, permissions: { canRead: true, canWrite: true } } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser: nothing, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub, DialogHost: nothing,
    ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer: nothing, TableView: nothing, DetailPanel: nothing
};

let wrapper;
async function open(query, extra = {}) {
    h_.route = reactive({ params: { org: 'acme', ds: 'site' }, query, hash: '', ...extra });
    // As the router does: the address (and so the reactive route) takes the new query
    h_.replace = vi.fn(async to => { h_.route.query = to.query; h_.route.hash = to.hash ?? ''; });
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([ROOT])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { attachTo: document.getElementById('app'), global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
}
const activeTab = () => wrapper.find('[role="tab"][aria-selected="true"]').text();

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
});

afterEach(() => {
    wrapper?.unmount();
    document.getElementById('app')?.remove();
});

describe('ViewDataset ?tab=tasks', () => {
    it('opens on the Tasks tab, and mounts its list, for the link of the task e-mail', async () => {
        await open({ tab: 'tasks' });
        expect(activeTab()).toBe('Tasks');
        expect(wrapper.find('.tasks-stub').exists()).toBe(true);
    });

    it('opens on the first tab without the query', async () => {
        await open({});
        expect(activeTab()).toBe('Files');
        expect(wrapper.find('.tasks-stub').exists()).toBe(false);
    });

    it('opens on the first tab for another value of the query', async () => {
        await open({ tab: 'map' });
        expect(activeTab()).toBe('Files');
    });

    it('shows the Tasks tab when ?tab=tasks arrives while the page is open (back/forward, a link to the same dataset)', async () => {
        await open({});
        expect(activeTab()).toBe('Files');

        h_.route.query = { tab: 'tasks' };
        await flushPromises();

        expect(activeTab()).toBe('Tasks');
        expect(wrapper.find('.tasks-stub').exists()).toBe(true);
        // It is the address that said so: nothing is rewritten
        expect(h_.replace).not.toHaveBeenCalled();
    });

    it('keeps the query while the Tasks tab is on show, and drops it (replace, other params and hash kept) when the user switches tab', async () => {
        await open({ tab: 'tasks', other: '1' }, { hash: '#x' });
        expect(h_.replace).not.toHaveBeenCalled();

        await wrapper.findAll('[role="tab"]').find(t => t.text() === 'Files').trigger('click');
        await flushPromises();

        expect(activeTab()).toBe('Files');
        expect(h_.replace).toHaveBeenCalledTimes(1);
        expect(h_.replace).toHaveBeenCalledWith({ query: { other: '1' }, hash: '#x' });
        expect(h_.route.query).toEqual({ other: '1' });

        // Back on Tasks by hand: the address has no query to drop any more
        await wrapper.findAll('[role="tab"]').find(t => t.text() === 'Tasks').trigger('click');
        await flushPromises();
        expect(activeTab()).toBe('Tasks');
        expect(h_.replace).toHaveBeenCalledTimes(1);
    });

    it('does not rewrite the address of a page that opened without the query', async () => {
        await open({ page: '2' });
        await wrapper.findAll('[role="tab"]').find(t => t.text() === 'Tasks').trigger('click');
        await flushPromises();
        expect(h_.replace).not.toHaveBeenCalled();
    });
});

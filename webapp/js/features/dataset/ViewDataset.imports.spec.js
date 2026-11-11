/**
 * An import into the dataset runs (FR-UPL-10, FR-XC-16): the dataset page shows a banner with its progress that links to
 * the Tasks tab, the file list does not say the folder is empty, and when the import ends the list reloads. The import is read
 * from the background-task store of taskMonitor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, reactive } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, route: null, imports: [], handlers: {}, reload: null, explorerProps: null }));

vi.mock('vue-router', () => ({ useRoute: () => h_.route, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset }),
        isLoggedIn: () => true,
        getUsername: () => 'u',
        features: { value: () => null, get: () => false }
    }
}));
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: (event, fn) => { (h_.handlers[event] ||= []).push(fn); },
        off: (event, fn) => { h_.handlers[event] = (h_.handlers[event] || []).filter(f => f !== fn); },
        getImports: () => h_.imports
    },
    datasetKey: ds => ds.baseApi
}));
vi.mock('@/libs/build/buildManager', () => ({
    default: { registerDataset: vi.fn(), unregisterDataset: vi.fn(), loadBuilds: () => Promise.resolve() }
}));
vi.mock('@/composables/useDatasetListing', () => ({
    useDatasetListing: () => ({
        files: ref([]), selected: ref([]), currentPath: ref(null), isLoading: ref(false), addEntry: vi.fn(), removed: vi.fn(), reload: h_.reload
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
const ROOT = { path: 'ddb://h/acme/site', type: T.DRONEDB, size: 1, properties: { entries: 0, permissions: { canRead: true, canWrite: true } } };
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const explorer = {
    inheritAttrs: false, props: ['importing', 'dataset'],
    render() { h_.explorerProps = { importing: this.importing }; return null; }
};
const stubs = {
    FileBrowser: nothing, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub, DialogHost: nothing,
    ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer: explorer, TableView: explorer, DetailPanel: nothing
};

let wrapper;
const tasksUpdated = () => (h_.handlers.tasksUpdated || []).forEach(fn => fn({ dataset: h_.dataset }));

beforeEach(async () => {
    window.HubOptions = { appName: 'DroneDB' };
    h_.imports = [];
    h_.handlers = {};
    h_.reload = vi.fn();
    h_.route = reactive({ params: { org: 'acme', ds: 'site' }, query: {}, hash: '' });
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([ROOT])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { attachTo: document.getElementById('app'), global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
});

afterEach(() => {
    wrapper?.unmount();
    document.getElementById('app')?.remove();
});

describe('ViewDataset while an import runs', () => {
    it('shows no banner when no import runs', () => {
        expect(wrapper.find('.import-banner').exists()).toBe(false);
        expect(h_.explorerProps.importing).toBe(false);
    });

    it('shows the banner with the progress, and tells the file list that an import runs', async () => {
        h_.imports = [{ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40 }];
        tasksUpdated();
        await flushPromises();

        expect(wrapper.find('.import-banner').text()).toContain('Importing… 40 % — the files appear here when the import ends.');
        expect(wrapper.find('.import-banner').attributes('role')).toBe('status');
        expect(h_.explorerProps.importing).toBe(true);
    });

    it('links to the Tasks tab', async () => {
        h_.imports = [{ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 10 }];
        tasksUpdated();
        await flushPromises();

        await wrapper.find('.import-banner button').trigger('click');
        await flushPromises();
        expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Tasks');
    });

    it('reloads the list and drops the banner when the import ends', async () => {
        h_.imports = [{ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 90 }];
        tasksUpdated();
        await flushPromises();
        expect(h_.reload).not.toHaveBeenCalled();

        h_.imports = [];
        tasksUpdated();
        await flushPromises();

        expect(wrapper.find('.import-banner').exists()).toBe(false);
        expect(h_.explorerProps.importing).toBe(false);
        expect(h_.reload).toHaveBeenCalledTimes(1);
    });

    it('ignores the tasks of another dataset', async () => {
        h_.imports = [{ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 10 }];
        (h_.handlers.tasksUpdated || []).forEach(fn => fn({ dataset: { baseApi: 'acme/other' } }));
        await flushPromises();
        expect(wrapper.find('.import-banner').exists()).toBe(false);
    });
});

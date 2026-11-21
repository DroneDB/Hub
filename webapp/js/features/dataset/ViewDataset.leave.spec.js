/**
 * The dataset page asks before it is left while the map on its Map tab has measurements that are not saved:
 * the map keeps its measurements while another tab shows, so the question is the page's (its own dialogs), and
 * Save saves them through the map. A clean map, a reader and a move inside the page ask nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, reactive, defineComponent, h, nextTick, onMounted } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, route: null, leave: null, update: null, dialogs: null, unsaved: null, save: null }));

vi.mock('vue-router', () => ({
    useRoute: () => h_.route,
    useRouter: () => ({ replace: vi.fn(), currentRoute: { value: { fullPath: '/r/acme/site' } } }),
    onBeforeRouteLeave: fn => { h_.leave = fn; },
    onBeforeRouteUpdate: fn => { h_.update = fn; }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        Organization: () => ({ Dataset: () => h_.dataset, datasets: () => Promise.resolve([]) }),
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
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));
// The map tab, with what the page asks of it
vi.mock('@/features/viewers/map/DatasetMap.vue', async () => {
    const vue = await import('vue');
    return {
        __esModule: true,
        default: vue.defineComponent({
            setup(_, { expose }) {
                expose({
                    onTabActivated: () => {},
                    hasUnsavedMeasurements: () => h_.unsaved.value,
                    saveMeasurements: () => h_.save()
                });
                return () => null;
            }
        })
    };
});
vi.mock('./TaskHistory.vue', () => ({ default: { render: () => null } }));

const { default: ViewDataset } = await import('./ViewDataset.vue');

const T = ddb.entry.type;
const rootOf = canWrite => ({ path: 'ddb://h/acme/site', type: T.DRONEDB, size: 1, properties: { entries: 1, permissions: { canRead: true, canWrite } } });
const nothing = { inheritAttrs: false, props: ['dataset'], render: () => null };
// The page's dialogs, as its host receives them
const DialogHostStub = defineComponent({
    props: { dialogs: { type: Object, default: null } },
    setup(props) {
        h_.dialogs = props.dialogs;
        return () => h('div');
    }
});
// The tree asks for the root of the dataset when it mounts, as the real one does: its entry holds the permissions
const FileBrowserStub = defineComponent({
    inheritAttrs: false,
    props: { rootNodes: { type: Function, default: null } },
    setup(props) {
        onMounted(() => props.rootNodes?.());
        return () => h('div');
    }
});
const stubs = {
    FileBrowser: FileBrowserStub, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub, DialogHost: DialogHostStub,
    ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer: nothing, TableView: nothing, DetailPanel: nothing
};

const ROUTE = { path: '/r/acme/site', fullPath: '/r/acme/site', params: { org: 'acme', ds: 'site' } };
const ELSEWHERE = { path: '/r/acme/other', fullPath: '/r/acme/other', params: { org: 'acme', ds: 'other' } };

let wrapper;
async function open({ canWrite = true, mapTab = true } = {}) {
    h_.route = reactive({ params: { org: 'acme', ds: 'site' }, query: {}, hash: '' });
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([rootOf(canWrite)])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { attachTo: document.getElementById('app'), global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
    if (mapTab) {
        await wrapper.findAll('[role="tab"]').find(t => t.text() === 'Map').trigger('click');
        await flushPromises();
    }
}
const question = () => h_.dialogs.stack.value.at(-1);

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    h_.unsaved = ref(true);
    h_.save = vi.fn(async () => { h_.unsaved.value = false; });
    h_.leave = null;
    h_.update = null;
});

afterEach(() => {
    wrapper?.unmount();
    document.getElementById('app')?.remove();
});

describe('ViewDataset leaving with unsaved measurements on the map', () => {
    it('asks first, naming the measurements, and Cancel stays', async () => {
        await open();
        const answer = h_.leave(ELSEWHERE, ROUTE);
        await nextTick();
        expect(question().props).toMatchObject({
            title: 'Unsaved measurements',
            message: 'The measurements on the map are not saved. Save them before you leave?',
            confirmText: 'Save', secondaryText: 'Discard', cancelText: 'Cancel'
        });
        h_.dialogs.close(question().id, 'cancel');
        expect(await answer).toBe(false);
        expect(h_.save).not.toHaveBeenCalled();
    });

    it('Save saves them through the map, then leaves', async () => {
        await open();
        const answer = h_.leave(ELSEWHERE, ROUTE);
        await nextTick();
        h_.dialogs.close(question().id, 'confirm');
        expect(await answer).toBe(true);
        expect(h_.save).toHaveBeenCalledTimes(1);
    });

    it('Discard leaves without saving', async () => {
        await open();
        const answer = h_.leave(ELSEWHERE, ROUTE);
        await nextTick();
        h_.dialogs.close(question().id, 'secondary');
        expect(await answer).toBe(true);
        expect(h_.save).not.toHaveBeenCalled();
    });

    it('asks for another dataset of the same page too', async () => {
        await open();
        const answer = h_.update(ELSEWHERE, ROUTE);
        await nextTick();
        expect(question().props.title).toBe('Unsaved measurements');
        h_.dialogs.close(question().id, 'secondary');
        expect(await answer).toBe(true);
    });

    it('does not ask for a change of the query of the same page (?tab=)', async () => {
        await open();
        expect(await h_.update({ ...ROUTE, fullPath: '/r/acme/site?tab=tasks' }, ROUTE)).toBe(true);
        expect(h_.dialogs.stack.value).toHaveLength(0);
    });

    it('asks nothing when the measurements are saved, when the map was never opened, and for a reader', async () => {
        await open();
        h_.unsaved.value = false;
        expect(await h_.leave(ELSEWHERE, ROUTE)).toBe(true);
        wrapper.unmount();
        document.getElementById('app')?.remove();

        h_.unsaved = ref(true);
        await open({ mapTab: false });
        expect(await h_.leave(ELSEWHERE, ROUTE)).toBe(true);
        wrapper.unmount();
        document.getElementById('app')?.remove();

        await open({ canWrite: false });
        expect(await h_.leave(ELSEWHERE, ROUTE)).toBe(true);
        expect(h_.dialogs.stack.value).toHaveLength(0);
    });
});

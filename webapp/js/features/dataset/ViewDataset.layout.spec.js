/**
 * The dataset page follows the window (FR-EXP-29, FR-XC-20): one decision, below `sm` (575.98 px), picks the phone
 * layout (the tree in a Browser tab, the detail in a Properties tab, the splitter's first pane hidden), and a phone
 * that rotates or a window resized across `sm` keeps the tabs, the Map and the opened tabs: the second pane is never
 * rendered again. Below `lg` (991.98 px) the detail panel is a drawer (FR-EXP-17): Escape closes it, and a selection
 * does not open it again once the user closed it (its Details button does); from `lg` it follows the selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { ref, h, toRaw, defineComponent, onMounted, onUnmounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const h_ = vi.hoisted(() => ({ dataset: null, selected: null, explorerAttrs: null, panelProps: null, maps: { mounted: 0, unmounted: 0 } }));

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'acme', ds: 'site' } }) }));
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
    useDatasetActions: () => ({ showError: vi.fn(), confirmBuild: vi.fn(), move: vi.fn(), upload: vi.fn(), remove: vi.fn() })
}));
vi.mock('@/composables/useDialogs', async () => {
    const { shallowRef } = await import('vue');
    return { useDialogs: () => ({ stack: shallowRef([]), open: vi.fn(), close: vi.fn(), isOpen: () => false }) };
});
vi.mock('@/composables/useDatasetClipboard', () => ({ useDatasetClipboard: () => ({}) }));
vi.mock('@/composables/useOpenItem', () => ({ useOpenItem: () => ({ openItem: vi.fn() }) }));
vi.mock('@/composables/useDatasetShortcuts', () => ({ useDatasetShortcuts: vi.fn() }));
vi.mock('@/composables/useBuildEvents', () => ({ useBuildEvents: () => ({ watchBuildEvents: vi.fn(), handleBuildStarted: vi.fn(), handleBuildError: vi.fn() }) }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn() }) }));
vi.mock('@/features/viewers/splat/useSplatDownloads', () => ({ useSplatDownloads: () => ({ download: vi.fn() }) }));
vi.mock('@/composables/useViewActions', () => ({ useViewActions: () => ({ rename: vi.fn(), remove: vi.fn() }) }));
// The Map counts its instances: it is never rendered again when the layout changes
vi.mock('@/features/viewers/map/DatasetMap.vue', async () => {
    const vue = await import('vue');
    return {
        __esModule: true,
        default: vue.defineComponent({
            inheritAttrs: false,
            setup(_, { expose }) {
                expose({ onTabActivated: () => {}, onPanelResized: () => {} });
                vue.onMounted(() => { h_.maps.mounted++; });
                vue.onUnmounted(() => { h_.maps.unmounted++; });
                return () => vue.h('div', { class: 'map-stub' });
            }
        })
    };
});
vi.mock('./TaskHistory.vue', () => ({ default: { render: () => null } }));

const { default: ViewDataset } = await import('./ViewDataset.vue');
const { default: TabSwitcher } = await import('./TabSwitcher.vue');

const T = ddb.entry.type;
const file = name => ({ label: name, path: `ddb://h/acme/site/${name}`, selected: true, entry: { path: name, type: T.GEORASTER, size: 1 } });
const ROOT = { path: 'ddb://h/acme/site', type: T.DRONEDB, size: 1, properties: { entries: 1, permissions: { canRead: true, canWrite: true } } };

// ---- The window: matchMedia of the max-width queries of libs/responsiveColumns.js, resizable --------------------

let width = 1280;
const queries = [];
const matches = query => width <= Number(/max-width:\s*([\d.]+)px/.exec(query)[1]);
function fakeMatchMedia(query) {
    const media = { query, matches: matches(query), listeners: [] };
    media.addEventListener = (_, fn) => media.listeners.push(fn);
    media.removeEventListener = (_, fn) => { media.listeners = media.listeners.filter(l => l !== fn); };
    queries.push(media);
    return media;
}
async function resizeTo(w) {
    width = w;
    for (const media of queries) {
        const now = matches(media.query);
        if (now === media.matches) continue;
        media.matches = now;
        media.listeners.slice().forEach(fn => fn({ matches: now }));
    }
    await flushPromises();
}

// ---- The page, with the real panel and tabs; the list, the tree and the detail panel are stubs --------------------

let trees = 0;
const FileBrowser = defineComponent({
    inheritAttrs: false,
    props: { rootNodes: { type: Function, default: null } },
    setup(props) {
        onMounted(() => { trees++; props.rootNodes?.(); });
        onUnmounted(() => { trees--; });
        return () => h('div', { class: 'browser' });
    }
});
const Explorer = defineComponent({ inheritAttrs: false, setup(_, { attrs }) { h_.explorerAttrs = attrs; return () => h('div', { class: 'explorer-stub' }); } });
const DetailPanel = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) { h_.panelProps = attrs; return () => h('div', { class: 'panel-stub' }, [h('button', { class: 'in-panel' }, 'Open')]); }
});
const nothing = { inheritAttrs: false, props: ['dataset', 'dialogs'], render: () => null };
const stubs = {
    FileBrowser, Message: nothing, Loader: nothing, RouterLink: RouterLinkStub,
    DialogHost: nothing, ClipboardPanel: nothing, DatasetLightbox: nothing, Explorer, TableView: Explorer, DetailPanel
};

let wrapper;
async function open(at) {
    width = at;
    h_.dataset = { baseApi: 'acme/site', info: vi.fn(() => Promise.resolve([ROOT])), metaGet: vi.fn(() => Promise.resolve([])) };
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div>');
    wrapper = mount(ViewDataset, { attachTo: document.getElementById('app'), global: { stubs, plugins: [createPinia(), PrimeVue] } });
    await flushPromises();
}
const tabLabels = () => wrapper.findAll('[role="tab"]').map(t => t.text());
const select = async f => {
    h_.selected.value = [f];
    h_.explorerAttrs.onSelectionChanged(f);
    await vi.waitFor(() => expect(toRaw(h_.panelProps?.file)).toBe(f));
    await flushPromises();
};
const escape = async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushPromises();
};

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
    setActivePinia(createPinia());
    window.HubOptions = { appName: 'DroneDB' };
    window.matchMedia = vi.fn(fakeMatchMedia);
    queries.length = 0;
    trees = 0;
    h_.selected = ref([]);
    h_.panelProps = null;
    h_.maps.mounted = 0;
    h_.maps.unmounted = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
});

describe('ViewDataset follows the window across sm (FR-EXP-29)', () => {
    it('at 390 px: Browser, Files, Properties, Map, Tasks; the splitter collapsed, no sidebar tree', async () => {
        await open(390);
        expect(tabLabels()).toEqual(['Browser', 'Files', 'Properties', 'Map', 'Tasks']);
        expect(wrapper.find('.p-splitter').classes()).toContain('panel-collapsed');
        // the only tree is the Browser tab's: no empty first pane with a tree of its own
        expect(wrapper.find('.p-splitterpanel').find('.browser').exists()).toBe(false);
        expect(trees).toBe(1);
    });

    it('at 844 px: Files, Map, Tasks and the tree in the first pane', async () => {
        await open(844);
        expect(tabLabels()).toEqual(['Files', 'Map', 'Tasks']);
        expect(wrapper.find('.p-splitter').classes()).not.toContain('panel-collapsed');
        expect(wrapper.find('.p-splitterpanel').find('.browser').exists()).toBe(true);
    });

    it('keeps the tabs, the Map, an opened tab and the tab on show from 390 to 844 px and back', async () => {
        await open(390);
        const tabs = wrapper.findComponent(TabSwitcher);
        const tabsElement = tabs.element;
        // the Map opened, a viewer tab opened, the Map on show
        tabs.vm.activateTab('map');
        await flushPromises();
        await vi.waitFor(() => expect(h_.maps.mounted).toBe(1));
        tabs.vm.addTab({ key: 'viewer', label: 'photo.jpg', component: { render: () => h('p', { class: 'viewer-stub' }) } }, { activate: false });
        await flushPromises();
        const viewer = wrapper.find('.viewer-stub').element;
        expect(tabs.vm.activeTab).toBe('map');

        await resizeTo(844);
        expect(tabLabels()).toEqual(['Files', 'Map', 'Tasks', 'photo.jpg']);
        expect(wrapper.find('.p-splitter').classes()).not.toContain('panel-collapsed');
        expect(wrapper.findComponent(TabSwitcher).element === tabsElement).toBe(true);
        expect(wrapper.find('.viewer-stub').element === viewer).toBe(true);
        expect(wrapper.findComponent(TabSwitcher).vm.activeTab).toBe('map');
        expect(wrapper.find('.p-splitterpanel').find('.browser').exists()).toBe(true);

        await resizeTo(390);
        expect(tabLabels()).toEqual(['Browser', 'Files', 'Properties', 'Map', 'Tasks', 'photo.jpg']);
        expect(wrapper.find('.p-splitter').classes()).toContain('panel-collapsed');
        expect(wrapper.findComponent(TabSwitcher).element === tabsElement).toBe(true);
        expect(wrapper.find('.viewer-stub').element === viewer).toBe(true);
        expect(h_.maps).toEqual({ mounted: 1, unmounted: 0 });
    });

    it('shows Files when the window grows past sm on the Browser tab, which leaves', async () => {
        await open(390);
        expect(wrapper.findComponent(TabSwitcher).vm.activeTab).toBe('filebrowser');
        await resizeTo(844);
        expect(wrapper.findComponent(TabSwitcher).vm.activeTab).toBe('explorer');
    });
});

describe('ViewDataset detail drawer below lg (FR-EXP-17)', () => {
    it('at 820 px: Escape closes the drawer, the next selection does not open it again, Details does', async () => {
        await open(820);
        const [a, b] = [file('a.tif'), file('b.tif')];
        await select(a);
        expect(wrapper.find('.detail-side .panel-stub').exists()).toBe(true);
        expect(wrapper.find('.detail-reopen').exists()).toBe(false);

        await escape();
        expect(wrapper.find('.detail-side').exists()).toBe(false);
        const details = wrapper.find('.detail-reopen');
        expect(details.text()).toBe('Details');

        // another selection: the drawer stays closed and follows it
        h_.selected.value = [b];
        h_.explorerAttrs.onSelectionChanged(b);
        await new Promise(resolve => setTimeout(resolve, 300));
        await flushPromises();
        expect(wrapper.find('.detail-side').exists()).toBe(false);

        await details.trigger('click');
        expect(wrapper.find('.detail-side .panel-stub').exists()).toBe(true);
        expect(toRaw(h_.panelProps.file)).toBe(b);
    });

    it('at 820 px: its close button closes it the same way', async () => {
        await open(820);
        const [a, b] = [file('a.tif'), file('b.tif')];
        await select(a);
        h_.panelProps.onClose();
        await flushPromises();
        expect(wrapper.find('.detail-side').exists()).toBe(false);
        h_.selected.value = [b];
        h_.explorerAttrs.onSelectionChanged(b);
        await new Promise(resolve => setTimeout(resolve, 300));
        await flushPromises();
        expect(wrapper.find('.detail-side').exists()).toBe(false);
        expect(wrapper.find('.detail-reopen').exists()).toBe(true);
    });

    it('at 1280 px: Escape leaves the column, and after its close button the next selection opens it again', async () => {
        await open(1280);
        const [a, b] = [file('a.tif'), file('b.tif')];
        await select(a);
        await escape();
        expect(wrapper.find('.detail-side .panel-stub').exists()).toBe(true);
        h_.panelProps.onClose();
        await flushPromises();
        expect(wrapper.find('.detail-side').exists()).toBe(false);
        h_.panelProps = null;
        await select(b);
        expect(wrapper.find('.detail-side .panel-stub').exists()).toBe(true);
        expect(wrapper.find('.detail-reopen').exists()).toBe(false);
    });
});

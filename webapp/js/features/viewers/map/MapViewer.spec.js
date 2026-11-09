/**
 * The map viewer end to end, below the map: the real router, the real view and layer
 * composables on a fake dataset, and a MapCore stub that shows what it is given and says what a
 * map says. A new view of a file, a saved view, the entry parameters, the view bar, the title,
 * what the map reports, and a route that names another view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, reactive, isProxy, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import { b64encode, b64urlEncode } from '@/libs/base64';
import { buildEntryState, defaultState } from '@/libs/views/viewState';

const T = ddb.entry.type;
const ctx = vi.hoisted(() => ({ dataset: null, setTitle: vi.fn(), mapMounts: 0 }));
const notify = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), success: vi.fn() }));
const dialogs = vi.hoisted(() => ({ open: vi.fn(), stack: { value: [] } }));

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { Organization: () => ({ Dataset: () => ctx.dataset }), getUsername: () => 'user' } }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isLoggedIn: false, isAdmin: false }) }));
vi.mock('@/stores/datasetSession', () => ({ useDatasetSessionStore: () => ({ setSelectedFiles: vi.fn() }) }));
vi.mock('@/libs/utils', async importOriginal => ({ ...(await importOriginal()), setTitle: ctx.setTitle }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/composables/useDialogs', () => ({ useDialogs: () => dialogs }));
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: vi.fn().mockResolvedValue({ available: true }) } }));
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));
vi.mock('@/components/TextPromptDialog.vue', () => ({ default: { name: 'TextPromptDialog' } }));
vi.mock('@/components/FolderPicker.vue', () => ({ default: { name: 'FolderPicker' } }));

const { createAppRouter } = await import('@/router');

// ---- Fakes -------------------------------------------------------------------------------------

const rasterEntry = (path, hash = `h-${path}`) => ({ path, type: T.GEORASTER, hash });
const vectorEntry = path => ({ path, type: T.VECTOR, hash: `h-${path}` });
const base = path => ({ path, hash: `h-${path}` });
const enc = path => b64urlEncode(path);
const fileUrl = (path, search = '') => `/r/acme/site/view/${b64encode(path)}/map${search}`;

/** A dataset whose meta list `views` behaves like the server's. */
function fakeDataset({ items = [], missing = [], canWrite = true } = {}) {
    let seq = 100;
    const ds = {
        org: 'acme',
        ds: 'site',
        items: items.map(i => ({ ...i })),
        missing: new Set(missing),
        remoteUri: path => `ddb://acme/site/${path}`,
        listOne: vi.fn(async path => {
            if (ds.missing.has(path)) throw new Error(`Cannot find: ${path}.`);
            return path.endsWith('.geojson') ? vectorEntry(path) : rasterEntry(path);
        }),
        info: vi.fn(async () => [{ path: '', properties: { permissions: { canRead: true, canWrite, canDelete: canWrite } } }]),
        metaGet: vi.fn(async () => {
            if (!ds.items.length) throw Object.assign(new Error('No metadata found'), { status: 404 });
            return ds.items.map(i => ({ ...i, data: JSON.stringify(i.data) }));
        }),
        metaAdd: vi.fn(async (key, data) => {
            const item = { id: `m${++seq}`, mtime: 2000 + seq, data };
            ds.items.push(item);
            return item;
        }),
        metaRemove: vi.fn(async id => {
            ds.items = ds.items.filter(i => i.id !== id);
            return { count: 1 };
        })
    };
    return ds;
}

const savedItem = (uid, name, state, id = 'm1') => ({
    id, mtime: 1000, data: { ...state, uid, name, createdBy: 'a', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }
});
const twoLayers = () => buildEntryState(base('f/a.tif'), ['f/b.tif'], { baseIsGeoraster: true });

/** MapCore as the viewer sees it: it shows its props and emits what the viewer listens for. */
const MapCoreStub = defineComponent({
    name: 'MapCore',
    props: {
        files: { type: Array, default: () => [] }, view: { type: Object, default: null }, changedPaths: { type: Array, default: () => [] },
        dataset: { type: Object, default: null }, standalone: Boolean, canWrite: Boolean, canDelete: Boolean, canAddLayers: Boolean,
        addLayerDisabled: Boolean, addLayerTitle: { type: String, default: '' }, linkTarget: { type: Object, default: null },
        shareNote: Boolean, canSave: Boolean
    },
    emits: ['update:view', 'addLayer', 'removeLayer', 'repick', 'save'],
    setup() {
        onMounted(() => { ctx.mapMounts++; });
        return () => h('div', { 'data-stub': 'map' });
    }
});

const Host = defineComponent({ render: () => h(RouterView, { name: 'content' }) });

let wrapper;
let router;

/** Opens the viewer on an address, as a page load. `history` is what the history entry holds for it (a reload). */
async function open(url, { dataset = fakeDataset(), embed = false, history = null } = {}) {
    ctx.dataset = dataset;
    window.history.replaceState({ ...(history ? { mapView: history } : {}) }, '', url);
    router = createAppRouter(embed);
    wrapper = mount(Host, { global: { plugins: [router, PrimeVue], provide: { embed } }, attachTo: document.body });
    await router.isReady();
    await settle();
    return dataset;
}
const settle = async () => {
    for (let i = 0; i < 5; i++) await flushPromises();
};
const map = () => wrapper.findComponent(MapCoreStub);
const mapProps = () => map().props();
const viewBar = () => wrapper.find('[role="toolbar"][aria-label="View"]');
const barButton = label => viewBar().findAll('button').find(b => b.text() === label);
const held = () => window.history.state.mapView;
const titles = () => ctx.setTitle.mock.calls.map(c => c[0]);
/** Answers the next dialog the viewer opens (a name, a picked file) */
const answerWith = (...answers) => answers.forEach(a => dialogs.open.mockResolvedValueOnce(a));
const dialogTitles = () => dialogs.open.mock.calls.map(c => c[1].title);

let consoleError;
beforeEach(() => {
    ctx.mapMounts = 0;
    ctx.setTitle.mockClear();
    dialogs.open.mockReset();
    Object.values(notify).forEach(f => f.mockClear());
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    consoleError.mockRestore();
    window.history.replaceState({}, '', '/');
});

// The MapCore stub replaces the real one wherever the viewer imports it
vi.mock('./MapCore.vue', () => ({ default: MapCoreStub }));

// ---- Routes ------------------------------------------------------------------------------------

describe('the routes', () => {
    it('map the file and the saved view to the map viewer, and have no compare route', () => {
        const r = createAppRouter(true);
        expect(r.resolve('/r/acme/site/view/Zi50aWY=/map').name).toBe('MapViewer');
        expect(r.resolve('/r/acme/site/views/v_k3j9x2ab').name).toBe('SavedView');
        expect(r.resolve('/r/acme/site/views/v_k3j9x2ab').meta.title).toBe('Map');
        expect(r.resolve('/r/acme/site/compare').name).toBe('NotFound');
        expect(r.getRoutes().some(route => /compare/i.test(route.path) || /compare/i.test(String(route.name)))).toBe(false);
    });
});

// ---- A new view of a file ----------------------------------------------------------------------

describe('MapViewer on a file', () => {
    it('opens a new view of the file: its layer, the bar with its name and Save, and the title', async () => {
        await open(fileUrl('f/a.tif'));
        expect(mapProps().view).toEqual(defaultState(base('f/a.tif'), { baseIsGeoraster: true }));
        expect(mapProps().files.map(f => f.entry.path)).toEqual(['f/a.tif']);
        expect(mapProps().dataset.ds).toBe('site');
        expect(mapProps().standalone).toBe(true);
        expect(mapProps().linkTarget).toEqual({ path: 'f/a.tif' });
        expect(mapProps().shareNote).toBe(false);
        expect(viewBar().text()).toContain('a.tif');
        expect(barButton('Save')).toBeDefined();
        expect(barButton('Save as new')).toBeUndefined();
        expect(titles().at(-1)).toBe('a.tif - Map');
    });

    it('gives the map what a writer may do, and a reader nothing', async () => {
        await open(fileUrl('f/a.tif'));
        expect(mapProps()).toMatchObject({ canWrite: true, canDelete: true, canSave: true, canAddLayers: true });
        wrapper.unmount();
        await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ canWrite: false }) });
        expect(mapProps()).toMatchObject({ canWrite: false, canDelete: false, canSave: false });
        expect(viewBar().exists()).toBe(true);
        expect(viewBar().findAll('button')).toHaveLength(0);
    });

    it('starts from the add values in order, split, and takes add off the address', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}&add=${enc('g/c.tif')}&keep=1`));
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif', 'g/c.tif']);
        expect(mapProps().view.split.enabled).toBe(true);
        // Bottom first
        expect(mapProps().files.map(f => f.entry.path)).toEqual(['g/c.tif', 'f/b.tif', 'f/a.tif']);
        expect(window.location.search).toBe('?keep=1');
    });

    it('shows the not found state of a file that is not there, with a link back to the dataset and the title of the state', async () => {
        await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ missing: ['f/a.tif'] }) });
        expect(map().exists()).toBe(false);
        expect(wrapper.find('h1').text()).toBe('File not found');
        expect(wrapper.text()).toContain('"f/a.tif" does not exist.');
        const back = wrapper.findAll('.resource-state a').find(a => a.text().includes('Back to the dataset'));
        expect(back.attributes('href')).toBe('/r/acme/site');
        expect(titles()).not.toContain('Map - undefined');
        expect(titles().every(t => !t.endsWith('- Map'))).toBe(true);
    });

    it('does not mount the map until every layer is resolved', async () => {
        const dataset = fakeDataset();
        let release;
        const listOne = dataset.listOne.getMockImplementation();
        dataset.listOne.mockImplementation(path => (path === 'f/b.tif' ? new Promise(resolve => { release = () => resolve(rasterEntry(path)); }) : listOne(path)));
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`), { dataset });
        expect(map().exists()).toBe(false);
        release();
        await settle();
        expect(mapProps().files).toHaveLength(2);
        expect(ctx.mapMounts).toBe(1);
    });
});

// ---- A saved view ------------------------------------------------------------------------------

describe('MapViewer on a saved view', () => {
    const saved = () => fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] });

    it('opens the saved view: its layers, its name in the bar and the title, Save and Save as new', async () => {
        await open('/r/acme/site/views/v_k3j9x2ab', { dataset: saved() });
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
        expect(mapProps().linkTarget).toEqual({ uid: 'v_k3j9x2ab' });
        expect(viewBar().text()).toContain('Ortho over DSM');
        expect(barButton('Save')).toBeDefined();
        expect(barButton('Save as new')).toBeDefined();
        expect(titles().at(-1)).toBe('Ortho over DSM - Map');
    });

    it('shows the name as text', async () => {
        const name = '<img src=x onerror=alert(1)>';
        await open('/r/acme/site/views/v_x', { dataset: fakeDataset({ items: [savedItem('v_x', name, twoLayers())] }) });
        expect(viewBar().find('img').exists()).toBe(false);
        expect(viewBar().find('.view-name').text()).toBe(name);
        expect(titles().at(-1)).toBe(`${name} - Map`);
    });

    it('shows the error of a view that does not exist, with a link back to the dataset and the title of the route', async () => {
        await open('/r/acme/site/views/v_doesnotex', { dataset: saved() });
        expect(map().exists()).toBe(false);
        expect(wrapper.text()).toContain('This view does not exist. It may have been deleted.');
        expect(wrapper.find('a').attributes('href')).toBe('/r/acme/site');
        expect(titles().every(t => !t.endsWith('- Map'))).toBe(true);
    });

    it('shows the error of a view that cannot be opened', async () => {
        const broken = { ...twoLayers(), layers: [{ ...twoLayers().layers[0], path: '../x.tif' }] };
        await open('/r/acme/site/views/v_bad', { dataset: fakeDataset({ items: [savedItem('v_bad', 'Bad', broken)] }) });
        expect(map().exists()).toBe(false);
        expect(wrapper.text()).toContain('This view cannot be opened');
    });

    it('marks the layers whose file changed since the view was saved', async () => {
        const dataset = saved();
        dataset.listOne.mockImplementation(async path => rasterEntry(path, path === 'f/a.tif' ? 'newer' : `h-${path}`));
        await open('/r/acme/site/views/v_k3j9x2ab', { dataset });
        expect(mapProps().changedPaths).toEqual(['f/a.tif']);
    });
});

// ---- Viewer only -------------------------------------------------------------------------------

describe('MapViewer in Viewer only', () => {
    it('has no view bar and nothing to save', async () => {
        await open('/r/acme/site/views/v_k3j9x2ab?embed=1', {
            embed: true, dataset: fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] })
        });
        expect(map().exists()).toBe(true);
        expect(viewBar().exists()).toBe(false);
        expect(mapProps().canSave).toBe(false);
    });

    it('does not open the picker for pick=1', async () => {
        await open(fileUrl('f/a.tif', '?pick=1&embed=1'), { embed: true });
        expect(dialogs.open).not.toHaveBeenCalled();
    });
});

// ---- Compare to... -----------------------------------------------------------------------------

describe('MapViewer with pick=1', () => {
    it('opens the picker once the map shows, and turns the split on with the first layer picked', async () => {
        answerWith({ path: 'f/b.tif' });
        await open(fileUrl('f/a.tif', '?pick=1'));
        expect(dialogTitles()).toEqual(['Add layer']);
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/b.tif', 'f/a.tif']);
        expect(mapProps().view.split.enabled).toBe(true);
        expect(window.location.search).toBe('');
    });

    it('opens it once: a cancelled picker is not asked again, and a reload does not open it', async () => {
        answerWith(null);
        await open(fileUrl('f/a.tif', '?pick=1'));
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/a.tif']);
        // A later Add layer does not split
        answerWith({ path: 'f/b.tif' });
        map().vm.$emit('addLayer');
        await settle();
        expect(mapProps().view.split.enabled).toBe(false);
        // Reload: the address has no pick, the history entry holds the view
        const state = held();
        wrapper.unmount();
        dialogs.open.mockClear();
        await open(`${window.location.pathname}`, { history: state });
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/b.tif', 'f/a.tif']);
    });
});

// ---- Layers ------------------------------------------------------------------------------------

describe('MapViewer layer actions', () => {
    it('adds a picked georaster on top, near the last layer, and refuses what is not one', async () => {
        await open(fileUrl('f/a.tif'));
        answerWith({ path: 'g/c.tif' });
        map().vm.$emit('addLayer');
        await settle();
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['g/c.tif', 'f/a.tif']);
        expect(mapProps().view.split.enabled).toBe(false);
        expect(mapProps().files.map(f => f.entry.path)).toEqual(['f/a.tif', 'g/c.tif']);
        expect(dialogTitles()).toEqual(['Add layer']);
        expect(dialogs.open.mock.calls[0][1].initialPath).toBe('f');
    });

    it('adds a layer only through Add layer: the compare request the dataset map has adds nothing and does not split', async () => {
        await open(fileUrl('f/a.tif'));
        answerWith({ path: 'g/c.tif' });
        map().vm.$emit('compareLayer');
        await settle();
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/a.tif']);
        expect(mapProps().view.split.enabled).toBe(false);
    });

    it('removes a layer, and the base moves to the next one on a new view', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`));
        map().vm.$emit('removeLayer', 'f/a.tif');
        await settle();
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/b.tif']);
        expect(mapProps().view.base.path).toBe('f/b.tif');
        expect(mapProps().view.split.enabled).toBe(false);
    });

    it('picks another file for a missing layer', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`), { dataset: fakeDataset({ missing: ['f/b.tif'] }) });
        expect(mapProps().files[0].placeholder.kind).toBe('missing');
        answerWith({ path: 'g/c.tif' });
        map().vm.$emit('repick', 'f/b.tif');
        await settle();
        expect(mapProps().view.layers.map(l => l.path)).toEqual(['f/a.tif', 'g/c.tif']);
        expect(dialogTitles()).toEqual(['Pick another raster']);
    });

    it('disables Add layer at the limit and says why', async () => {
        const paths = ['f/b.tif', 'f/c.tif', 'f/d.tif', 'f/e.tif', 'f/f.tif'];
        await open(fileUrl('f/a.tif', paths.map(p => `&add=${enc(p)}`).join('').replace('&', '?')));
        expect(mapProps().view.layers).toHaveLength(6);
        expect(mapProps().addLayerDisabled).toBe(true);
        expect(mapProps().addLayerTitle).toBe('A view shows at most 6 rasters');
        expect(mapProps().canAddLayers).toBe(true);
    });

    it('does not add, remove or pick in Viewer only', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}&embed=1`), { embed: true });
        map().vm.$emit('addLayer');
        map().vm.$emit('removeLayer', 'f/b.tif');
        map().vm.$emit('repick', 'f/b.tif');
        await settle();
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(mapProps().view.layers).toHaveLength(2);
    });
});

// ---- What the map reports ----------------------------------------------------------------------

describe('MapViewer when the map reports a change', () => {
    it('keeps it as the working state, as plain data, and keeps a saved view clean for a pan only', async () => {
        await open('/r/acme/site/views/v_k3j9x2ab', { dataset: fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] }) });
        const next = reactive(JSON.parse(JSON.stringify(mapProps().view)));
        next.layers[0].opacity = 0.5;
        next.layers[0].vizParams = reactive({ colormap: 'viridis', rescale: [0, 1] });
        next.view = reactive({ center: reactive([1, 2]), zoom: 4, rotation: 0 });
        map().vm.$emit('update:view', next);
        await settle();
        expect(mapProps().view.layers[0].opacity).toBe(0.5);
        expect(held().state.layers[0].opacity).toBe(0.5);
        // The history entry cannot hold a proxy: the working state is plain data, the map's reactive objects are not kept
        const state = mapProps().view;
        for (const value of [state, state.layers[0], state.layers[0].vizParams, state.view, state.view.center]) {
            expect(isProxy(value)).toBe(false);
        }
        expect(held().state.layers[0].opacity).toBe(0.5);
        expect(viewBar().text()).toContain('Unsaved changes');
    });

    it('does not mark the view unsaved for a pan', async () => {
        await open('/r/acme/site/views/v_k3j9x2ab', { dataset: fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] }) });
        map().vm.$emit('update:view', { ...mapProps().view, view: { center: [1, 2], zoom: 4, rotation: 0 } });
        await settle();
        expect(viewBar().text()).not.toContain('Unsaved changes');
    });

    it('tells the map to say so in the Copy link panel when the link would not show the changes', async () => {
        await open(fileUrl('f/a.tif'));
        expect(mapProps().shareNote).toBe(false);
        map().vm.$emit('update:view', { ...mapProps().view, layers: [{ ...mapProps().view.layers[0], opacity: 0.3 }] });
        await settle();
        expect(mapProps().shareNote).toBe(true);
        expect(mapProps().linkTarget).toEqual({ path: 'f/a.tif' });
    });
});

// ---- Saving ------------------------------------------------------------------------------------

describe('MapViewer saving', () => {
    it('saves a new view under a name: the address, the bar and the title follow, and the map stays', async () => {
        const dataset = await open(fileUrl('f/a.tif'));
        answerWith('A');
        await barButton('Save').trigger('click');
        await settle();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Save view', label: 'Name' });
        const uid = dataset.items[0].data.uid;
        expect(dataset.items[0].data.name).toBe('A');
        expect(window.location.pathname).toBe(`/r/acme/site/views/${uid}`);
        expect(router.currentRoute.value.name).toBe('SavedView');
        expect(viewBar().text()).toContain('A');
        expect(barButton('Save as new')).toBeDefined();
        expect(mapProps().linkTarget).toEqual({ uid });
        expect(titles().at(-1)).toBe('A - Map');
        // The route changed under the page, which is the page's own move: the map is not built again
        expect(ctx.mapMounts).toBe(1);
        expect(held().identity).toBe(`view:${uid}`);
    });

    it('titles the page with the new name after Save as new', async () => {
        await open('/r/acme/site/views/v_k3j9x2ab', { dataset: fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] }) });
        answerWith('B');
        await barButton('Save as new').trigger('click');
        await settle();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Save view as', initialValue: 'Ortho over DSM (copy)' });
        expect(titles().at(-1)).toBe('B - Map');
        expect(window.location.pathname).not.toBe('/r/acme/site/views/v_k3j9x2ab');
        expect(ctx.mapMounts).toBe(1);
    });

    it('saves from the Copy link panel as from the bar', async () => {
        const dataset = await open(fileUrl('f/a.tif'));
        answerWith('A');
        map().vm.$emit('save');
        await settle();
        expect(dataset.metaAdd).toHaveBeenCalledTimes(1);
    });

    it('sets the title again after a route change of its own, which the router resets', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`));
        ctx.setTitle.mockClear();
        // A new view whose base is removed moves to the file route of the next layer: a change of path
        map().vm.$emit('removeLayer', 'f/a.tif');
        await settle();
        expect(window.location.pathname).toBe(fileUrl('f/b.tif'));
        expect(titles()).toContain('Map');
        expect(titles().at(-1)).toBe('b.tif - Map');
        expect(ctx.mapMounts).toBe(1);
        expect(held().identity).toBe('file:f/b.tif');
    });

    it('keeps its title and its working state in the history entry through a navigation of the router that keeps the page', async () => {
        await open(fileUrl('f/a.tif'));
        map().vm.$emit('update:view', { ...mapProps().view, layers: [{ ...mapProps().view.layers[0], opacity: 0.3 }] });
        await settle();
        await router.push({ path: window.location.pathname, query: { x: '1' } });
        await settle();
        expect(titles().at(-1)).toBe('a.tif - Map');
        // The router's entry knew nothing of the working state: the page writes it again
        expect(held()).toMatchObject({ identity: 'file:f/a.tif', state: { layers: [{ opacity: 0.3 }] } });
        expect(ctx.mapMounts).toBe(1);
    });
});

// ---- A route that names another view -----------------------------------------------------------

describe('MapViewer when the route names another view', () => {
    it('loads the other file, not the one it was showing', async () => {
        await open(fileUrl('f/a.tif'));
        expect(mapProps().view.base.path).toBe('f/a.tif');
        await router.push(fileUrl('g/z.tif'));
        await settle();
        expect(mapProps().view.base.path).toBe('g/z.tif');
        expect(mapProps().linkTarget).toEqual({ path: 'g/z.tif' });
        expect(titles().at(-1)).toBe('z.tif - Map');
        expect(ctx.mapMounts).toBe(2);
    });

    it('loads a saved view from a file, and a file from a saved view', async () => {
        await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ items: [savedItem('v_k3j9x2ab', 'Ortho over DSM', twoLayers())] }) });
        await router.push('/r/acme/site/views/v_k3j9x2ab');
        await settle();
        expect(mapProps().linkTarget).toEqual({ uid: 'v_k3j9x2ab' });
        expect(viewBar().text()).toContain('Ortho over DSM');
        expect(titles().at(-1)).toBe('Ortho over DSM - Map');
        await router.push(fileUrl('g/z.tif'));
        await settle();
        expect(mapProps().linkTarget).toEqual({ path: 'g/z.tif' });
        expect(viewBar().text()).toContain('z.tif');
        expect(barButton('Save as new')).toBeUndefined();
    });

    it('shows the error of an unknown view after a file, and the file after the error', async () => {
        await open(fileUrl('f/a.tif'));
        await router.push('/r/acme/site/views/v_doesnotex');
        await settle();
        expect(map().exists()).toBe(false);
        expect(wrapper.text()).toContain('This view does not exist.');
        await router.push(fileUrl('f/a.tif'));
        await settle();
        expect(map().exists()).toBe(true);
        expect(wrapper.text()).not.toContain('This view does not exist.');
    });

    it('does not take the working state of one view for another', async () => {
        await open(fileUrl('f/a.tif'));
        map().vm.$emit('update:view', { ...mapProps().view, layers: [{ ...mapProps().view.layers[0], opacity: 0.3 }] });
        await settle();
        await router.push(fileUrl('g/z.tif'));
        await settle();
        expect(mapProps().view.layers[0].opacity).toBe(1);
        expect(held().identity).toBe('file:g/z.tif');
    });
});

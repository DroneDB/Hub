import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, reactive, shallowRef, nextTick } from 'vue';
import ddb from 'ddb';
import { b64encode, b64urlEncode } from '@/libs/base64';
import { defaultState, buildEntryState, newLayer, MAX_VIEWS } from '@/libs/views/viewState';
import { removeLayer, addLayer } from '@/libs/views/layerRules';
import { permissionsOf } from '@/libs/datasetPermissions';

const ctx = vi.hoisted(() => ({ route: null, dataset: null }));
const notify = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), success: vi.fn() }));

// The page's leave guard (useLeaveGuard), kept to be called as the router would
const guards = vi.hoisted(() => ({ leave: null, update: null }));
vi.mock('vue-router', async importOriginal => ({
    ...(await importOriginal()),
    useRoute: () => ctx.route,
    onBeforeRouteLeave: fn => { guards.leave = fn; },
    onBeforeRouteUpdate: fn => { guards.update = fn; }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { Organization: () => ({ Dataset: () => ctx.dataset }), getUsername: () => 'user' } }));
vi.mock('@/stores/datasetSession', () => ({ useDatasetSessionStore: () => ({ setSelectedFiles: vi.fn() }) }));
vi.mock('@/libs/utils', () => ({ setTitle: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));
vi.mock('@/components/TextPromptDialog.vue', () => ({ default: { name: 'TextPromptDialog' } }));

const { useSavedView, routeIdentity, HISTORY_KEY } = await import('./useSavedView');

const T = ddb.entry.type;
const rasterEntry = (path, hash = `h-${path}`) => ({ path, type: T.GEORASTER, hash });
const vectorEntry = path => ({ path, type: T.VECTOR, hash: `h-${path}` });
const base = path => ({ path, hash: `h-${path}` });
const enc = path => b64urlEncode(path);

/** A dataset whose meta list `views` behaves like the server's, and whose files are georasters unless they say otherwise. */
function fakeDataset({ items = [], missing = [], canWrite = true, canDelete = canWrite } = {}) {
    let seq = 100;
    const ds = {
        items: items.map(i => ({ ...i })),
        missing: new Set(missing),
        remoteUri: path => `ddb://o/d/${path}`,
        listOne: vi.fn(async path => {
            if (ds.missing.has(path)) throw new Error(`Cannot find: ${path}.`);
            return path.endsWith('.geojson') ? vectorEntry(path) : rasterEntry(path);
        }),
        info: vi.fn(async () => [{ path: '', properties: { permissions: { canRead: true, canWrite, canDelete } } }]),
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

// ---- A router that moves the address and the route like the real one -------------------------

function setRoute(route, url) {
    const [pathAndQuery] = url.split('#');
    const [path, search = ''] = pathAndQuery.split('?');
    const query = {};
    for (const [k, v] of new URLSearchParams(search)) query[k] = k in query ? [].concat(query[k], v) : v;
    const file = path.match(/^\/r\/([^/]+)\/([^/]+)\/view\/([^/]+)\/map$/);
    const view = path.match(/^\/r\/([^/]+)\/([^/]+)\/views\/([^/]+)$/);
    route.params = file ? { org: file[1], ds: file[2], encodedPath: decodeURIComponent(file[3]) } : { org: view[1], ds: view[2], uid: view[3] };
    route.query = query;
    route.fullPath = url;
}

function fakeRouter(route) {
    return {
        replace: vi.fn(async location => {
            const search = new URLSearchParams();
            for (const [k, v] of Object.entries(location.query || {})) [].concat(v).forEach(x => search.append(k, x));
            const url = `${location.path}${search.toString() ? `?${search}` : ''}${location.hash || ''}`;
            window.history.replaceState({ ...window.history.state, ...location.state, current: url }, '', url);
            setRoute(route, url);
        })
    };
}

let scope;
let route;
let router;
let dialogs;

/**
 * Opens the viewer on an address. `history` is what the browser history entry holds for it
 * (a reload); `ready` waits for the load.
 */
async function open(url, { dataset = fakeDataset(), history = null, embed = false, hashOf = null } = {}) {
    ctx.dataset = dataset;
    window.history.replaceState({ current: url, ...(history ? { [HISTORY_KEY]: history } : {}) }, '', url);
    route = reactive({ params: {}, query: {}, fullPath: '' });
    setRoute(route, url);
    ctx.route = route;
    router = fakeRouter(route);
    dialogs = { open: vi.fn() };
    let view;
    scope = effectScope();
    scope.run(() => { view = useSavedView({ route, router, dialogs, embed, hashOf }); });
    await view.loaded;
    return { view, dataset };
}
const fileUrl = (path, search = '', hash = '') => `/r/o/d/view/${b64encode(path)}/map${search}${hash}`;
const viewUrl = (uid, search = '') => `/r/o/d/views/${uid}${search}`;
const held = () => window.history.state[HISTORY_KEY];

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
});

describe('routeIdentity', () => {
    it('names a saved view by its uid and a file by its decoded path', () => {
        expect(routeIdentity({ params: { uid: 'v_1' } })).toBe('view:v_1');
        expect(routeIdentity({ params: { encodedPath: b64encode('f/é.tif') } })).toBe('file:f/é.tif');
    });

    it('is empty for a route that names neither, or a path that cannot be decoded', () => {
        expect(routeIdentity({ params: {} })).toBe('');
        expect(routeIdentity({ params: { encodedPath: '***' } })).toBe('');
    });
});

describe('useSavedView file route', () => {
    it('opens a georaster as itself: one layer, the file name as the name, a new view', async () => {
        const { view } = await open(fileUrl('f/a.tif'));
        expect(view.error.value).toBe('');
        expect(view.loading.value).toBe(false);
        expect(view.state.value).toEqual(defaultState(base('f/a.tif'), { baseIsGeoraster: true }));
        expect(view.isNew.value).toBe(true);
        expect(view.saved.value).toBeNull();
        expect(view.name.value).toBe('a.tif');
        expect(view.pageTitle.value).toBe('a.tif - Map');
        expect(view.identity.value).toBe('file:f/a.tif');
        expect(view.linkTarget.value).toEqual({ path: 'f/a.tif' });
        expect(view.baseEntry.value).toEqual(rasterEntry('f/a.tif'));
        expect(view.canWrite.value).toBe(true);
        expect(view.dirty.value).toBe(false);
        expect(view.shareNote.value).toBe(false);
    });

    it('opens a file that is not a georaster with no layers', async () => {
        const { view } = await open(fileUrl('v/z.geojson'));
        expect(view.state.value.layers).toEqual([]);
        expect(view.state.value.base.path).toBe('v/z.geojson');
        expect(view.baseEntry.value.type).toBe(T.VECTOR);
    });

    it('shows the error of a file that is not there, with no view', async () => {
        const { view } = await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ missing: ['f/a.tif'] }) });
        expect(view.error.value).toBe('Cannot find: f/a.tif.');
        expect(view.state.value).toBeNull();
        expect(view.pageTitle.value).toBeNull();
    });

    it('starts split with the files of the add values after the base file, in order', async () => {
        const { view } = await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}&add=${enc('g/c.tif')}`));
        expect(view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif', 'g/c.tif']);
        expect(view.state.value.split.enabled).toBe(true);
        expect(view.state.value.split.positions).toHaveLength(2);
    });

    it('leaves out an add value that cannot be decoded, is not a safe path, repeats a layer or is over the limit', async () => {
        const add = ['***', enc('../x.tif'), enc('/abs.tif'), enc('f/a.tif'), enc('f/b.tif'), enc('f/b.tif'), 'c', 'd', 'e', 'f', 'g'].map(
            (v, i) => (i >= 6 ? enc(`${v}.tif`) : v));
        const { view } = await open(fileUrl('f/a.tif', `?${add.map(v => `add=${v}`).join('&')}`));
        expect(view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif', 'c.tif', 'd.tif', 'e.tif', 'f.tif']);
    });

    it('takes add and pick off the address and keeps the other keys and the hash', async () => {
        await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}&keep=1&pick=1`, '#frag'));
        expect(window.location.pathname).toBe(fileUrl('f/a.tif'));
        expect(window.location.search).toBe('?keep=1');
        expect(window.location.hash).toBe('#frag');
    });

    it('asks for the picker only when pick=1, and not in Viewer only', async () => {
        expect((await open(fileUrl('f/a.tif', '?pick=1'))).view.pickOnLoad.value).toBe(true);
        scope.stop();
        expect((await open(fileUrl('f/a.tif'))).view.pickOnLoad.value).toBe(false);
        scope.stop();
        expect((await open(fileUrl('f/a.tif', '?pick=1&embed=1'), { embed: true })).view.pickOnLoad.value).toBe(false);
    });

    it('keeps the entry in the history entry, so a reload shows the same view', async () => {
        const { view } = await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`));
        expect(held()).toEqual({ identity: 'file:f/a.tif', state: view.state.value });

        // The reload: the address no longer has the add value, the history entry has the view
        const reloaded = await open(window.location.pathname + window.location.search, { history: held() });
        expect(reloaded.view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
        expect(reloaded.view.state.value).toEqual(view.state.value);
    });

    it('does not open the picker again after a reload', async () => {
        const first = await open(fileUrl('f/a.tif', '?pick=1'));
        expect(first.view.pickOnLoad.value).toBe(true);
        scope.stop();
        // A reload with pick=1 still in the address (as a copied link would have it)
        const reloaded = await open(fileUrl('f/a.tif', '?pick=1'), { history: held() });
        expect(reloaded.view.pickOnLoad.value).toBe(false);
        expect(window.location.search).toBe('');
    });

    it('shows the restored state instead of what the add values ask for', async () => {
        const changed = defaultState(base('f/a.tif'), { baseIsGeoraster: true });
        changed.layers[0].opacity = 0.3;
        const { view } = await open(fileUrl('f/a.tif', `?add=${enc('f/b.tif')}`), { history: { identity: 'file:f/a.tif', state: changed } });
        expect(view.state.value.layers).toHaveLength(1);
        expect(view.state.value.layers[0].opacity).toBe(0.3);
    });

    it.each([
        ['another page', { identity: 'file:f/other.tif' }, s => s],
        ['a saved view', { identity: 'view:v_1' }, s => s],
        ['a layer path outside the dataset', {}, s => ({ ...s, layers: [{ ...s.layers[0], path: '../x.tif' }] })],
        ['broken split dividers', {}, s => ({ ...s, split: { enabled: true, positions: [0.5] } })],
        ['no version', {}, s => ({ ...s, v: undefined })],
        ['another base file', {}, s => ({ ...s, base: base('f/other.tif'), layers: [newLayer('f/other.tif')] })],
        ['another base file among the same layers', {}, s => ({ ...s, base: base('f/other.tif') })],
        ['a layer list that does not match the type of the base file', {}, s => ({ ...s, layers: [] })],
        ['something that is not a state', {}, () => 'x']
    ])('ignores a history entry of %s', async (_, identity, change) => {
        const stored = { identity: 'file:f/a.tif', ...identity, state: change(defaultState(base('f/a.tif'), { baseIsGeoraster: true })) };
        const { view } = await open(fileUrl('f/a.tif'), { history: stored });
        expect(view.error.value).toBe('');
        expect(view.state.value).toEqual(defaultState(base('f/a.tif'), { baseIsGeoraster: true }));
        // The page then writes its own view over it
        expect(held().identity).toBe('file:f/a.tif');
        expect(held().state).toEqual(view.state.value);
    });
});

describe('useSavedView working state in the history entry', () => {
    it('writes every change, with the identity, and keeps the router keys of the entry', async () => {
        const { view } = await open(fileUrl('f/a.tif'));
        const next = { ...view.state.value, layers: [{ ...view.state.value.layers[0], opacity: 0.25 }] };
        view.setState(next);
        expect(view.state.value).toBe(next);
        expect(held()).toEqual({ identity: 'file:f/a.tif', state: next });
        expect(window.history.state.current).toBe(fileUrl('f/a.tif'));
    });

    it('writes it again after a navigation of the router that carried an older copy of the history state', async () => {
        const { view } = await open(fileUrl('f/a.tif'));
        view.setState({ ...view.state.value, view: { center: [1, 2], zoom: 5, rotation: 0 } });
        // What a router push does: it writes its own state, which has no mapView
        const url = fileUrl('f/a.tif', '?preferences=materials');
        window.history.replaceState({ current: url }, '', url);
        expect(window.history.state[HISTORY_KEY]).toBeUndefined();
        setRoute(route, url);
        await nextTick();
        expect(held().state.view.zoom).toBe(5);
    });

    it('leaves the history entry alone when the route belongs to another page', async () => {
        const { view } = await open(fileUrl('f/a.tif'));
        const url = fileUrl('f/other.tif');
        window.history.replaceState({ current: url }, '', url);
        setRoute(route, url);
        await nextTick();
        expect(window.history.state[HISTORY_KEY]).toBeUndefined();
        expect(view.identity.value).toBe('file:f/a.tif');
    });

    it('does not reload for a route change to its own identity', async () => {
        const { view, dataset } = await open(fileUrl('f/a.tif'));
        const calls = dataset.listOne.mock.calls.length;
        const state = view.state.value;
        setRoute(route, fileUrl('f/a.tif', '?preferences=materials'));
        await nextTick();
        expect(dataset.listOne.mock.calls.length).toBe(calls);
        expect(view.state.value).toBe(state);
        expect(view.loading.value).toBe(false);
    });
});

describe('useSavedView new view that changes its base file', () => {
    async function withTwoLayers() {
        const opened = await open(fileUrl('f/a.tif', '', '#h=1'));
        opened.view.setState(addLayer(opened.view.state.value, { path: 'f/b.tif', hash: 'h-f/b.tif' }));
        router.replace.mockClear();
        return opened;
    }

    it('says it has something to save once a layer is added, and not after it is taken off again', async () => {
        const { view } = await open(fileUrl('f/a.tif'));
        expect(view.shareNote.value).toBe(false);
        view.setState(addLayer(view.state.value, { path: 'f/b.tif', hash: 'h-f/b.tif' }));
        expect(view.shareNote.value).toBe(true);
        view.setState(removeLayer(view.state.value, 0));
        expect(view.shareNote.value).toBe(false);
    });

    it('replaces the address with the file route of the new base, keeping query and hash, without a reload', async () => {
        const { view, dataset } = await open(fileUrl('f/a.tif', '?keep=1', '#h=1'));
        view.setState(addLayer(view.state.value, { path: 'f/b.tif', hash: 'h-f/b.tif' }));
        router.replace.mockClear();
        const calls = dataset.listOne.mock.calls.length;

        // f/b.tif is on top (index 0): removing the base f/a.tif makes it the base
        const next = removeLayer(view.state.value, 1);
        view.setState(next);

        expect(next.base.path).toBe('f/b.tif');
        expect(router.replace).toHaveBeenCalledTimes(1);
        const location = router.replace.mock.calls[0][0];
        expect(location.path).toBe(`/r/o/d/view/${b64encode('f/b.tif')}/map`);
        expect(location.query).toEqual({ keep: '1' });
        expect(location.hash).toBe('#h=1');
        expect(location.state[HISTORY_KEY]).toEqual({ identity: 'file:f/b.tif', state: next });

        await nextTick();
        expect(view.identity.value).toBe('file:f/b.tif');
        expect(view.name.value).toBe('b.tif');
        expect(view.pageTitle.value).toBe('b.tif - Map');
        expect(view.linkTarget.value).toEqual({ path: 'f/b.tif' });
        expect(view.state.value).toBe(next);
        expect(dataset.listOne.mock.calls.length).toBe(calls);
        expect(held().identity).toBe('file:f/b.tif');
    });

    it('shows the same view after a reload on the new address', async () => {
        const { view } = await withTwoLayers();
        view.setState(removeLayer(view.state.value, 1));
        await nextTick();
        const stored = held();
        scope.stop();
        const reloaded = await open(window.location.pathname + window.location.search, { history: stored });
        expect(reloaded.view.state.value).toEqual(stored.state);
        expect(reloaded.view.state.value.base.path).toBe('f/b.tif');
    });

    it('keeps the identity when the base stays', async () => {
        const { view } = await withTwoLayers();
        view.setState(removeLayer(view.state.value, 0));
        expect(router.replace).not.toHaveBeenCalled();
        expect(view.identity.value).toBe('file:f/a.tif');
    });

    it('keeps the name and address of a saved view when its base file is removed', async () => {
        const item = savedItem('v_1', 'Ortho over DSM', twoLayers());
        const { view } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }) });
        const next = removeLayer(view.state.value, 0);
        view.setState(next);
        expect(next.base.path).toBe('f/b.tif');
        expect(router.replace).not.toHaveBeenCalled();
        expect(view.identity.value).toBe('view:v_1');
        expect(view.name.value).toBe('Ortho over DSM');
        expect(view.dirty.value).toBe(true);
    });
});

describe('useSavedView saved view route', () => {
    it('opens the saved state, with the saved view, its name and the link of its uid', async () => {
        const item = savedItem('v_1', 'Ortho over DSM', { ...twoLayers(), view: { center: [1, 2], zoom: 4, rotation: 0 } });
        const { view, dataset } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }) });
        expect(view.error.value).toBe('');
        expect(view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
        expect(view.state.value.view).toEqual({ center: [1, 2], zoom: 4, rotation: 0 });
        expect(Object.keys(view.state.value)).not.toContain('uid');
        expect(view.saved.value).toMatchObject({ uid: 'v_1', name: 'Ortho over DSM', id: 'm1' });
        expect(view.isNew.value).toBe(false);
        expect(view.name.value).toBe('Ortho over DSM');
        expect(view.pageTitle.value).toBe('Ortho over DSM - Map');
        expect(view.identity.value).toBe('view:v_1');
        expect(view.linkTarget.value).toEqual({ uid: 'v_1' });
        expect(view.baseEntry.value.path).toBe('f/a.tif');
        // The list is read from the server, and only the base file is looked up
        expect(dataset.metaGet).toHaveBeenCalledWith('views', '', { cache: false });
        expect(dataset.listOne.mock.calls.map(c => c[0])).toEqual(['f/a.tif']);
        expect(held()).toEqual({ identity: 'view:v_1', state: view.state.value, savedId: 'm1' });
    });

    it('says an unknown view does not exist, and requests no file', async () => {
        const { view, dataset } = await open(viewUrl('v_nope'), { dataset: fakeDataset({ items: [savedItem('v_1', 'S', twoLayers())] }) });
        expect(view.error.value).toBe('This view does not exist. It may have been deleted.');
        expect(view.state.value).toBeNull();
        expect(view.pageTitle.value).toBeNull();
        expect(dataset.listOne).not.toHaveBeenCalled();
        expect(dataset.info).not.toHaveBeenCalled();
    });

    it('says a dataset with no saved views has none', async () => {
        const { view } = await open(viewUrl('v_1'));
        expect(view.error.value).toBe('This view does not exist. It may have been deleted.');
    });

    it('says why a saved view that fails validation cannot be opened, and requests no file', async () => {
        const broken = { ...twoLayers(), layers: [newLayer('../other/secret.tif'), newLayer('f/b.tif')] };
        const { view, dataset } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [savedItem('v_1', 'S', broken)] }) });
        expect(view.error.value).toBe('This view cannot be opened: a layer path is not valid.');
        expect(view.state.value).toBeNull();
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('says a view of a newer version cannot be opened, and requests no file', async () => {
        const newer = { ...twoLayers(), v: 99 };
        const { view, dataset } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [savedItem('v_1', 'S', newer)] }) });
        expect(view.error.value).toBe('This view cannot be opened: it was saved by a newer version of the application.');
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('shows the error of a list that cannot be read', async () => {
        const dataset = fakeDataset({ items: [savedItem('v_1', 'S', twoLayers())] });
        dataset.metaGet.mockRejectedValue(new Error('Network error'));
        const { view } = await open(viewUrl('v_1'), { dataset });
        expect(view.error.value).toBe('Network error');
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('opens the other layers when the base file is missing, with no base entry and no error', async () => {
        const dataset = fakeDataset({ items: [savedItem('v_1', 'S', twoLayers())], missing: ['f/a.tif'] });
        const { view } = await open(viewUrl('v_1'), { dataset });
        expect(view.error.value).toBe('');
        expect(view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
        expect(view.baseEntry.value).toBeNull();
        expect(view.canWrite.value).toBe(true);
    });

    it('prefers the working state of the history entry for the same view', async () => {
        const item = savedItem('v_1', 'S', twoLayers());
        const working = { ...twoLayers(), layers: twoLayers().layers.map(l => ({ ...l, opacity: 0.2 })) };
        const { view } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }), history: { identity: 'view:v_1', state: working, savedId: 'm0' } });
        expect(view.state.value.layers[0].opacity).toBe(0.2);
        expect(view.dirty.value).toBe(true);
    });

    it('ignores the history entry of another view or an invalid one', async () => {
        const item = savedItem('v_1', 'S', twoLayers());
        const other = { identity: 'view:v_2', state: { ...twoLayers(), layers: [newLayer('f/a.tif', { opacity: 0.1 })] } };
        expect((await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }), history: other })).view.dirty.value).toBe(false);
        scope.stop();
        const invalid = { identity: 'view:v_1', state: { ...twoLayers(), layers: [newLayer('/etc/passwd')] } };
        const { view } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }), history: invalid });
        expect(view.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
    });

    it('has writers from the dataset permissions', async () => {
        const item = savedItem('v_1', 'S', twoLayers());
        expect((await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item], canWrite: false }) })).view.canWrite.value).toBe(false);
        expect(permissionsOf(null).canWrite).toBe(false);
    });

    it('has the delete permission of the dataset, apart from the write one', async () => {
        const item = savedItem('v_1', 'S', twoLayers());
        const writer = (await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item], canDelete: false }) })).view;
        expect(writer.canWrite.value).toBe(true);
        expect(writer.canDelete.value).toBe(false);
        scope.stop();
        const deleter = (await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item], canWrite: false, canDelete: true }) })).view;
        expect(deleter.canDelete.value).toBe(true);
    });
});

describe('useSavedView dirty and the link note', () => {
    async function openSaved() {
        const item = savedItem('v_1', 'S', { ...twoLayers(), view: { center: [1, 2], zoom: 4, rotation: 0 } });
        return open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item] }) });
    }

    it('is clean when opened and when only the map position changes', async () => {
        const { view } = await openSaved();
        expect(view.dirty.value).toBe(false);
        expect(view.shareNote.value).toBe(false);
        view.setState({ ...view.state.value, view: { center: [9, 9], zoom: 12, rotation: 1 } });
        expect(view.dirty.value).toBe(false);
        expect(view.shareNote.value).toBe(false);
    });

    it('is dirty after an opacity change, and clean again when it is set back', async () => {
        const { view } = await openSaved();
        const original = view.state.value;
        view.setState({ ...original, layers: original.layers.map((l, i) => (i ? l : { ...l, opacity: 0.5 })) });
        expect(view.dirty.value).toBe(true);
        expect(view.shareNote.value).toBe(true);
        view.setState(original);
        expect(view.dirty.value).toBe(false);
    });

    it('is dirty after a change of order, visibility, split or elevation model', async () => {
        const { view } = await openSaved();
        const original = view.state.value;
        const variants = [
            { ...original, layers: [original.layers[1], original.layers[0]] },
            { ...original, layers: original.layers.map((l, i) => (i ? l : { ...l, visible: false })) },
            { ...original, split: { enabled: false, positions: [] } },
            { ...original, analysis: { target: 'f/b.tif' } }
        ];
        for (const variant of variants) {
            view.setState(variant);
            expect(view.dirty.value).toBe(true);
            view.setState(original);
        }
    });
});

describe('useSavedView save on a new view', () => {
    it('asks for a name, creates the view, moves the page to it and says so', async () => {
        const { view, dataset } = await open(fileUrl('f/a.tif', '', '#h=1'));
        view.setState({ ...view.state.value, view: { center: [3, 4], zoom: 6, rotation: 0 } });
        dialogs.open.mockResolvedValue('Ortho over DSM');

        await view.save();

        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('TextPromptDialog');
        expect(props).toMatchObject({ title: 'Save view', label: 'Name', initialValue: '', maxLength: 100 });
        expect(dataset.metaAdd).toHaveBeenCalledTimes(1);
        const stored = dataset.metaAdd.mock.calls[0][1];
        expect(stored).toMatchObject({ name: 'Ortho over DSM', createdBy: 'user', view: { center: [3, 4], zoom: 6, rotation: 0 } });
        expect(view.saved.value).toMatchObject({ uid: stored.uid, name: 'Ortho over DSM' });
        expect(view.isNew.value).toBe(false);
        expect(view.dirty.value).toBe(false);
        expect(view.name.value).toBe('Ortho over DSM');
        expect(view.pageTitle.value).toBe('Ortho over DSM - Map');
        expect(view.linkTarget.value).toEqual({ uid: stored.uid });
        expect(view.identity.value).toBe(`view:${stored.uid}`);
        expect(view.busy.value).toBe(false);
        expect(notify.success).toHaveBeenCalledWith('Saved "Ortho over DSM"', { summary: 'View saved' });

        // The address is the saved view's, with the working state in the new entry
        const location = router.replace.mock.calls[0][0];
        expect(location.path).toBe(`/r/o/d/views/${stored.uid}`);
        expect(location.hash).toBe('#h=1');
        expect(location.state[HISTORY_KEY]).toMatchObject({ identity: `view:${stored.uid}`, savedId: view.saved.value.id });
        expect(window.location.pathname).toBe(`/r/o/d/views/${stored.uid}`);
        expect(route.params.uid).toBe(stored.uid);
        expect(held().identity).toBe(`view:${stored.uid}`);
    });

    it('stores the hash of each file as it is now, and the hash of the state for a file it cannot see', async () => {
        const hashOf = shallowRef(null);
        const { view, dataset } = await open(fileUrl('f/a.tif'), { hashOf });
        view.setState(addLayer(view.state.value, { path: 'f/b.tif', hash: 'old-b' }));
        hashOf.value = path => (path === 'f/b.tif' ? undefined : `now-${path}`);
        dialogs.open.mockResolvedValue('X');
        await view.save();
        const stored = dataset.metaAdd.mock.calls[0][1];
        expect(stored.base.hash).toBe('now-f/a.tif');
        expect(stored.layers.map(l => [l.path, l.hash])).toEqual([['f/b.tif', 'old-b'], ['f/a.tif', 'now-f/a.tif']]);
        expect(view.dirty.value).toBe(false);
    });

    it('keeps the working state, and says why, when the view cannot be saved', async () => {
        const dataset = fakeDataset();
        dataset.metaAdd.mockRejectedValue(new Error('Quota exceeded'));
        const { view } = await open(fileUrl('f/a.tif'), { dataset });
        const state = view.state.value;
        dialogs.open.mockResolvedValue('X');
        await view.save();
        expect(notify.error).toHaveBeenCalledWith('Quota exceeded', { summary: 'Cannot save the view' });
        expect(notify.success).not.toHaveBeenCalled();
        expect(view.state.value).toBe(state);
        expect(view.saved.value).toBeNull();
        expect(view.identity.value).toBe('file:f/a.tif');
        expect(router.replace).not.toHaveBeenCalled();
        expect(view.busy.value).toBe(false);
    });

    it('refuses the 101st view with the message of the limit', async () => {
        const items = Array.from({ length: MAX_VIEWS }, (_, i) => savedItem(`v_${i}`, `View ${i}`, twoLayers(), `m${i}`));
        const { view } = await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ items }) });
        dialogs.open.mockResolvedValue('One more');
        await view.save();
        expect(notify.error).toHaveBeenCalledWith('This dataset has 100 saved views. Delete one to save a new view.', { summary: 'Cannot save the view' });
        expect(view.saved.value).toBeNull();
    });

    it('ignores a second Save or Save as new while the name prompt is open, and saves once', async () => {
        const { view, dataset } = await open(fileUrl('f/a.tif'));
        let answer;
        dialogs.open.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        const first = view.save();
        await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
        await view.save();
        await view.saveAsNew();
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        answer('Once');
        await first;
        expect(dataset.metaAdd).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledTimes(1);
        // The next click saves again
        dialogs.open.mockResolvedValueOnce('Twice');
        await view.saveAsNew();
        expect(dataset.metaAdd).toHaveBeenCalledTimes(2);
    });

    it('saves nothing when the name is cancelled', async () => {
        const { view, dataset } = await open(fileUrl('f/a.tif'));
        dialogs.open.mockResolvedValue(null);
        await view.save();
        expect(dataset.metaAdd).not.toHaveBeenCalled();
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('gives a name to the dialogs and the toast as text', async () => {
        const hostile = '<img src=x onerror=alert(1)>';
        const { view } = await open(fileUrl('f/a.tif'));
        dialogs.open.mockResolvedValue(hostile);
        await view.save();
        expect(notify.success).toHaveBeenCalledWith(`Saved "${hostile}"`, { summary: 'View saved' });
        expect(view.name.value).toBe(hostile);
    });

    it('does nothing for a reader or in Viewer only', async () => {
        const reader = await open(fileUrl('f/a.tif'), { dataset: fakeDataset({ canWrite: false }) });
        await reader.view.save();
        await reader.view.saveAsNew();
        expect(dialogs.open).not.toHaveBeenCalled();
        scope.stop();
        const embedded = await open(fileUrl('f/a.tif'), { embed: true });
        await embedded.view.save();
        await embedded.view.saveAsNew();
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(embedded.dataset.metaAdd).not.toHaveBeenCalled();
    });
});

describe('useSavedView save on a saved view', () => {
    const item = () => savedItem('v_1', 'Ortho over DSM', twoLayers());
    async function openSaved(options = {}) {
        const dataset = fakeDataset({ items: [item()], ...options });
        const opened = await open(viewUrl('v_1'), { dataset });
        const state = opened.view.state.value;
        opened.view.setState({ ...state, layers: state.layers.map((l, i) => (i ? l : { ...l, opacity: 0.5 })) });
        return opened;
    }

    it('replaces the saved view when nobody else saved it, and is clean after', async () => {
        const { view, dataset } = await openSaved();
        expect(view.dirty.value).toBe(true);
        await view.save();
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(dataset.items).toHaveLength(1);
        expect(dataset.items[0].data).toMatchObject({ uid: 'v_1', name: 'Ortho over DSM', createdBy: 'a', updatedBy: 'user' });
        expect(dataset.items[0].data.layers[0].opacity).toBe(0.5);
        expect(view.saved.value.id).toBe(dataset.items[0].id);
        expect(view.dirty.value).toBe(false);
        expect(view.identity.value).toBe('view:v_1');
        expect(router.replace).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledWith('Saved "Ortho over DSM"', { summary: 'View saved' });
        expect(held().savedId).toBe(dataset.items[0].id);
    });

    it('takes the hashes of the files as they are now, so the view is clean after the save', async () => {
        const hashOf = shallowRef(path => `now-${path}`);
        const dataset = fakeDataset({ items: [item()] });
        const { view } = await open(viewUrl('v_1'), { dataset, hashOf });
        view.setState({ ...view.state.value, split: { enabled: false, positions: [] } });
        await view.save();
        expect(dataset.items[0].data.layers.map(l => l.hash)).toEqual(['now-f/a.tif', 'now-f/b.tif']);
        expect(view.state.value.layers.map(l => l.hash)).toEqual(['now-f/a.tif', 'now-f/b.tif']);
        expect(view.dirty.value).toBe(false);
    });

    it('keeps the hashes the view was saved with while the user works', async () => {
        const hashOf = shallowRef(path => `now-${path}`);
        const { view } = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [item()] }), hashOf });
        view.setState({ ...view.state.value, split: { enabled: false, positions: [] } });
        // (the second layer was added by an address, which does not know its hash)
        expect(view.state.value.layers.map(l => l.hash)).toEqual(['h-f/a.tif', '']);
    });

    it('asks what to do when someone saved the view after it was opened', async () => {
        const { view, dataset } = await openSaved();
        dataset.items.push({ id: 'm9', mtime: 5000, data: { ...item().data, name: 'Their name', updatedBy: 'other' } });
        dialogs.open.mockResolvedValue('confirm');

        await view.save();

        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('ConfirmDialog');
        expect(props).toMatchObject({
            title: 'View changed',
            message: 'Someone saved this view after you opened it. Overwrite their changes, or save yours as a new view?',
            confirmText: 'Overwrite',
            secondaryText: 'Save as new',
            confirmButtonClass: 'danger'
        });
        // Overwrite: the name is theirs, the layers are ours
        expect(dataset.items).toHaveLength(1);
        expect(dataset.items[0].data.layers[0].opacity).toBe(0.5);
        expect(view.dirty.value).toBe(false);
    });

    it('saves as a new view when that is the choice', async () => {
        const { view, dataset } = await openSaved();
        dataset.items.push({ id: 'm9', mtime: 5000, data: { ...item().data, updatedBy: 'other' } });
        dialogs.open.mockResolvedValueOnce('secondary').mockResolvedValueOnce('My copy');

        await view.save();

        expect(dialogs.open.mock.calls[1][1]).toMatchObject({ title: 'Save view as', initialValue: 'Ortho over DSM (copy)' });
        expect(view.saved.value.name).toBe('My copy');
        expect(view.saved.value.uid).not.toBe('v_1');
        expect(view.identity.value).toBe(`view:${view.saved.value.uid}`);
        expect(router.replace.mock.calls[0][0].path).toBe(`/r/o/d/views/${view.saved.value.uid}`);
        expect(dataset.items.some(i => i.data.uid === 'v_1')).toBe(true);
    });

    it('saves nothing when the question is cancelled', async () => {
        const { view, dataset } = await openSaved();
        dataset.items.push({ id: 'm9', mtime: 5000, data: { ...item().data, updatedBy: 'other' } });
        dialogs.open.mockResolvedValue('cancel');
        const before = dataset.items.length;
        await view.save();
        expect(dataset.metaAdd).not.toHaveBeenCalled();
        expect(dataset.items).toHaveLength(before);
        expect(view.dirty.value).toBe(true);
    });

    it('notices another save after a reload too: the version the state came from is kept in the history entry', async () => {
        const { dataset } = await openSaved();
        const stored = held();
        scope.stop();
        // Someone else saves while the tab is closed or reloading
        dataset.items = [{ id: 'm9', mtime: 5000, data: { ...item().data, updatedBy: 'other' } }];
        const reloaded = await open(viewUrl('v_1'), { dataset, history: stored });
        expect(reloaded.view.dirty.value).toBe(true);
        dialogs.open.mockResolvedValue('cancel');
        await reloaded.view.save();
        expect(dialogs.open.mock.calls[0][1].title).toBe('View changed');
    });

    it('warns when the view was deleted, then saves it under a name of the user', async () => {
        const { view, dataset } = await openSaved();
        dataset.items = [];
        dialogs.open.mockResolvedValue('Back again');

        await view.save();

        expect(notify.warn).toHaveBeenCalledWith('This view was deleted. Save it under a name to keep it.', { summary: 'View deleted' });
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Save view as', initialValue: '' });
        expect(dataset.items).toHaveLength(1);
        expect(view.saved.value.name).toBe('Back again');
        expect(view.saved.value.uid).not.toBe('v_1');
        expect(view.identity.value).toBe(`view:${view.saved.value.uid}`);
        expect(router.replace).toHaveBeenCalledTimes(1);
    });

    it('keeps everything when the view was deleted and the name is cancelled', async () => {
        const { view, dataset } = await openSaved();
        dataset.items = [];
        dialogs.open.mockResolvedValue(null);
        await view.save();
        expect(notify.warn).toHaveBeenCalledTimes(1);
        expect(dataset.metaAdd).not.toHaveBeenCalled();
        expect(view.saved.value.uid).toBe('v_1');
    });

    it('shows the error and saves nothing when the check for other changes fails', async () => {
        const { view, dataset } = await openSaved();
        dataset.metaGet.mockRejectedValue(new Error('Network error'));
        await view.save();
        expect(notify.error).toHaveBeenCalledWith('Network error', { summary: 'Cannot save the view' });
        expect(dataset.metaAdd).not.toHaveBeenCalled();
        expect(view.dirty.value).toBe(true);
    });

    it('shows the error and keeps the state when the update fails', async () => {
        const { view, dataset } = await openSaved();
        dataset.metaAdd.mockRejectedValue(new Error('Disk full'));
        await view.save();
        expect(notify.error).toHaveBeenCalledWith('Disk full', { summary: 'Cannot save the view' });
        expect(view.dirty.value).toBe(true);
        expect(view.busy.value).toBe(false);
    });

    it('is busy while it writes', async () => {
        const { view, dataset } = await openSaved();
        let release;
        dataset.metaAdd.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ id: 'm200' }); }));
        const saving = view.save();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(view.busy.value).toBe(true);
        // A second click is ignored
        await view.save();
        expect(dataset.metaAdd).toHaveBeenCalledTimes(1);
        release();
        await saving;
        expect(view.busy.value).toBe(false);
    });

    it('ignores a second Save while the question about another writer is open', async () => {
        const { view, dataset } = await openSaved();
        dataset.items.push({ ...dataset.items[0], id: 'm9', mtime: 9000 });
        let answer;
        dialogs.open.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        const first = view.save();
        await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
        await view.save();
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        answer('confirm');
        await first;
        expect(dataset.metaAdd).toHaveBeenCalledTimes(1);
    });

    it('asks Save as new for a copy name, and creates a second view', async () => {
        const { view, dataset } = await openSaved();
        dialogs.open.mockResolvedValue('Variant');
        await view.saveAsNew();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Save view as', initialValue: 'Ortho over DSM (copy)', label: 'Name' });
        expect(dataset.items.map(i => i.data.name).sort()).toEqual(['Ortho over DSM', 'Variant']);
        expect(view.saved.value.name).toBe('Variant');
        expect(view.pageTitle.value).toBe('Variant - Map');
    });

    it('does not save a saved view for a reader', async () => {
        const { view } = await openSaved({ canWrite: false });
        await view.save();
        expect(dialogs.open).not.toHaveBeenCalled();
    });
});

describe('useSavedView and the saves of other writers', () => {
    it('keeps the version it was loaded from: nothing takes another save as its own, so a Save still asks', async () => {
        const dataset = fakeDataset({ items: [savedItem('v_1', 'Old name', twoLayers())] });
        const { view } = await open(viewUrl('v_1'), { dataset });
        dataset.items.push({ ...savedItem('v_1', 'Their name', twoLayers(), 'm2'), mtime: 5000 });
        // Only this tab's own save moves the version on; a reload of the list would take theirs
        // without a word and overwrite it on the next Save
        expect(Object.keys(view).filter(k => /reload/i.test(k))).toEqual([]);
        expect(view.saved.value.id).toBe('m1');
        expect(view.name.value).toBe('Old name');
        dialogs.open.mockResolvedValue(null);
        await view.save();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'View changed' });
    });
});

describe('useSavedView leaving with unsaved changes', () => {
    const dsRoute = { path: '/r/o/d', fullPath: '/r/o/d', params: { org: 'o', ds: 'd' } };
    const here = () => ({ path: route.fullPath.split('?')[0], fullPath: route.fullPath, params: { ...route.params } });
    const ConfirmDialog = { name: 'ConfirmDialog' };
    async function openChanged(options = {}) {
        const dataset = fakeDataset({ items: [savedItem('v_1', 'Ortho over DSM', twoLayers())], ...options.dataset });
        const opened = await open(viewUrl('v_1'), { dataset, embed: options.embed });
        const state = opened.view.state.value;
        opened.view.setState({ ...state, layers: state.layers.map((l, i) => (i ? l : { ...l, opacity: 0.5 })) });
        return opened;
    }
    const isQuestion = call => call[0].name === ConfirmDialog.name && /^Save changes to/.test(call[1].title);

    it('asks "Save changes to <view>?" with Save, Discard and Cancel; Cancel stays', async () => {
        const { view } = await openChanged();
        dialogs.open.mockResolvedValue('cancel');
        expect(await guards.leave(dsRoute, here())).toBe(false);
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({
            title: 'Save changes to Ortho over DSM?', confirmText: 'Save', secondaryText: 'Discard', cancelText: 'Cancel'
        });
        // The name goes into the title (text), not the message (HTML)
        expect(dialogs.open.mock.calls[0][1].message).not.toContain('Ortho');
        expect(view.dirty.value).toBe(true);
        expect(view.saved.value.data.layers[0].opacity).not.toBe(0.5);
    });

    it('Discard leaves without saving', async () => {
        const { dataset } = await openChanged();
        dialogs.open.mockResolvedValue('secondary');
        expect(await guards.leave(dsRoute, here())).toBe(true);
        expect(dataset.metaAdd).not.toHaveBeenCalled();
    });

    it('Save saves, then leaves', async () => {
        const { view, dataset } = await openChanged();
        dialogs.open.mockResolvedValue('confirm');
        expect(await guards.leave(dsRoute, here())).toBe(true);
        expect(dataset.items[0].data.layers[0].opacity).toBe(0.5);
        expect(view.dirty.value).toBe(false);
        expect(notify.success).toHaveBeenCalledWith('Saved "Ortho over DSM"', { summary: 'View saved' });
    });

    it('stays when the save moves the page to a new view (the view was deleted), and lets that move go', async () => {
        const { view, dataset } = await openChanged();
        dataset.items = [];
        dialogs.open.mockImplementation(async (component, props) => (isQuestion([component, props]) ? 'confirm' : 'Back again'));
        const routeGuard = guards.update;
        router.replace.mockImplementation(async location => {
            // The router asks the page's guard first: the move is to the page's own identity
            expect(await routeGuard({ path: location.path, fullPath: location.path, params: { org: 'o', ds: 'd', uid: location.path.split('/').pop() } }, here())).toBe(true);
            window.history.replaceState({ ...window.history.state, ...location.state }, '', location.path);
            setRoute(route, location.path);
        });
        expect(await guards.leave(dsRoute, here())).toBe(false);
        expect(view.saved.value.name).toBe('Back again');
        expect(router.replace).toHaveBeenCalledTimes(1);
        expect(dialogs.open.mock.calls.filter(isQuestion)).toHaveLength(1);
    });

    it('stays when the save saved nothing (the name was cancelled)', async () => {
        const { view, dataset } = await openChanged();
        dataset.items = [];
        dialogs.open.mockImplementation(async (component, props) => (isQuestion([component, props]) ? 'confirm' : null));
        expect(await guards.leave(dsRoute, here())).toBe(false);
        expect(view.dirty.value).toBe(true);
    });

    it('does not ask for a route change to its own identity (a query key, the move of a save)', async () => {
        await openChanged();
        expect(await guards.update({ ...here(), fullPath: `${route.fullPath}?preferences=general` }, here())).toBe(true);
        expect(await guards.update({ path: '/r/o/d/views/v_1', params: { org: 'o', ds: 'd', uid: 'v_1' } }, dsRoute)).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('asks for another view of the same dataset', async () => {
        await openChanged();
        dialogs.open.mockResolvedValue('cancel');
        expect(await guards.update({ path: '/r/o/d/views/v_2', params: { org: 'o', ds: 'd', uid: 'v_2' } }, here())).toBe(false);
        expect(dialogs.open).toHaveBeenCalledTimes(1);
    });

    it('asks nothing for a clean view, a reader or Viewer only', async () => {
        const clean = await open(viewUrl('v_1'), { dataset: fakeDataset({ items: [savedItem('v_1', 'S', twoLayers())] }) });
        expect(clean.view.dirty.value).toBe(false);
        expect(await guards.leave(dsRoute, here())).toBe(true);
        scope.stop();

        await openChanged({ dataset: { canWrite: false } });
        expect(await guards.leave(dsRoute, here())).toBe(true);
        scope.stop();

        const embedded = await openChanged({ embed: true });
        expect(embedded.view.dirty.value).toBe(true);
        expect(await guards.leave(dsRoute, here())).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('shows the browser question on a page unload while the view has unsaved changes', async () => {
        await openChanged();
        await nextTick();
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
    });
});

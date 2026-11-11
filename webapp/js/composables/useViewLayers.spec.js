import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, shallowRef, nextTick } from 'vue';
import ddb from 'ddb';
import { defaultState, newLayer } from '@/libs/views/viewState';

const warn = vi.fn();
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: vi.fn().mockResolvedValue({ available: true }) } }));
vi.mock('@/components/FolderPicker.vue', () => ({ default: { name: 'FolderPicker' } }));
// The BuildManager as an event source the test fires (FR-RAS-09): no task list, no poll
vi.mock('@/libs/build/buildManager', () => {
    const listeners = new Set();
    return {
        default: {
            on: (event, cb) => listeners.add(cb),
            off: (event, cb) => listeners.delete(cb),
            registerDataset: vi.fn(),
            unregisterDataset: vi.fn(),
            getBuildState: vi.fn(() => null),
            getBuildProgress: vi.fn(() => 40),
            fire: data => [...listeners].forEach(cb => cb(data)),
            listenerCount: () => listeners.size
        }
    };
});
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ warn, error: vi.fn(), success: vi.fn() }) }));

const { default: availability } = await import('@/libs/build/fileAvailabilityChecker');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const { useViewLayers, AT_LIMIT_TITLE } = await import('./useViewLayers');

const T = ddb.entry.type;
const entryOf = (path, type = T.GEORASTER, hash = `h-${path}`) => ({ path, type, hash });
const dataset = { baseApi: '/orgs/o/ds/d', listOne: vi.fn(), remoteUri: vi.fn(path => `ddb://o/d/${path}`) };

/** A view whose base is `base` and whose layers are the paths (top first). */
function viewOf(base, paths) {
    const state = defaultState({ path: base, hash: `h-${base}` }, { baseIsGeoraster: false });
    return { ...state, layers: paths.map(p => newLayer(p, { hash: `h-${p}` })) };
}

let scope;
function open(initial, { baseEntry = null, saved = null, embed = false, onAdded = undefined } = {}) {
    const state = shallowRef(initial);
    const baseRef = shallowRef(baseEntry);
    const savedRef = shallowRef(saved);
    const setState = vi.fn(next => { state.value = next; });
    const dialogs = { open: vi.fn() };
    let layers;
    scope = effectScope();
    scope.run(() => {
        layers = useViewLayers({ dataset, state, setState, baseEntry: baseRef, savedData: () => savedRef.value, dialogs, embed, onAdded });
    });
    return { layers, state, setState, dialogs, baseRef, savedRef };
}
const settled = async layers => { await vi.waitFor(() => expect(layers.pending.value).toBe(false)); };

beforeEach(() => {
    warn.mockClear();
    dataset.listOne.mockReset();
    dataset.listOne.mockImplementation(async path => entryOf(path));
    availability.check.mockResolvedValue({ available: true });
});
afterEach(() => scope?.stop());

describe('useViewLayers files', () => {
    it('lists the layers from the bottom up: the last layer of the view is drawn first', async () => {
        const { layers } = open(viewOf('f/a.tif', ['f/a.tif', 'f/b.tif', 'f/c.tif']));
        await settled(layers);
        expect(layers.files.value.map(f => f.label)).toEqual(['c.tif', 'b.tif', 'a.tif']);
        expect(layers.files.value[2]).toEqual({ path: 'ddb://o/d/f/a.tif', entry: entryOf('f/a.tif'), label: 'a.tif', selected: false });
    });

    it('puts a base file that is not a georaster first, with its own entry, then the layers', async () => {
        const base = entryOf('v/zones.geojson', T.VECTOR);
        const { layers } = open(viewOf('v/zones.geojson', ['f/a.tif', 'f/b.tif']), { baseEntry: base });
        await settled(layers);
        expect(layers.files.value.map(f => f.label)).toEqual(['zones.geojson', 'b.tif', 'a.tif']);
        expect(layers.files.value[0]).toEqual({ path: 'ddb://o/d/v/zones.geojson', entry: base, label: 'zones.geojson', selected: false });
    });

    it('does not list a base georaster twice and does not ask for a base that is only a layer', async () => {
        const { layers } = open(viewOf('f/a.tif', ['f/a.tif']), { baseEntry: entryOf('f/a.tif') });
        await settled(layers);
        expect(layers.files.value.map(f => f.label)).toEqual(['a.tif']);
    });

    it('leaves a missing base file that is not a georaster out', async () => {
        const { layers } = open(viewOf('v/zones.geojson', ['f/a.tif']), { baseEntry: null });
        await settled(layers);
        expect(layers.files.value.map(f => f.label)).toEqual(['a.tif']);
    });

    it('keeps a missing or unavailable layer as a placeholder in its place', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('nf');
            return entryOf(path);
        });
        availability.check.mockImplementation(async (_, entry) => (entry.path === 'raw.tif' ? { available: false, title: 'Not built yet' } : { available: true }));
        const { layers } = open(viewOf('a.tif', ['gone.tif', 'a.tif', 'raw.tif']));
        await settled(layers);
        expect(layers.files.value.map(f => f.placeholder?.text)).toEqual(['Not built yet: raw.tif', undefined, 'Missing: gone.tif']);
        expect(layers.files.value[2].entry).toBeNull();
    });

    it('has no files until every layer is resolved, then builds them all at once', async () => {
        let release;
        dataset.listOne.mockImplementation(path => new Promise(resolve => {
            if (path === 'b.tif') release = () => resolve(entryOf(path));
            else resolve(entryOf(path));
        }));
        const { layers } = open(viewOf('a.tif', ['a.tif', 'b.tif']));
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(layers.pending.value).toBe(true);
        expect(layers.files.value).toEqual([]);
        release();
        await settled(layers);
        expect(layers.files.value).toHaveLength(2);
    });

    it('has no files and nothing to resolve before the state is loaded', () => {
        const { layers } = open(null);
        expect(layers.files.value).toEqual([]);
        expect(layers.pending.value).toBe(false);
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('keeps the same files, and asks for no file again, when only settings change', async () => {
        const { layers, state } = open(viewOf('a.tif', ['a.tif', 'b.tif']));
        await settled(layers);
        const before = layers.files.value;
        const calls = dataset.listOne.mock.calls.length;

        state.value = { ...state.value, layers: state.value.layers.map(l => ({ ...l, opacity: 0.4, visible: false })), view: { center: [1, 2], zoom: 3, rotation: 0 } };
        await nextTick();
        expect(layers.files.value).toBe(before);
        expect(dataset.listOne.mock.calls.length).toBe(calls);
    });

    it('keeps the same files when a picked file is resolved but not added', async () => {
        const { layers, dialogs } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        const before = layers.files.value;
        dataset.listOne.mockImplementation(async path => entryOf(path, path === 'notes.md' ? T.MARKDOWN : T.GEORASTER));
        dialogs.open.mockResolvedValue({ path: 'notes.md' });
        await layers.add();
        expect(layers.files.value).toBe(before);
    });

    it('builds the files again when the paths change', async () => {
        const { layers, state } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        const before = layers.files.value;
        state.value = viewOf('a.tif', ['b.tif', 'a.tif']);
        await settled(layers);
        expect(layers.files.value).not.toBe(before);
        expect(layers.files.value.map(f => f.label)).toEqual(['a.tif', 'b.tif']);
    });

    it('lets the latest resolve have the answer: an overtaken request neither overwrites it nor loses a path', async () => {
        const first = { release: null };
        let aCalls = 0;
        dataset.listOne.mockImplementation(path => {
            if (path === 'a.tif' && ++aCalls === 1) return new Promise(resolve => { first.release = () => resolve(entryOf('a.tif', T.GEORASTER, 'old')); });
            return Promise.resolve(entryOf(path, T.GEORASTER, path === 'a.tif' ? 'new' : 'h'));
        });
        const { layers, state } = open(viewOf('a.tif', ['a.tif']));
        await vi.waitFor(() => expect(first.release).toBeTypeOf('function'));
        state.value = viewOf('a.tif', ['a.tif', 'b.tif']);
        await settled(layers);

        first.release();
        await new Promise(r => setTimeout(r, 0));
        expect(layers.resolved.value.get('a.tif').entry.hash).toBe('new');
        expect(layers.resolved.value.has('b.tif')).toBe(true);
        expect(layers.files.value).toHaveLength(2);
    });
});

describe('useViewLayers changed files', () => {
    const savedWith = hashes => ({ layers: Object.entries(hashes).map(([path, hash]) => ({ path, hash })) });

    it('names the layers whose file is not the one the view was saved with', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, T.GEORASTER, path === 'b.tif' ? 'newer' : `h-${path}`));
        const { layers } = open(viewOf('a.tif', ['a.tif', 'b.tif']), { saved: savedWith({ 'a.tif': 'h-a.tif', 'b.tif': 'older' }) });
        await settled(layers);
        expect(layers.changedPaths.value).toEqual(['b.tif']);
    });

    it('has none for a new view, whatever the hashes of its layers', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, T.GEORASTER, 'something-else'));
        const { layers } = open(viewOf('a.tif', ['a.tif', 'b.tif']), { saved: null });
        await settled(layers);
        expect(layers.changedPaths.value).toEqual([]);
    });

    it('does not count a missing file or a layer the view was saved without', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('nf');
            return entryOf(path, T.GEORASTER, 'new-hash');
        });
        const { layers } = open(viewOf('a.tif', ['a.tif', 'gone.tif', 'added.tif']), { saved: savedWith({ 'a.tif': 'new-hash', 'gone.tif': 'old' }) });
        await settled(layers);
        expect(layers.changedPaths.value).toEqual([]);
    });

    it('keeps the same list while the settings change', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, T.GEORASTER, 'new'));
        const { layers, state } = open(viewOf('a.tif', ['a.tif']), { saved: savedWith({ 'a.tif': 'old' }) });
        await settled(layers);
        const before = layers.changedPaths.value;
        expect(before).toEqual(['a.tif']);
        state.value = { ...state.value, layers: [{ ...state.value.layers[0], opacity: 0.2 }] };
        await nextTick();
        expect(layers.changedPaths.value).toBe(before);
    });
});

describe('useViewLayers hashOf', () => {
    it('gives the hash of the file now, and the hash of the state for a missing file', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('nf');
            return entryOf(path, T.GEORASTER, 'now');
        });
        const { layers, state } = open(viewOf('a.tif', ['a.tif', 'gone.tif']));
        state.value = { ...state.value, layers: state.value.layers.map(l => ({ ...l, hash: 'saved' })) };
        await settled(layers);
        expect(layers.hashOf('a.tif')).toBe('now');
        expect(layers.hashOf('gone.tif')).toBe('saved');
    });

    it('gives the hash of the base entry for a base file that is not a layer', async () => {
        const { layers } = open(viewOf('v/z.geojson', ['a.tif']), { baseEntry: entryOf('v/z.geojson', T.VECTOR, 'vec') });
        await settled(layers);
        expect(layers.hashOf('v/z.geojson')).toBe('vec');
        expect(layers.entryOf('v/z.geojson').hash).toBe('vec');
        expect(layers.entryOf('a.tif').hash).toBe('h-a.tif');
        expect(layers.entryOf('nowhere.tif')).toBeNull();
    });
});

describe('useViewLayers limit', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map(n => `${n}.tif`);

    it('offers Add layer below the limit', async () => {
        const { layers } = open(viewOf('1.tif', six.slice(0, 5)));
        expect(layers.atLimit.value).toBe(false);
        expect(layers.canAdd.value).toBe(true);
        expect(layers.addTitle.value).toBe('Add layer');
    });

    it('turns Add layer off at 6 rasters with its reason as the title, and does not open the picker', async () => {
        const { layers, dialogs } = open(viewOf('1.tif', six));
        expect(layers.atLimit.value).toBe(true);
        expect(layers.canAdd.value).toBe(false);
        expect(layers.addTitle.value).toBe('A view shows at most 6 rasters');
        expect(AT_LIMIT_TITLE).toBe('A view shows at most 6 rasters');
        expect(await layers.add()).toBe(false);
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('cannot add before the view is loaded', async () => {
        const { layers } = open(null);
        expect(layers.canAdd.value).toBe(false);
    });
});

describe('useViewLayers add', () => {
    it('opens the picker near the top layer, without the layers of the view, and adds the pick on top', async () => {
        const { layers, dialogs, setState, state } = open(viewOf('f/a.tif', ['f/a.tif', 'g/b.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'h/c.tif' });
        expect(await layers.add()).toBe(true);
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('FolderPicker');
        expect(props).toMatchObject({ mode: 'file', title: 'Add layer', initialPath: 'f', exclude: ['f/a.tif', 'g/b.tif'] });
        expect(setState).toHaveBeenCalledTimes(1);
        expect(state.value.layers.map(l => l.path)).toEqual(['h/c.tif', 'f/a.tif', 'g/b.tif']);
        expect(state.value.layers[0].hash).toBe('h-h/c.tif');
    });

    it('tells the map the path of the layer it added (FR-MAP-08), and nothing for a cancelled or refused pick', async () => {
        const onAdded = vi.fn();
        const { layers, dialogs } = open(viewOf('f/a.tif', ['f/a.tif']), { onAdded });
        await settled(layers);
        dialogs.open.mockResolvedValueOnce(null);
        await layers.add();
        expect(onAdded).not.toHaveBeenCalled();
        dialogs.open.mockResolvedValueOnce({ path: 'g/b.tif' });
        await layers.add();
        expect(onAdded).toHaveBeenCalledTimes(1);
        expect(onAdded).toHaveBeenCalledWith('g/b.tif');
    });

    it('keeps split off when it is off, and on with equal bands when it is on', async () => {
        const off = open(viewOf('a.tif', ['a.tif']));
        off.dialogs.open.mockResolvedValue({ path: 'b.tif' });
        await off.layers.add();
        expect(off.state.value.split).toEqual({ enabled: false, positions: [] });
        scope.stop();

        const on = open({ ...viewOf('a.tif', ['a.tif', 'b.tif']), split: { enabled: true, positions: [0.3] } });
        on.dialogs.open.mockResolvedValue({ path: 'c.tif' });
        await on.layers.add();
        expect(on.state.value.split.enabled).toBe(true);
        expect(on.state.value.split.positions).toHaveLength(2);
        expect(on.state.value.split.positions[0]).toBeCloseTo(1 / 3);
    });

    it('starts at the base file when the view has no layer', async () => {
        const { layers, dialogs } = open(viewOf('v/z.geojson', []), { baseEntry: entryOf('v/z.geojson', T.VECTOR) });
        dialogs.open.mockResolvedValue(null);
        await layers.add();
        expect(dialogs.open.mock.calls[0][1].initialPath).toBe('v');
    });

    it('adds nothing when the picker is cancelled', async () => {
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif']));
        dialogs.open.mockResolvedValue(null);
        expect(await layers.add()).toBe(false);
        expect(setState).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns and adds nothing for a file that is not a georaster', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, path === 'notes.md' ? T.MARKDOWN : T.GEORASTER));
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'notes.md' });
        expect(await layers.add()).toBe(false);
        expect(warn).toHaveBeenCalledWith('notes.md is not a georaster of this dataset.', { summary: 'Cannot add the layer' });
        expect(setState).not.toHaveBeenCalled();
    });

    it('warns and adds nothing for a file that is not in the dataset', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('nf');
            return entryOf(path);
        });
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'gone.tif' });
        await layers.add();
        expect(warn).toHaveBeenCalledWith('gone.tif is not a georaster of this dataset.', { summary: 'Cannot add the layer' });
        expect(setState).not.toHaveBeenCalled();
    });

    it('resolves the pick again, because a file that left the view may have been built since', async () => {
        const { layers, dialogs, state } = open(viewOf('a.tif', ['a.tif', 'b.tif']));
        await settled(layers);
        layers.remove('b.tif');
        const calls = dataset.listOne.mock.calls.filter(([p]) => p === 'b.tif').length;
        dataset.listOne.mockImplementation(async path => entryOf(path, T.GEORASTER, 'rebuilt'));
        dialogs.open.mockResolvedValue({ path: 'b.tif' });
        await layers.add();
        expect(dataset.listOne.mock.calls.filter(([p]) => p === 'b.tif').length).toBe(calls + 1);
        expect(state.value.layers[0]).toMatchObject({ path: 'b.tif', hash: 'rebuilt' });
    });

    it('does not add a file that is already a layer', async () => {
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif']));
        dialogs.open.mockResolvedValue({ path: 'a.tif' });
        expect(await layers.add()).toBe(false);
        expect(setState).not.toHaveBeenCalled();
    });

    it('respects the limit reached while the picker was open', async () => {
        const { layers, dialogs, state } = open(viewOf('1.tif', ['1.tif', '2.tif', '3.tif', '4.tif', '5.tif']));
        await settled(layers);
        dialogs.open.mockImplementation(async () => {
            state.value = viewOf('1.tif', ['1.tif', '2.tif', '3.tif', '4.tif', '5.tif', '6.tif']);
            return { path: '7.tif' };
        });
        expect(await layers.add()).toBe(false);
        expect(state.value.layers).toHaveLength(6);
    });
});

describe('useViewLayers remove and repick', () => {
    it('removes a layer through the layer rules: the base moves to the next layer', async () => {
        const { layers, state } = open(viewOf('a.tif', ['b.tif', 'a.tif']));
        layers.remove('a.tif');
        expect(state.value.layers.map(l => l.path)).toEqual(['b.tif']);
        expect(state.value.base.path).toBe('b.tif');
    });

    it('keeps the last layer and ignores a path that is not a layer', async () => {
        const { layers, setState } = open(viewOf('a.tif', ['a.tif']));
        layers.remove('a.tif');
        layers.remove('other.tif');
        expect(setState).not.toHaveBeenCalled();
    });

    it('puts the picked georaster in the place of a layer, keeping its opacity', async () => {
        const initial = viewOf('a.tif', ['a.tif', 'gone.tif']);
        initial.layers[1] = { ...initial.layers[1], opacity: 0.4 };
        const { layers, dialogs, state } = open(initial);
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'new/c.tif' });
        await layers.repick('gone.tif');
        const [, props] = dialogs.open.mock.calls[0];
        expect(props).toMatchObject({ title: 'Pick another raster', initialPath: '', exclude: ['a.tif', 'gone.tif'] });
        expect(state.value.layers.map(l => l.path)).toEqual(['a.tif', 'new/c.tif']);
        expect(state.value.layers[1]).toMatchObject({ opacity: 0.4, hash: 'h-new/c.tif' });
    });

    it('starts the replacement picker in the folder of the layer', async () => {
        const { layers, dialogs } = open(viewOf('a.tif', ['a.tif', 'x/y/gone.tif']));
        dialogs.open.mockResolvedValue(null);
        await layers.repick('x/y/gone.tif');
        expect(dialogs.open.mock.calls[0][1].initialPath).toBe('x/y');
    });

    it('warns instead of replacing a layer with a file that is not a georaster', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, path === 'notes.md' ? T.MARKDOWN : T.GEORASTER));
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif', 'b.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'notes.md' });
        await layers.repick('b.tif');
        expect(warn).toHaveBeenCalledWith('notes.md is not a georaster of this dataset.', { summary: 'Cannot add the layer' });
        expect(setState).not.toHaveBeenCalled();
    });
});

describe('useViewLayers pickFirst', () => {
    it('turns the split on when the first layer is picked', async () => {
        const { layers, dialogs, state } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'b.tif' });
        await layers.pickFirst();
        expect(dialogs.open.mock.calls[0][1].title).toBe('Add layer');
        expect(state.value.layers.map(l => l.path)).toEqual(['b.tif', 'a.tif']);
        expect(state.value.split).toEqual({ enabled: true, positions: [0.5] });
    });

    it('changes nothing when the picker is cancelled, and a later Add layer does not split', async () => {
        const { layers, dialogs, state, setState } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValueOnce(null);
        await layers.pickFirst();
        expect(setState).not.toHaveBeenCalled();

        dialogs.open.mockResolvedValueOnce({ path: 'b.tif' });
        await layers.add();
        expect(state.value.split.enabled).toBe(false);
    });

    it('does not split when the pick is refused', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, path === 'notes.md' ? T.MARKDOWN : T.GEORASTER));
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        dialogs.open.mockResolvedValue({ path: 'notes.md' });
        await layers.pickFirst();
        expect(setState).not.toHaveBeenCalled();
    });
});

describe('useViewLayers in Viewer only', () => {
    it('neither adds, picks, replaces nor removes a layer', async () => {
        const { layers, dialogs, setState } = open(viewOf('a.tif', ['a.tif', 'b.tif']), { embed: true });
        await settled(layers);
        expect(layers.canAdd.value).toBe(false);
        dialogs.open.mockResolvedValue({ path: 'c.tif' });
        expect(await layers.add()).toBe(false);
        await layers.pickFirst();
        await layers.repick('b.tif');
        layers.remove('b.tif');
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(setState).not.toHaveBeenCalled();
        expect(layers.files.value).toHaveLength(2);
    });
});

describe('useViewLayers a file that is building (FR-RAS-09, FR-XC-16)', () => {
    const FOOTPRINT = { type: 'Polygon', coordinates: [[[10, 45], [10.01, 45], [10.01, 45.01], [10, 45]]] };
    const BUILDING = { available: false, status: 'building', title: 'File Being Processed' };
    const buildEnd = (filePath, newState = 'Succeeded') => BuildManager.fire({ dataset, filePath, newState });

    beforeEach(() => {
        dataset.listOne.mockImplementation(async path => ({ ...entryOf(path), polygon_geom: FOOTPRINT }));
        availability.check.mockImplementation(async (_, entry) => (entry.path === 'raw.tif' ? BUILDING : { available: true }));
    });

    it('keeps a layer that is building as a placeholder that says so, with its footprint and its progress', async () => {
        const { layers } = open(viewOf('raw.tif', ['raw.tif']));
        await settled(layers);

        const [file] = layers.files.value;
        expect(file.entry).toBeNull();
        expect(file.placeholder).toMatchObject({ path: 'raw.tif', kind: 'building', text: 'Building: raw.tif', footprint: FOOTPRINT });
        expect(file.placeholder.progress()).toBe(40);
    });

    it('draws the raster when its build ends, without a reload', async () => {
        const { layers } = open(viewOf('raw.tif', ['raw.tif', 'a.tif']));
        await settled(layers);
        expect(layers.files.value.find(f => f.label === 'raw.tif').entry).toBeNull();

        availability.check.mockResolvedValue({ available: true });
        buildEnd('raw.tif');

        await vi.waitFor(() => expect(layers.files.value.find(f => f.label === 'raw.tif').entry).toMatchObject({ path: 'raw.tif' }));
        expect(layers.files.value.find(f => f.label === 'raw.tif').placeholder).toBeUndefined();
    });

    it('says why when the build ended without the raster', async () => {
        const { layers } = open(viewOf('raw.tif', ['raw.tif']));
        await settled(layers);

        availability.check.mockResolvedValue({ available: false, status: 'failed', title: 'Processing Error' });
        buildEnd('raw.tif', 'Failed');

        await vi.waitFor(() => expect(layers.files.value[0].placeholder.text).toBe('Processing Error: raw.tif'));
        expect(layers.files.value[0].placeholder.kind).toBe('unavailable');
    });

    it('resolves again only the layer whose build ended, and only for the end of a build', async () => {
        const { layers } = open(viewOf('raw.tif', ['raw.tif', 'a.tif']));
        await settled(layers);
        const calls = dataset.listOne.mock.calls.length;

        buildEnd('a.tif');
        buildEnd('elsewhere.tif');
        buildEnd('raw.tif', 'Processing');
        await new Promise(r => setTimeout(r, 0));
        expect(dataset.listOne.mock.calls.length).toBe(calls);

        buildEnd('raw.tif');
        await vi.waitFor(() => expect(dataset.listOne.mock.calls.length).toBe(calls + 1));
        expect(dataset.listOne).toHaveBeenLastCalledWith('raw.tif');
    });

    it('follows the dataset builds only while a layer cannot be drawn', async () => {
        BuildManager.registerDataset.mockClear();
        availability.check.mockResolvedValue({ available: true });
        const { layers } = open(viewOf('a.tif', ['a.tif']));
        await settled(layers);
        expect(BuildManager.registerDataset).not.toHaveBeenCalled();
        expect(BuildManager.listenerCount()).toBe(0);
    });
});

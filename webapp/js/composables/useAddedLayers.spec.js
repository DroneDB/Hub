import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, shallowRef, nextTick } from 'vue';
import ddb from 'ddb';
import { b64urlEncode } from '@/libs/base64';

const warn = vi.fn();
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: vi.fn().mockResolvedValue({ available: true }) } }));
vi.mock('@/components/FolderPicker.vue', () => ({ default: { name: 'FolderPicker' } }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ warn, error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/libs/routeQuery', () => ({ replaceQueryKeys: vi.fn() }));

const { replaceQueryKeys } = await import('@/libs/routeQuery');
const { default: availability } = await import('@/libs/build/fileAvailabilityChecker');
const { isGeoraster } = await import('@/libs/entryTypes');
const { useAddedLayers } = await import('./useAddedLayers');

const T = ddb.entry.type;
const entryOf = (path, type = T.GEORASTER) => ({ path, type, hash: `h-${path}` });
const enc = b64 => b64urlEncode(b64);

const dataset = {
    listOne: vi.fn(),
    remoteUri: vi.fn(path => `ddb://o/d/${path}`)
};

let scope;
function open({ main = 'f/main.tif', mainType = T.GEORASTER, layer } = {}) {
    const dialogs = { open: vi.fn() };
    const entry = shallowRef(null);
    const ds = shallowRef(dataset);
    const ddbURI = ref(`ddb://o/d/${main}`);
    let layers;
    scope = effectScope();
    scope.run(() => {
        layers = useAddedLayers({ route: { query: layer === undefined ? {} : { layer } }, dialogs, dataset: ds, entry, ddbURI });
    });
    const load = async () => {
        entry.value = entryOf(main, mainType);
        await vi.waitFor(() => expect(layers.pending.value).toBe(false));
    };
    return { layers, dialogs, entry, load };
}

beforeEach(() => {
    replaceQueryKeys.mockClear();
    warn.mockClear();
    dataset.listOne.mockReset();
    dataset.listOne.mockImplementation(async path => entryOf(path));
});
afterEach(() => scope?.stop());

describe('useAddedLayers load', () => {
    it('has no files while the entry is not known, and is not pending', () => {
        const { layers } = open({ layer: enc('a.tif') });
        expect(layers.files.value).toEqual([]);
        expect(layers.pending.value).toBe(false);
    });

    it('lists the main file first, then the layers of the address in order', async () => {
        const { layers, load } = open({ layer: [enc('a.tif'), enc('z/b.tif')] });
        await load();
        expect(layers.addedPaths.value).toEqual(['a.tif', 'z/b.tif']);
        expect(layers.files.value.map(f => f.label)).toEqual(['main.tif', 'a.tif', 'b.tif']);
        // The main file keeps the shape the map always had
        expect(layers.files.value[0]).toEqual({ path: 'ddb://o/d/f/main.tif', entry: entryOf('f/main.tif'), label: 'main.tif', selected: false });
        expect(layers.files.value[1]).toEqual({ path: 'ddb://o/d/a.tif', entry: entryOf('a.tif'), label: 'a.tif', selected: false });
        expect(replaceQueryKeys).not.toHaveBeenCalled();
    });

    it('accepts a single value', async () => {
        const { layers, load } = open({ layer: enc('a.tif') });
        await load();
        expect(layers.addedPaths.value).toEqual(['a.tif']);
    });

    it('ignores what cannot be read, the main file and repeats', async () => {
        const { layers, load } = open({ layer: ['***', enc('../x.tif'), enc('f/main.tif'), enc('a.tif'), enc('a.tif')] });
        await load();
        expect(layers.addedPaths.value).toEqual(['a.tif']);
    });

    it('keeps the first three', async () => {
        const { layers, load } = open({ layer: ['a', 'b', 'c', 'd'].map(n => enc(`${n}.tif`)) });
        await load();
        expect(layers.addedPaths.value).toEqual(['a.tif', 'b.tif', 'c.tif']);
        expect(layers.atLimit.value).toBe(true);
        expect(layers.addTitle.value).toBe('Up to 3 layers can be added');
    });

    it('takes no layer when the main file is not a georaster', async () => {
        const { layers, load } = open({ mainType: T.GEOIMAGE, layer: enc('a.tif') });
        await load();
        expect(layers.addedPaths.value).toEqual([]);
        expect(layers.files.value).toHaveLength(1);
        expect(layers.canAdd.value).toBe(false);
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('keeps a layer that fails as a placeholder and the others on show', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('not found');
            return entryOf(path);
        });
        const { layers, load } = open({ layer: [enc('gone.tif'), enc('a.tif')] });
        await load();
        const [, gone, a] = layers.files.value;
        expect(gone.entry).toBeNull();
        expect(gone.placeholder).toEqual({ path: 'gone.tif', kind: 'missing', text: 'Missing: gone.tif' });
        expect(a.entry).toEqual(entryOf('a.tif'));
        expect(layers.addedPaths.value).toEqual(['gone.tif', 'a.tif']);
    });
});

describe('useAddedLayers load of a file that is not a georaster', () => {
    it('keeps a layer of the address that is not a georaster as a placeholder with its reason', async () => {
        dataset.listOne.mockImplementation(async path => entryOf(path, path === 'notes.txt' ? T.GENERIC : T.GEORASTER));
        const { layers, load } = open({ layer: [enc('notes.txt'), enc('a.tif')] });
        await load();
        const [, notes, a] = layers.files.value;
        expect(notes.entry).toBeNull();
        expect(notes.placeholder.path).toBe('notes.txt');
        expect(notes.placeholder.text).toMatch(/notes\.txt$/);
        expect(a.entry).toEqual(entryOf('a.tif'));
        expect(layers.addedPaths.value).toEqual(['notes.txt', 'a.tif']);
    });
});

describe('useAddedLayers and the address', () => {
    afterEach(() => window.history.replaceState({}, '', '/'));

    it('writes the layers to the address of the page, keeping the other keys and the hash, with no new history entry', async () => {
        const actual = await vi.importActual('@/libs/routeQuery');
        replaceQueryKeys.mockImplementation(actual.replaceQueryKeys);
        window.history.replaceState({}, '', '/r/o/d/view/x/map?embed=1&layer=old#ph=ndvi');
        const length = window.history.length;
        const { layers, dialogs, load } = open({ layer: enc('a.tif') });
        await load();
        dialogs.open.mockResolvedValue({ path: 'b.tif' });
        await layers.add();
        expect(window.location.search).toBe(`?embed=1&layer=${enc('a.tif')}&layer=${enc('b.tif')}`);
        expect(window.location.hash).toBe('#ph=ndvi');
        layers.remove('a.tif');
        layers.remove('b.tif');
        expect(window.location.search).toBe('?embed=1');
        expect(window.location.hash).toBe('#ph=ndvi');
        expect(window.history.length).toBe(length);
    });
});

describe('useAddedLayers add and remove', () => {
    it('opens the picker in the folder of the main file for georasters, excluding the files on show', async () => {
        const { layers, dialogs, load } = open({ layer: enc('a.tif') });
        await load();
        dialogs.open.mockResolvedValue(null);
        await layers.add();
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('FolderPicker');
        expect(props).toMatchObject({ mode: 'file', title: 'Add layer', initialPath: 'f', exclude: ['f/main.tif', 'a.tif'], accept: isGeoraster });
        expect(replaceQueryKeys).not.toHaveBeenCalled();
    });

    it('appends the picked layer at the top and writes the query in the order of addition', async () => {
        const { layers, dialogs, load } = open({ layer: enc('a.tif') });
        await load();
        dialogs.open.mockResolvedValue({ path: 'b.tif', entry: entryOf('b.tif') });
        await layers.add();
        expect(layers.addedPaths.value).toEqual(['a.tif', 'b.tif']);
        expect(layers.files.value.map(f => f.label)).toEqual(['main.tif', 'a.tif', 'b.tif']);
        expect(replaceQueryKeys).toHaveBeenCalledTimes(1);
        expect(replaceQueryKeys).toHaveBeenCalledWith({ layer: [enc('a.tif'), enc('b.tif')] });
    });

    it('does not show the picked layer as missing while it loads', async () => {
        const { layers, dialogs, load } = open();
        await load();
        let release;
        dataset.listOne.mockImplementation(path => new Promise(resolve => { release = () => resolve(entryOf(path)); }));
        dialogs.open.mockResolvedValue({ path: 'b.tif' });
        const adding = layers.add();
        await vi.waitFor(() => expect(release).toBeDefined());
        expect(layers.files.value).toHaveLength(1);
        release();
        await adding;
        expect(layers.files.value[1].entry).toEqual(entryOf('b.tif'));
    });

    it('adds nothing when the picker is closed', async () => {
        const { layers, dialogs, load } = open();
        await load();
        dialogs.open.mockResolvedValue(null);
        await layers.add();
        expect(layers.addedPaths.value).toEqual([]);
        expect(replaceQueryKeys).not.toHaveBeenCalled();
    });

    it('warns and adds nothing for a pick that is not a georaster of the dataset', async () => {
        const { layers, dialogs, load } = open();
        await load();
        dataset.listOne.mockImplementation(async path => entryOf(path, T.GENERIC));
        dialogs.open.mockResolvedValue({ path: 'n.txt' });
        await layers.add();
        expect(layers.addedPaths.value).toEqual([]);
        expect(warn).toHaveBeenCalled();
        expect(replaceQueryKeys).not.toHaveBeenCalled();
    });

    it('removes a layer by path and writes the query; the main file cannot be removed', async () => {
        const { layers, load } = open({ layer: [enc('a.tif'), enc('b.tif')] });
        await load();
        layers.remove('f/main.tif');
        layers.remove('nope.tif');
        expect(replaceQueryKeys).not.toHaveBeenCalled();
        layers.remove('a.tif');
        expect(layers.addedPaths.value).toEqual(['b.tif']);
        expect(layers.files.value.map(f => f.label)).toEqual(['main.tif', 'b.tif']);
        expect(replaceQueryKeys).toHaveBeenCalledWith({ layer: [enc('b.tif')] });
        layers.remove('b.tif');
        expect(replaceQueryKeys).toHaveBeenLastCalledWith({ layer: [] });
    });

    it('stops adding at the limit, placeholders counting, and adds again after a removal', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('not found');
            return entryOf(path);
        });
        const { layers, dialogs, load } = open({ layer: [enc('gone.tif'), enc('a.tif'), enc('b.tif')] });
        await load();
        expect(layers.atLimit.value).toBe(true);
        dialogs.open.mockResolvedValue({ path: 'c.tif' });
        await layers.add();
        expect(dialogs.open).not.toHaveBeenCalled();
        layers.remove('gone.tif');
        expect(layers.atLimit.value).toBe(false);
        expect(layers.addTitle.value).toBe('');
        await layers.add();
        expect(layers.addedPaths.value).toEqual(['a.tif', 'b.tif', 'c.tif']);
    });

    it('reads a removed missing layer again when it is picked back, once it is there', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'late.tif') throw new Error('not found');
            return entryOf(path);
        });
        const { layers, dialogs, load } = open({ layer: enc('late.tif') });
        await load();
        layers.remove('late.tif');
        // Uploaded meanwhile
        dataset.listOne.mockImplementation(async path => entryOf(path));
        dialogs.open.mockResolvedValue({ path: 'late.tif' });
        await layers.add();
        expect(dataset.listOne).toHaveBeenLastCalledWith('late.tif');
        expect(warn).not.toHaveBeenCalled();
        expect(layers.addedPaths.value).toEqual(['late.tif']);
        expect(layers.files.value[1].placeholder).toBeUndefined();
    });

    it('shows a removed layer that was building as built when it is picked back', async () => {
        availability.check.mockResolvedValueOnce({ available: false, title: 'Building' });
        const { layers, dialogs, load } = open({ layer: enc('a.tif') });
        await load();
        expect(layers.files.value[1].placeholder.text).toBe('Building: a.tif');
        layers.remove('a.tif');
        dialogs.open.mockResolvedValue({ path: 'a.tif' });
        await layers.add();
        expect(layers.addedPaths.value).toEqual(['a.tif']);
        expect(layers.files.value[1].placeholder).toBeUndefined();
        expect(layers.files.value[1].entry).toEqual(entryOf('a.tif'));
    });

    it('does not add when the limit was reached while the picker was open', async () => {
        const { layers, dialogs, load } = open({ layer: [enc('a.tif'), enc('b.tif')] });
        await load();
        dialogs.open.mockImplementation(async () => {
            layers.addedPaths.value = [...layers.addedPaths.value, 'x.tif'];
            return { path: 'c.tif' };
        });
        await layers.add();
        expect(layers.addedPaths.value).toEqual(['a.tif', 'b.tif', 'x.tif']);
        expect(replaceQueryKeys).not.toHaveBeenCalled();
    });

    it('does not add on a map whose file is not a georaster', async () => {
        const { layers, dialogs, load } = open({ mainType: T.GEOIMAGE });
        await load();
        await layers.add();
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('reads the address once: a later change of the entry does not reload the layers', async () => {
        const { layers, entry, load } = open({ layer: enc('a.tif') });
        await load();
        layers.remove('a.tif');
        entry.value = { ...entry.value, hash: 'new' };
        await nextTick();
        expect(layers.addedPaths.value).toEqual([]);
    });
});

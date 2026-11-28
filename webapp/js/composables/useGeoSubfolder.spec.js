/**
 * useGeoSubfolder: a folder with nothing for the map and a subfolder that has it. The Registry is asked for the first
 * photo below the folder (a limit of one), and for the first entry of each other geo type only when there is none: one
 * answer of one entry, however many photos a subfolder holds. A first entry with no place on the map, which may hide
 * others of its type that have one, and a Registry older than the limit, ask about the subfolders one at a time
 * instead. The hint names the first that holds geo entries; nothing is asked when it cannot help.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import ddb from 'ddb';
import { useGeoSubfolder, geoSubfolderOf, isGeoEntry, GEO_TYPES, MAX_FOLDER_PROBES } from './useGeoSubfolder';

const T = ddb.entry.type;
const POINT = { type: 'Point', coordinates: [10, 45] };
const photo = path => ({ path, type: T.GEOIMAGE, point_geom: POINT });
const raster = path => ({ path, type: T.GEORASTER, polygon_geom: { type: 'Polygon', coordinates: [] } });
const plain = path => ({ path, type: T.GENERIC });
const folder = path => ({ path, type: T.DIRECTORY });
const item = entry => ({ entry });
const cloud = path => ({ path, type: T.POINTCLOUD, polygon_geom: { type: 'Polygon', coordinates: [] } });
const model = (path, georeferenced = true) => ({ path, type: T.MODEL, ...(georeferenced ? { polygon_geom: { type: 'Polygon', coordinates: [] } } : {}) });

/**
 * The search of a dataset over these entries, as the Registry answers it: the entries below `path` (its own only when
 * not recursive), of the type asked, by path, at most `limit` of them; an older Registry (`limits: false`) ignores the
 * limit. Every request and the number of entries it answered are recorded.
 */
function indexOf(entries, { limits = true } = {}) {
    const requests = [];
    const search = vi.fn(async (query, { path, recursive = true, type, limit } = {}) => {
        const prefix = path ? `${path}/` : '';
        let found = entries
            .filter(e => e.path.startsWith(prefix) && (recursive || !e.path.slice(prefix.length).includes('/')))
            .filter(e => type === undefined || e.type === type)
            .sort((a, b) => (a.path < b.path ? -1 : 1));
        if (limits && limit) found = found.slice(0, limit);
        requests.push({ path, recursive, type, limit, answered: found.length });
        return found;
    });
    return { search, requests };
}

describe('geoSubfolderOf', () => {
    it('names the subfolder of 18 photos: "Photos are in images"', () => {
        const found = Array.from({ length: 18 }, (_, i) => photo(`images/DJI_${i}.JPG`));
        expect(geoSubfolderOf([...found, plain('images/readme.txt')], null))
            .toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' });
    });

    it('says "Map files" when what the subfolder holds is not only photos', () => {
        expect(geoSubfolderOf([photo('data/a.jpg'), raster('data/dsm.tif')], null).text).toBe('Map files are in data');
    });

    it('takes the first subfolder by name, with the path from the dataset root, below a folder', () => {
        const found = [photo('site/zeta/z.jpg'), photo('site/alpha/deep/a.jpg'), photo('site/beta/b.jpg')];
        expect(geoSubfolderOf(found, 'site')).toEqual({ folder: 'alpha', path: 'site/alpha', text: 'Photos are in alpha' });
    });

    it('is null without a geo entry in a subfolder: files with no place, folders, entries of the folder itself, other folders', () => {
        expect(geoSubfolderOf([plain('a/x.txt'), folder('a/b'), photo('top.jpg'), photo('other/o.jpg')], 'a')).toBeNull();
        expect(geoSubfolderOf([], null)).toBeNull();
        expect(geoSubfolderOf(undefined, null)).toBeNull();
    });

    it('does not take a folder for a geo entry', () => {
        expect(isGeoEntry({ path: 'a', type: T.DIRECTORY, polygon_geom: { type: 'Polygon' } })).toBe(false);
        expect(isGeoEntry(photo('a.jpg'))).toBe(true);
        expect(isGeoEntry(plain('a.txt'))).toBe(false);
    });
});

describe('useGeoSubfolder', () => {
    let scope;
    let dataset;
    let files;
    let currentPath;
    let loading;
    let hint;
    let active;
    let datasetRef;
    const ROOT_IMAGES = [folder('images'), photo('images/a.jpg'), photo('images/b.jpg')];

    function start(options = {}) {
        scope = effectScope();
        datasetRef = ref(options.dataset === undefined ? dataset : options.dataset);
        scope.run(() => {
            ({ hint } = useGeoSubfolder({ dataset: datasetRef, files: () => files.value, currentPath: () => currentPath.value, loading: () => loading.value, active: () => active.value }));
        });
    }
    const settle = () => new Promise(r => setTimeout(r, 0));

    beforeEach(() => {
        dataset = indexOf(ROOT_IMAGES);
        files = ref([item(folder('images'))]);
        currentPath = ref(null);
        loading = ref(false);
        active = ref(true);
    });
    afterEach(() => scope?.stop());

    // The common case (the photos of a dataset in images/) is one request
    it('asks for the first photo below the folder only, in one request, and names its subfolder', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' }));
        expect(dataset.requests).toEqual([{ path: undefined, recursive: true, type: T.GEOIMAGE, limit: 1, answered: 1 }]);
    });

    it('asks for the first entry of each other geo type when there is no photo', async () => {
        dataset = indexOf([folder('dem'), raster('dem/dsm.tif')]);
        files.value = [item(folder('dem'))];
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'dem', path: 'dem', text: 'Map files are in dem' }));
        expect(dataset.requests.map(r => r.type)).toEqual([...GEO_TYPES]);
        expect(dataset.requests.every(r => r.limit === 1 && r.recursive === true && r.path === undefined)).toBe(true);
    });

    // A dataset of 20,000 photos in images/ downloaded all of them for one sentence
    it('downloads no listing of a big subfolder: a few answers of one entry', async () => {
        dataset = indexOf([folder('images'), ...Array.from({ length: 20000 }, (_, i) => photo(`images/DJI_${String(i).padStart(5, '0')}.JPG`))]);
        start();
        await vi.waitFor(() => expect(hint.value?.text).toBe('Photos are in images'));
        expect(dataset.requests.length).toBeLessThanOrEqual(GEO_TYPES.length);
        expect(dataset.requests.every(r => r.limit === 1)).toBe(true);
        expect(dataset.requests.reduce((sum, r) => sum + r.answered, 0)).toBeLessThanOrEqual(GEO_TYPES.length);
    });

    it('asks below the folder on show, not the whole dataset', async () => {
        currentPath.value = 'site';
        files.value = [item(folder('site/images'))];
        dataset = indexOf([photo('other/x.jpg'), photo('site/images/a.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value?.path).toBe('site/images'));
        expect(dataset.requests.every(r => r.path === 'site')).toBe(true);
    });

    it('names the first subfolder by path that holds a geo entry of any type when there is no photo', async () => {
        files.value = [item(folder('zeta')), item(folder('alpha')), item(folder('beta')), item(folder('gamma'))];
        dataset = indexOf([plain('alpha/readme.txt'), raster('beta/dsm.tif'), cloud('gamma/scan.laz'), cloud('zeta/z.laz')]);
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'beta', path: 'beta', text: 'Map files are in beta' }));
    });

    it('names the subfolder of the first photo by path, at any depth, before the other types', async () => {
        files.value = [item(folder('a')), item(folder('b')), item(folder('c'))];
        dataset = indexOf([raster('a/dsm.tif'), photo('b/x/y/p.jpg'), photo('c/q.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'b', path: 'b', text: 'Photos are in b' }));
        expect(dataset.requests).toHaveLength(1);
    });

    // The search stops at the first model, which has no place on the map: the georeferenced one in b/ comes after it
    it('walks the folders when the first entry of a type has no place on the map, and finds those of the type that have one', async () => {
        files.value = [item(folder('a')), item(folder('b'))];
        dataset = indexOf([folder('a'), folder('b'), model('a/model.obj', false), model('b/model_geo.obj')]);
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'b', path: 'b', text: 'Map files are in b' }));
        expect(dataset.requests.slice(GEO_TYPES.length).map(r => [r.path, r.recursive, r.limit])).toEqual([['a', false, undefined], ['b', false, undefined]]);
    });

    it('walks the folders when the first photo has no place on the map', async () => {
        files.value = [item(folder('a')), item(folder('b'))];
        dataset = indexOf([folder('a'), folder('b'), { path: 'a/p.jpg', type: T.GEOIMAGE }, photo('b/q.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'b', path: 'b', text: 'Photos are in b' }));
        expect(dataset.requests.map(r => [r.path, r.type])).toEqual([[undefined, T.GEOIMAGE], ['a', undefined], ['b', undefined]]);
    });

    it('asks nothing when the folder has an entry for the map itself', async () => {
        files.value = [item(folder('images')), item(photo('own.jpg'))];
        start();
        await nextTick();
        expect(dataset.search).not.toHaveBeenCalled();
        expect(hint.value).toBeNull();
    });

    it('asks nothing when the folder has no subfolder, or is still being listed, or there is no dataset', async () => {
        files.value = [item(plain('notes.txt'))];
        start();
        await nextTick();
        scope.stop();
        files.value = [item(folder('images'))];
        loading.value = true;
        start();
        await nextTick();
        scope.stop();
        loading.value = false;
        start({ dataset: null });
        await nextTick();
        expect(dataset.search).not.toHaveBeenCalled();
    });

    it('has no hint when no subfolder holds geo entries', async () => {
        dataset = indexOf([folder('images'), plain('images/readme.txt')]);
        start();
        await vi.waitFor(() => expect(dataset.search).toHaveBeenCalled());
        await settle();
        expect(hint.value).toBeNull();
    });

    it('drops the hint when the user goes to another folder, and asks again for it when it has the same need', async () => {
        dataset = indexOf([...ROOT_IMAGES, photo('other/x/p.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        const asked = dataset.search.mock.calls.length;

        files.value = [item(photo('images/a.jpg'))];
        currentPath.value = 'images';
        await nextTick();
        expect(hint.value).toBeNull();
        expect(dataset.search).toHaveBeenCalledTimes(asked);

        files.value = [item(folder('other/x'))];
        currentPath.value = 'other';
        await vi.waitFor(() => expect(hint.value?.path).toBe('other/x'));
        expect(dataset.search.mock.calls.length).toBe(asked * 2);
    });

    it('does not ask again when the items change but the answer would not (an upload that is not a geo entry)', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        const asked = dataset.search.mock.calls.length;
        files.value = [...files.value, item(plain('notes.txt'))];
        await nextTick();
        expect(dataset.search).toHaveBeenCalledTimes(asked);
        expect(hint.value).not.toBeNull();
    });

    it('drops the answer of a search that a later visit overtook', async () => {
        let release;
        const search = dataset.search.getMockImplementation();
        dataset.search.mockImplementationOnce((...a) => new Promise(resolve => { release = () => resolve(search(...a)); }));
        start();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        files.value = [item(photo('own.jpg'))];
        await nextTick();
        release();
        await settle();
        expect(hint.value).toBeNull();
    });

    it('leaves the empty map as it was when the search fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        dataset.search.mockRejectedValue(new Error('boom'));
        start();
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
        expect(hint.value).toBeNull();
        warn.mockRestore();
    });

    // The page keeps the map mounted behind its other tabs; a folder visit there asks nothing
    it('asks nothing while the map is hidden, and asks when it shows', async () => {
        dataset = indexOf([photo('site/images/a.jpg')]);
        active.value = false;
        start();
        await nextTick();
        currentPath.value = 'site';
        files.value = [item(folder('site/images'))];
        await nextTick();
        expect(dataset.search).not.toHaveBeenCalled();
        expect(hint.value).toBeNull();

        active.value = true;
        await vi.waitFor(() => expect(hint.value?.path).toBe('site/images'));
    });

    it('stops a search when the map is hidden, and shows the kept answer, with no new search, when it shows again', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        const asked = dataset.search.mock.calls.length;
        active.value = false;
        await nextTick();
        expect(hint.value).toBeNull();
        active.value = true;
        await nextTick();
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' });
        expect(dataset.search).toHaveBeenCalledTimes(asked);

        let signal;
        dataset.search.mockImplementationOnce((q, options) => { signal = options.signal; return new Promise(() => {}); });
        currentPath.value = 'other';
        files.value = [item(folder('other/x'))];
        await vi.waitFor(() => expect(signal).toBeDefined());
        active.value = false;
        await nextTick();
        expect(signal.aborted).toBe(true);
    });

    it('keeps the answer of a folder: back at the root from images/, nothing is asked again', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        const asked = dataset.search.mock.calls.length;
        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        expect(hint.value).toBeNull();

        currentPath.value = null;
        files.value = [item(folder('images'))];
        await nextTick();
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' });
        expect(dataset.search).toHaveBeenCalledTimes(asked);
    });

    it('asks again for a folder whose listing changed since its answer (a folder added, moved or removed)', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        const asked = dataset.search.mock.calls.length;
        // A folder added at the root: the answer may be another now, the next visit asks
        files.value = [item(folder('images')), item(folder('aerial'))];
        await nextTick();
        expect(dataset.search).toHaveBeenCalledTimes(asked);

        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        const search = indexOf([photo('aerial/p.jpg'), photo('images/a.jpg')]).search;
        dataset.search.mockImplementation(search);
        currentPath.value = null;
        files.value = [item(folder('images')), item(folder('aerial'))];
        await vi.waitFor(() => expect(hint.value?.folder).toBe('aerial'));
    });

    it('asks again when the search failed, and for another dataset', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        dataset.search.mockRejectedValueOnce(new Error('boom'));
        start();
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        currentPath.value = null;
        files.value = [item(folder('images'))];
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        warn.mockRestore();

        const other = indexOf([photo('images/x.jpg')]);
        datasetRef.value = other;
        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        currentPath.value = null;
        files.value = [item(folder('images'))];
        await vi.waitFor(() => expect(other.search).toHaveBeenCalled());
    });
});

describe('useGeoSubfolder with a Registry older than the search limit', () => {
    let scope;
    let hint;
    const files = ref([]);
    function start(dataset, path = null) {
        scope = effectScope();
        scope.run(() => { ({ hint } = useGeoSubfolder({ dataset, files: () => files.value, currentPath: () => path })); });
    }
    afterEach(() => scope?.stop());

    it('asks about the subfolders one at a time from then on, each for its own entries, and stops at the first that holds a geo entry', async () => {
        const registry = {};
        const index = indexOf([folder('zeta'), plain('alpha/readme.txt'), raster('beta/dsm.tif'), photo('beta/p.jpg'), photo('beta/q.jpg'), photo('zeta/z.jpg')], { limits: false });
        const dataset = { registry, search: index.search };
        files.value = [item(folder('zeta')), item(folder('alpha')), item(folder('beta'))];
        start(dataset);
        await vi.waitFor(() => expect(hint.value?.folder).toBe('beta'));
        // The photos answered with more than one entry: no other type is asked about
        expect(index.requests).toHaveLength(1);
        scope.stop();

        // The next look of that Registry goes folder by folder: alpha, then beta, gamma and zeta are not asked about
        index.requests.length = 0;
        start({ registry, search: index.search });
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'beta', path: 'beta', text: 'Map files are in beta' }));
        expect(index.requests.map(r => [r.path, r.recursive, r.limit])).toEqual([['alpha', false, undefined], ['beta', false, undefined]]);
    });

    it('tells an older Registry by the other types when there is at most one photo, and goes folder by folder from then on', async () => {
        const registry = {};
        const index = indexOf([folder('a'), folder('b'), raster('b/dsm.tif'), raster('b/dtm.tif')], { limits: false });
        files.value = [item(folder('a')), item(folder('b'))];
        start({ registry, search: index.search });
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'b', path: 'b', text: 'Map files are in b' }));
        expect(index.requests).toHaveLength(GEO_TYPES.length);
        scope.stop();

        index.requests.length = 0;
        start({ registry, search: index.search });
        await vi.waitFor(() => expect(hint.value?.folder).toBe('b'));
        expect(index.requests.map(r => [r.path, r.recursive])).toEqual([['a', false], ['b', false]]);
    });

    it('follows a subfolder down its own tree before the next one, and asks about a bounded number of folders', async () => {
        const registry = {};
        // A first look that tells the Registry ignores the limit
        const first = indexOf([photo('x/a.jpg'), photo('x/b.jpg')], { limits: false });
        files.value = [item(folder('x'))];
        start({ registry, search: first.search });
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        scope.stop();

        const tree = indexOf([folder('a/x'), plain('a/n.txt'), folder('a/x/y'), photo('a/x/y/p.jpg')], { limits: false });
        files.value = [item(folder('a')), item(folder('b'))];
        start({ registry, search: tree.search });
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'a', path: 'a', text: 'Photos are in a' }));
        expect(tree.requests.map(r => r.path)).toEqual(['a', 'a/x', 'a/x/y']);
        scope.stop();

        let count = 0;
        // Every folder holds one more folder and nothing for the map
        const deep = { registry, search: vi.fn(async (q, { path }) => { count++; return [folder(`${path}/d`)]; }) };
        files.value = [item(folder('d'))];
        start(deep);
        await vi.waitFor(() => expect(count).toBe(MAX_FOLDER_PROBES));
        await new Promise(r => setTimeout(r, 0));
        expect(count).toBe(MAX_FOLDER_PROBES);
        expect(hint.value).toBeNull();
    });
});

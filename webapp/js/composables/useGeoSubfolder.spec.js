/**
 * useGeoSubfolder (FR-MAP-10): a folder with nothing for the map and a subfolder that has it. The subfolders are asked
 * one at a time (never a recursive search), the hint names the first that holds geo entries; nothing is asked when it
 * cannot help.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import ddb from 'ddb';
import { useGeoSubfolder, geoSubfolderOf, isGeoEntry, MAX_FOLDER_PROBES } from './useGeoSubfolder';

const T = ddb.entry.type;
const POINT = { type: 'Point', coordinates: [10, 45] };
const photo = path => ({ path, type: T.GEOIMAGE, point_geom: POINT });
const raster = path => ({ path, type: T.GEORASTER, polygon_geom: { type: 'Polygon', coordinates: [] } });
const plain = path => ({ path, type: T.GENERIC });
const folder = path => ({ path, type: T.DIRECTORY });
const item = entry => ({ entry });

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
    const ROOT_IMAGES = [photo('images/a.jpg'), photo('images/b.jpg')];

    let active;
    let datasetRef;

    function start(options = {}) {
        scope = effectScope();
        datasetRef = ref(options.dataset === undefined ? dataset : options.dataset);
        scope.run(() => {
            ({ hint } = useGeoSubfolder({ dataset: datasetRef, files: () => files.value, currentPath: () => currentPath.value, loading: () => loading.value, active: () => active.value }));
        });
    }

    beforeEach(() => {
        dataset = { search: vi.fn(async () => ROOT_IMAGES) };
        files = ref([item(folder('images'))]);
        currentPath = ref(null);
        loading = ref(false);
        active = ref(true);
    });
    afterEach(() => scope?.stop());

    it('asks about the one subfolder of a folder, only for its own entries, and names it', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' }));
        expect(dataset.search).toHaveBeenCalledTimes(1);
        // The subfolder, not the whole dataset, and not its subfolders: a recursive search returns every entry that has a place
        expect(dataset.search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'images', recursive: false }));
    });

    it('asks about the subfolders of the folder on show, not the whole dataset', async () => {
        currentPath.value = 'site';
        files.value = [item(folder('site/images'))];
        dataset.search.mockResolvedValue([photo('site/images/a.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value?.path).toBe('site/images'));
        expect(dataset.search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'site/images', recursive: false }));
        expect(dataset.search.mock.calls.every(([, o]) => o.recursive === false)).toBe(true);
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
        dataset.search.mockResolvedValue([plain('images/readme.txt')]);
        start();
        await vi.waitFor(() => expect(dataset.search).toHaveBeenCalled());
        await nextTick();
        expect(hint.value).toBeNull();
    });

    it('drops the hint when the user goes to another folder, and asks again for it when it has the same need', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());

        files.value = [item(photo('images/a.jpg'))];
        currentPath.value = 'images';
        await nextTick();
        expect(hint.value).toBeNull();
        expect(dataset.search).toHaveBeenCalledTimes(1);

        files.value = [item(folder('other/x'))];
        currentPath.value = 'other';
        dataset.search.mockResolvedValue([photo('other/x/p.jpg')]);
        await vi.waitFor(() => expect(hint.value?.path).toBe('other/x'));
        expect(dataset.search).toHaveBeenCalledTimes(2);
    });

    it('does not ask again when the items change but the answer would not (an upload that is not a geo entry)', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        files.value = [...files.value, item(plain('notes.txt'))];
        await nextTick();
        expect(dataset.search).toHaveBeenCalledTimes(1);
        expect(hint.value).not.toBeNull();
    });

    it('drops the answer of a search that a later visit overtook', async () => {
        let release;
        dataset.search.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(ROOT_IMAGES); }));
        start();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        files.value = [item(photo('own.jpg'))];
        await nextTick();
        release();
        await new Promise(r => setTimeout(r, 0));
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

    // FR-MAP-10: the page keeps the map mounted behind its other tabs; a folder visit there asks nothing
    it('asks nothing while the map is hidden, and asks when it shows', async () => {
        active.value = false;
        start();
        await nextTick();
        currentPath.value = 'site';
        files.value = [item(folder('site/images'))];
        await nextTick();
        expect(dataset.search).not.toHaveBeenCalled();
        expect(hint.value).toBeNull();

        dataset.search.mockResolvedValue([photo('site/images/a.jpg')]);
        active.value = true;
        await vi.waitFor(() => expect(hint.value?.path).toBe('site/images'));
        expect(dataset.search).toHaveBeenCalledTimes(1);
    });

    it('stops a search when the map is hidden, and shows the kept answer, with no new search, when it shows again', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        active.value = false;
        await nextTick();
        expect(hint.value).toBeNull();
        active.value = true;
        await nextTick();
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' });
        expect(dataset.search).toHaveBeenCalledTimes(1);

        let signal;
        dataset.search.mockImplementationOnce((q, options) => { signal = options.signal; return new Promise(() => {}); });
        currentPath.value = 'other';
        files.value = [item(folder('other/x'))];
        await vi.waitFor(() => expect(signal).toBeDefined());
        active.value = false;
        await nextTick();
        expect(signal.aborted).toBe(true);
    });

    it('goes through the subfolders by name and stops at the first that holds a geo entry', async () => {
        files.value = [item(folder('zeta')), item(folder('alpha')), item(folder('beta')), item(folder('gamma'))];
        const asked = [];
        dataset.search.mockImplementation(async (q, { path }) => {
            asked.push(path);
            return path === 'beta' ? [raster('beta/dsm.tif')] : [plain(`${path}/readme.txt`)];
        });
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'beta', path: 'beta', text: 'Map files are in beta' }));
        // alpha, then beta: gamma and zeta are not asked about
        expect(asked).toEqual(['alpha', 'beta']);
    });

    it('follows a subfolder down its own tree before the next one, and names the folder of the folder on show', async () => {
        files.value = [item(folder('a')), item(folder('b'))];
        const tree = {
            a: [folder('a/x'), plain('a/n.txt')],
            'a/x': [folder('a/x/y')],
            'a/x/y': [photo('a/x/y/p.jpg')]
        };
        const asked = [];
        dataset.search.mockImplementation(async (q, { path }) => { asked.push(path); return tree[path] ?? []; });
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'a', path: 'a', text: 'Photos are in a' }));
        expect(asked).toEqual(['a', 'a/x', 'a/x/y']);
    });

    it('asks about no more than a bounded number of folders, then has no hint', async () => {
        files.value = [item(folder('d'))];
        let count = 0;
        // Every folder holds one more folder and nothing for the map
        dataset.search.mockImplementation(async (q, { path }) => { count++; return [folder(`${path}/d`)]; });
        start();
        await vi.waitFor(() => expect(count).toBe(MAX_FOLDER_PROBES));
        await new Promise(r => setTimeout(r, 0));
        expect(count).toBe(MAX_FOLDER_PROBES);
        expect(hint.value).toBeNull();
    });

    it('keeps the answer of a folder: back at the root from images/, nothing is asked again', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        expect(hint.value).toBeNull();

        currentPath.value = null;
        files.value = [item(folder('images'))];
        await nextTick();
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images' });
        expect(dataset.search).toHaveBeenCalledTimes(1);
    });

    it('asks again for a folder whose listing changed since its answer (a folder added, moved or removed)', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).not.toBeNull());
        // A folder added at the root: the answer may be another now, the next visit asks
        files.value = [item(folder('images')), item(folder('aerial'))];
        await nextTick();
        expect(dataset.search).toHaveBeenCalledTimes(1);

        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        dataset.search.mockResolvedValue([photo('aerial/p.jpg'), photo('images/a.jpg')]);
        currentPath.value = null;
        files.value = [item(folder('images')), item(folder('aerial'))];
        await vi.waitFor(() => expect(hint.value?.folder).toBe('aerial'));
        expect(dataset.search).toHaveBeenCalledTimes(2);
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
        expect(dataset.search).toHaveBeenCalledTimes(2);
        warn.mockRestore();

        const other = { search: vi.fn(async () => [photo('images/x.jpg')]) };
        datasetRef.value = other;
        currentPath.value = 'images';
        files.value = [item(photo('images/a.jpg'))];
        await nextTick();
        currentPath.value = null;
        files.value = [item(folder('images'))];
        await vi.waitFor(() => expect(other.search).toHaveBeenCalledTimes(1));
    });
});

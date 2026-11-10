/**
 * useGeoSubfolder (FR-MAP-10): a folder with nothing for the map and a subfolder that has it. One search under the
 * folder, the hint names the first subfolder that holds geo entries; nothing is asked when it cannot help.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import ddb from 'ddb';
import { useGeoSubfolder, geoSubfolderOf, isGeoEntry } from './useGeoSubfolder';

const T = ddb.entry.type;
const POINT = { type: 'Point', coordinates: [10, 45] };
const photo = path => ({ path, type: T.GEOIMAGE, point_geom: POINT });
const raster = path => ({ path, type: T.GEORASTER, polygon_geom: { type: 'Polygon', coordinates: [] } });
const plain = path => ({ path, type: T.GENERIC });
const folder = path => ({ path, type: T.DIRECTORY });
const item = entry => ({ entry });

describe('geoSubfolderOf', () => {
    it('names the subfolder of 18 photos: "Photos are in images/"', () => {
        const found = Array.from({ length: 18 }, (_, i) => photo(`images/DJI_${i}.JPG`));
        expect(geoSubfolderOf([...found, plain('images/readme.txt')], null))
            .toEqual({ folder: 'images', path: 'images', text: 'Photos are in images/' });
    });

    it('says "Map files" when what the subfolder holds is not only photos', () => {
        expect(geoSubfolderOf([photo('data/a.jpg'), raster('data/dsm.tif')], null).text).toBe('Map files are in data/');
    });

    it('takes the first subfolder by name, with the path from the dataset root, below a folder', () => {
        const found = [photo('site/zeta/z.jpg'), photo('site/alpha/deep/a.jpg'), photo('site/beta/b.jpg')];
        expect(geoSubfolderOf(found, 'site')).toEqual({ folder: 'alpha', path: 'site/alpha', text: 'Photos are in alpha/' });
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

    it('searches the dataset once for the entries under a folder with only a subfolder, and names it', async () => {
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images/' }));
        expect(dataset.search).toHaveBeenCalledTimes(1);
        // The geotagged photos only (the server's EntryType GeoImage), not every entry of the dataset
        expect(dataset.search).toHaveBeenCalledWith('*', expect.objectContaining({ path: undefined, recursive: true, type: 3 }));
    });

    it('searches under the folder on show, not the whole dataset', async () => {
        currentPath.value = 'site';
        dataset.search.mockResolvedValue([photo('site/images/a.jpg')]);
        start();
        await vi.waitFor(() => expect(hint.value?.path).toBe('site/images'));
        expect(dataset.search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'site' }));
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

        files.value = [item(folder('x'))];
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
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images/' });
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

    it('asks for the photos first, then the other map types one at a time, and stops at the first a subfolder holds', async () => {
        const types = [];
        dataset.search.mockImplementation(async (q, { type }) => {
            types.push(type);
            return type === T.GEORASTER ? [raster('data/dsm.tif')] : [];
        });
        start();
        await vi.waitFor(() => expect(hint.value).toEqual({ folder: 'data', path: 'data', text: 'Map files are in data/' }));
        // GeoImage (3), then GeoRaster (4): no point cloud, vector or other type is asked for
        expect(types).toEqual([3, 4]);
    });

    it('asks for each map type once when no subfolder holds any, and has no hint', async () => {
        const types = [];
        dataset.search.mockImplementation(async (q, { type }) => { types.push(type); return [plain('images/readme.txt')]; });
        start();
        await vi.waitFor(() => expect(types).toHaveLength(9));
        await new Promise(r => setTimeout(r, 0));
        // GeoImage, GeoRaster, PointCloud, Vector, GeoPanorama, GeoVideo, Model, GaussianSplat, Tiles3D
        expect(types).toEqual([3, 4, 5, 14, 13, 10, 11, 15, 16]);
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
        expect(hint.value).toEqual({ folder: 'images', path: 'images', text: 'Photos are in images/' });
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

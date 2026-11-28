/**
 * Where "Open in viewer" of a report item goes: the cover view when it owns the item's file, else the map on the owner of
 * the file (a sidecar's one entry, a folder's measurements file: two of its files), the point cloud viewer for a 3D item.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { b64encode, b64urlEncode } from '@/libs/base64';
import { defaultState, newLayer } from '@/libs/views/viewState';
import { findOwnerRoute, itemViewerUrls, ownerRouteOf, viewFiles, viewMeasurementFile, viewRoute } from './reportViewerLinks';

const dataset = { org: 'acme', ds: 'site' };
const raster = path => ({ path, type: ddb.entry.type.GEORASTER, hash: 'h' });
const stateOf = (...paths) => {
    const state = defaultState({ path: paths[0], hash: 'h' }, { baseIsGeoraster: true });
    state.layers = paths.map(p => newLayer(p, { hash: 'h' }));
    return state;
};
const mapUrl = (path, query = '') => `/r/acme/site/view/${encodeURIComponent(b64encode(path))}/map${query}`;

describe('viewFiles and viewMeasurementFile', () => {
    it('are the files as the map draws them, the layers from the bottom up', () => {
        expect(viewFiles(stateOf('a/top.tif', 'a/bottom.tif')).map(f => f.placeholder.path)).toEqual(['a/bottom.tif', 'a/top.tif']);
    });

    it('put a base file that is not a layer first', () => {
        const state = stateOf('a/top.tif');
        state.base = { path: 'a/cloud.laz', hash: '' };
        expect(viewFiles(state).map(f => f.placeholder.path)).toEqual(['a/cloud.laz', 'a/top.tif']);
    });

    it('give the sidecar of a one-layer view and the file of the folder of the first drawn layer for several', () => {
        expect(viewMeasurementFile(stateOf('flights/ortho.tif'))).toBe('flights/ortho_measurements.geojson');
        expect(viewMeasurementFile(stateOf('flights/top.tif', 'other/bottom.tif'))).toBe('other/measurements.geojson');
        expect(viewMeasurementFile(null)).toBeNull();
    });
});

describe('viewRoute', () => {
    it('is the first layer with the others added in order', () => {
        expect(viewRoute(stateOf('a/top.tif', 'b/dsm.tif', 'c/dtm.tif'))).toEqual({ path: 'a/top.tif', add: ['b/dsm.tif', 'c/dtm.tif'] });
    });

    it('is the base file with every layer added when the base is not a layer', () => {
        const state = stateOf('a/top.tif');
        state.base = { path: 'a/cloud.laz', hash: '' };
        expect(viewRoute(state)).toEqual({ path: 'a/cloud.laz', add: ['a/top.tif'] });
    });

    it('opens the same measurement file as the view it came from', () => {
        for (const paths of [['f/one.tif'], ['f/top.tif', 'g/bottom.tif'], ['a/x.tif', 'b/y.tif', 'c/z.tif']]) {
            const state = stateOf(...paths);
            const { path, add } = viewRoute(state);
            expect(viewMeasurementFile(stateOf(path, ...add))).toBe(viewMeasurementFile(state));
        }
    });
});

describe('ownerRouteOf', () => {
    const entries = [raster('f/ortho.tif'), raster('f/dsm.tif'), { path: 'f/notes.md', type: ddb.entry.type.MARKDOWN }, { path: 'f/ortho_measurements.geojson', type: ddb.entry.type.GENERIC }];

    it('is the one entry whose sidecar the file is', () => {
        expect(ownerRouteOf('f/ortho_measurements.geojson', entries)).toEqual({ path: 'f/ortho.tif', add: [] });
        expect(ownerRouteOf('f/dsm_measurements.geojson', entries)).toEqual({ path: 'f/dsm.tif', add: [] });
    });

    it('is none for a sidecar whose entry is not there, or not for the map', () => {
        expect(ownerRouteOf('f/gone_measurements.geojson', entries)).toBeNull();
        expect(ownerRouteOf('f/notes_measurements.geojson', entries)).toBeNull();
    });

    it('is two files of the folder for its measurements.geojson, the georasters first', () => {
        const mixed = [{ path: 'f/cloud.laz', type: ddb.entry.type.POINTCLOUD }, raster('f/ortho.tif'), raster('f/dsm.tif')];
        expect(ownerRouteOf('f/measurements.geojson', mixed)).toEqual({ path: 'f/ortho.tif', add: ['f/dsm.tif'] });
        expect(ownerRouteOf('measurements.geojson', [raster('ortho.tif'), raster('dsm.tif')])).toEqual({ path: 'ortho.tif', add: ['dsm.tif'] });
    });

    it('is none for a measurements.geojson of a folder that has fewer than two files for the map: no map keeps its measurements there', () => {
        expect(ownerRouteOf('f/measurements.geojson', [raster('f/ortho.tif')])).toBeNull();
        expect(ownerRouteOf('f/measurements.geojson', [])).toBeNull();
    });

    it('is none for a file that is neither', () => {
        expect(ownerRouteOf('f/other.geojson', entries)).toBeNull();
    });
});

describe('findOwnerRoute', () => {
    it('lists the folder of the file', async () => {
        const list = vi.fn(async () => [raster('f/ortho.tif')]);
        expect(await findOwnerRoute({ list }, 'f/ortho_measurements.geojson')).toEqual({ path: 'f/ortho.tif', add: [] });
        expect(list).toHaveBeenCalledWith('f');
        await findOwnerRoute({ list }, 'ortho_measurements.geojson');
        expect(list).toHaveBeenLastCalledWith('');
    });

    it('is none when the folder cannot be listed', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await findOwnerRoute({ list: async () => { throw new Error('offline'); } }, 'f/a_measurements.geojson')).toBeNull();
    });
});

describe('itemViewerUrls', () => {
    const item = (extra = {}) => ({ id: 'i1', owner: 'map', file: 'f/ortho_measurements.geojson', pointCloudFile: null, ...extra });
    const urls = (extra = {}) => itemViewerUrls({
        dataset, cover: { viewId: 'v_cover123' }, coverState: stateOf('f/ortho.tif'), ownerRoutes: new Map(), ...extra
    });

    it('opens the saved cover view with the item for an item of the file the cover view saves its measurements in', () => {
        expect(urls()(item())).toBe('/r/acme/site/views/v_cover123?item=i1');
    });

    it('opens a file route on the first layer, the others added, for a cover that holds its view state', () => {
        const coverState = stateOf('f/top.tif', 'f/bottom.tif');
        const url = urls({ cover: { viewState: coverState }, coverState })(item({ file: 'f/measurements.geojson' }));
        expect(url).toBe(mapUrl('f/top.tif', `?add=${b64urlEncode('f/bottom.tif')}&item=i1`));
    });

    it('opens the map on the owner of the file for an item of another source', () => {
        const ownerRoutes = new Map([['g/dsm_measurements.geojson', { path: 'g/dsm.tif', add: [] }], ['h/measurements.geojson', { path: 'h/a.tif', add: ['h/b.tif'] }]]);
        expect(urls({ ownerRoutes })(item({ file: 'g/dsm_measurements.geojson' }))).toBe(mapUrl('g/dsm.tif', '?item=i1'));
        expect(urls({ ownerRoutes })(item({ file: 'h/measurements.geojson' }))).toBe(mapUrl('h/a.tif', `?add=${b64urlEncode('h/b.tif')}&item=i1`));
    });

    it('has none for a file whose owner is not found', () => {
        expect(urls({ ownerRoutes: new Map([['g/x_measurements.geojson', null]]) })(item({ file: 'g/x_measurements.geojson' }))).toBeNull();
    });

    it('opens the owner of the file, not the cover, when the cover view was deleted', () => {
        const ownerRoutes = new Map([['f/ortho_measurements.geojson', { path: 'f/ortho.tif', add: [] }]]);
        expect(urls({ coverState: null, ownerRoutes })(item())).toBe(mapUrl('f/ortho.tif', '?item=i1'));
    });

    it('opens the point cloud viewer on the cloud the file names for a 3D item', () => {
        expect(urls()(item({ owner: 'pointCloud', pointCloudFile: 'f/cloud.laz' }))).toBe(`/r/acme/site/view/${encodeURIComponent(b64encode('f/cloud.laz'))}/pointcloud?item=i1`);
        expect(urls()(item({ owner: 'pointCloud', pointCloudFile: null }))).toBeNull();
    });
});

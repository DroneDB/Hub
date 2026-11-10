/**
 * The 2D map and the 3D viewer keep their measurements in the same file. Each view loads, saves
 * and deletes its own: the other view's features and metadata stay, and nothing left means no file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import { MeasurementStorage, MeasurementOwner, ownerOf, saveResultMessage } from './measurementStorage';
import { exportMeasurements as exportMap, importMeasurements as importMap } from './olMeasurementConverter';
import { exportMeasurements as exportCloud } from './potreeMeasurementConverter';
import { sectionOf } from './measurementFormat';
import {
    mapFile11, pointCloudFile10, mixedFile, cloudCoordinateSystem, CLOUD, GROUPS, UTM_18N_WKT
} from './measurementFormat.fixtures';
import { downloadText } from '@/libs/download';
import Registry from '@/libs/ddb/registry';
import { ApiError } from '@/libs/ddb/apiError';
import { buildStockpileFeature } from './stockpileStorage';

vi.mock('@/libs/download', () => ({ downloadText: vi.fn() }));

const { MAP, POINT_CLOUD } = MeasurementOwner;
const feature = (measurementType, id, extra = {}) => ({ type: 'Feature', geometry: null, properties: { id, measurementType, ...extra } });
// What the 3D viewer writes: its local coordinates with every feature
const cloud = (measurementType, id) => feature(measurementType, id, { localCoordinates: [[1, 2, 3]] });
const collection = (features, metadata = {}) => ({ type: 'FeatureCollection', metadata, features });
const ids = geojson => geojson.features.map(f => f.properties.id);
// What a converter gives: the features and the view's section
const withSection = (features, view, section) => ({ ...collection(features), metadata: { views: { [view]: section } } });

function storageWith(fileFeatures, owner = MAP, metadata = {}) {
    const dataset = {
        getFileContents: vi.fn(async () => {
            if (!fileFeatures) throw Object.assign(new Error('Not found'), { status: 404 });
            return JSON.stringify(collection(fileFeatures, metadata));
        }),
        writeObj: vi.fn(async () => {}),
        deleteObj: vi.fn(async () => {})
    };
    const storage = new MeasurementStorage(dataset, { path: 'cloud.laz' }, owner);
    const written = async () => JSON.parse(await dataset.writeObj.mock.calls[0][1].text());
    return { dataset, storage, written };
}

describe('ownerOf', () => {
    it('gives the 3D viewer what it wrote (its points and areas too) and the map the rest', () => {
        expect(ownerOf(cloud('point', 'p'))).toBe(POINT_CLOUD);
        expect(ownerOf(cloud('area', 'a'))).toBe(POINT_CLOUD);
        expect(ownerOf(feature('distance', 'd'))).toBe(POINT_CLOUD);
        expect(ownerOf(feature('annotation', 'n'))).toBe(POINT_CLOUD);
        expect(ownerOf(feature('point', 'p'))).toBe(MAP);
        expect(ownerOf(feature('stockpile', 's'))).toBe(MAP);
        expect(ownerOf({ type: 'Feature', properties: {} })).toBe(MAP);
    });
});

describe('MeasurementStorage.load', () => {
    const file = [feature('length', 'l1'), feature('point', 'p1'), cloud('point', 'p3'), cloud('distance', 'd3')];

    it('gives each view its own measurements', async () => {
        expect(ids(await storageWith(file, MAP).storage.load())).toEqual(['l1', 'p1']);
        expect(ids(await storageWith(file, POINT_CLOUD).storage.load())).toEqual(['p3', 'd3']);
    });

    it('is null when the file has none of the view', async () => {
        expect(await storageWith([cloud('distance', 'd3')], MAP).storage.load()).toBeNull();
        expect(await storageWith(null, MAP).storage.load()).toBeNull();
    });
});

describe('MeasurementStorage.load of a file that is not listed (FR-XC-10)', () => {
    it('does not ask for the file when the listing of its folder does not hold it', async () => {
        const { dataset, storage } = storageWith([cloud('distance', 'd3')], POINT_CLOUD);
        dataset.list = vi.fn().mockResolvedValue([{ path: 'cloud.laz' }]);
        expect(await storage.load()).toBeNull();
        expect(dataset.list).toHaveBeenCalledWith(null);
        expect(dataset.getFileContents).not.toHaveBeenCalled();
    });

    it('reads the file that the listing holds, and the file of a listing that failed', async () => {
        const listed = storageWith([cloud('distance', 'd3')], POINT_CLOUD);
        listed.dataset.list = vi.fn().mockResolvedValue([{ path: 'cloud_measurements.geojson' }]);
        expect(ids(await listed.storage.load())).toEqual(['d3']);

        const failed = storageWith([cloud('distance', 'd3')], POINT_CLOUD);
        failed.dataset.list = vi.fn().mockRejectedValue(new Error('offline'));
        expect(ids(await failed.storage.load())).toEqual(['d3']);
    });

    it('reads the file as the server holds it when it saves, whatever a listing says', async () => {
        const { dataset, storage } = storageWith([cloud('distance', 'd3')], POINT_CLOUD);
        dataset.list = vi.fn().mockResolvedValue([]);
        await storage.save({ type: 'FeatureCollection', features: [] }).catch(() => {});
        expect(dataset.list).not.toHaveBeenCalled();
        expect(dataset.getFileContents).toHaveBeenCalledTimes(1);
    });
});

describe('MeasurementStorage.save', () => {
    it('writes the stockpiles, contours and profiles of the 2D map once (they are on the map and in the file)', async () => {
        const mine = () => [feature('length', 'l1'), feature('stockpile', 's1'), feature('contour', 'c1'), feature('profile', 'r1')];
        const { dataset, storage, written } = storageWith(mine());
        const result = await storage.save(collection(mine()));
        expect(ids(await written())).toEqual(['l1', 's1', 'c1', 'r1']);
        expect(result).toMatchObject({ count: 4, deleted: false });
        // The file of the measurements is replaced, not refused as a name that exists (FR-UPL-03)
        expect(dataset.writeObj.mock.calls[0][2]).toEqual({ overwrite: true });
    });

    it('removes a stockpile deleted on the map', async () => {
        const { storage, written } = storageWith([feature('area', 'a1'), feature('stockpile', 's1')]);
        await storage.save(collection([feature('area', 'a1')]));
        expect(ids(await written())).toEqual(['a1']);
    });

    it('the map replaces its points and keeps those of the 3D viewer', async () => {
        const { storage, written } = storageWith([feature('point', 'p1'), cloud('point', 'p3'), cloud('area', 'a3')]);
        await storage.save(collection([feature('point', 'p2')]));
        expect(ids(await written())).toEqual(['p2', 'p3', 'a3']);
    });

    it('the 3D viewer replaces its measurements and keeps the map\'s, with the map\'s groups', async () => {
        const groups = [{ id: 'g1', name: 'Fence' }];
        const { storage, written } = storageWith([feature('length', 'l1'), cloud('distance', 'd3')], POINT_CLOUD, { groups });
        await storage.save(withSection([cloud('height', 'h3')], POINT_CLOUD, { pointCloudFile: 'cloud.laz' }));
        const file = await written();
        expect(ids(file)).toEqual(['h3', 'l1']);
        expect(file.metadata).toMatchObject({ version: '2.0', application: 'DroneDB Registry' });
        expect(file.metadata.views).toEqual({ map: { groups }, pointCloud: { pointCloudFile: 'cloud.laz' } });
        expect(file.metadata.groups).toBeUndefined();
    });

    it('the map\'s save replaces its groups (none left: none in the file) and keeps the 3D viewer\'s section', async () => {
        const { storage, written } = storageWith([feature('length', 'l1'), cloud('distance', 'd3')], MAP, { groups: [{ id: 'g1' }], pointCloudFile: 'cloud.laz' });
        await storage.save(collection([feature('length', 'l1')]));
        const file = await written();
        expect(file.metadata.views.map).toBeUndefined();
        // The 3D distance of the old file has no CRS to be corrected with yet: the 3D viewer's read does it
        expect(file.metadata.views.pointCloud).toEqual({ pointCloudFile: 'cloud.laz', legacyGeometry: true });
    });

    it('deletes the file when nothing is left', async () => {
        const { dataset, storage } = storageWith([feature('point', 'p1')]);
        const result = await storage.save(collection([]));
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(dataset.deleteObj).toHaveBeenCalledWith('cloud_measurements.geojson');
        expect(result).toEqual({ path: 'cloud_measurements.geojson', fileName: 'cloud_measurements.geojson', count: 0, deleted: true, owner: MAP });
    });

    it('an empty save without a file neither writes nor fails when the delete finds nothing', async () => {
        const { dataset, storage } = storageWith(null);
        dataset.deleteObj.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
        const result = await storage.save(collection([]));
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(result.deleted).toBe(true);
    });
});

describe('MeasurementStorage.deleteSaved', () => {
    it('removes the view\'s measurements and keeps the other view\'s file', async () => {
        const { dataset, storage, written } = storageWith([feature('length', 'l1'), cloud('distance', 'd3')], POINT_CLOUD);
        const result = await storage.deleteSaved();
        expect(dataset.deleteObj).not.toHaveBeenCalled();
        expect(ids(await written())).toEqual(['l1']);
        expect(result).toMatchObject({ count: 0, deleted: false });
    });

    it('removes the file when only the view\'s measurements were in it', async () => {
        const { dataset, storage } = storageWith([feature('length', 'l1')], MAP);
        expect((await storage.deleteSaved()).deleted).toBe(true);
        expect(dataset.deleteObj).toHaveBeenCalledWith('cloud_measurements.geojson');
    });
});

describe('saveResultMessage', () => {
    const result = (count, deleted, owner = MAP) => ({ fileName: 'm.geojson', count, deleted, owner });
    it('says what the file holds now', () => {
        expect(saveResultMessage(result(1, false))).toBe('Saved 1 measurement to "m.geojson"');
        expect(saveResultMessage(result(3, false))).toBe('Saved 3 measurements to "m.geojson"');
        expect(saveResultMessage(result(0, true))).toBe('Removed "m.geojson": no measurements left');
        expect(saveResultMessage(result(0, false))).toBe('Removed the 2D map measurements from "m.geojson" (the 3D viewer ones stay)');
        expect(saveResultMessage(result(0, false, POINT_CLOUD))).toBe('Removed the 3D viewer measurements from "m.geojson" (the 2D map ones stay)');
    });
});


// ---------------------------------------------------------------------------------------------
// A file in a dataset, with the files of the writers before 2.0
// ---------------------------------------------------------------------------------------------

function memoryDataset(initial) {
    const state = { content: initial === undefined ? null : initial, writes: 0, deletes: 0 };
    const dataset = {
        getFileContents: vi.fn(async () => {
            if (state.content === null) throw Object.assign(new Error('Not found'), { status: 404 });
            if (state.content instanceof Error) throw state.content;
            return state.content;
        }),
        writeObj: vi.fn(async (_path, blob) => { state.writes++; state.content = await blob.text(); }),
        deleteObj: vi.fn(async () => { state.deletes++; state.content = null; })
    };
    return { dataset, state, file: () => JSON.parse(state.content) };
}

const entry = { path: 'cloud.laz' };
const storageFor = (dataset, owner, options) => new MeasurementStorage(dataset, entry, owner, options);
const normalized = doc => ({
    ...doc,
    metadata: { ...doc.metadata, modifiedAt: undefined },
    features: [...doc.features].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
});
const closeTo = (actual, expected) => {
    expect(Math.abs(actual[0] - expected[0])).toBeLessThan(1e-7);
    expect(Math.abs(actual[1] - expected[1])).toBeLessThan(1e-7);
    expect(actual[2]).toBeCloseTo(expected[2], 6);
};
const cloudFeaturesOf = file => file.features.filter(f => ownerOf(f) === POINT_CLOUD);

// The 3D viewer with the measures of the fixture: the points the old file's features were measured at
class Vec {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
function cloudViewer() {
    const measure = (uuid, locals, flags = {}) => ({
        uuid, name: uuid, color: { getHexString: () => 'ff0000' }, showDistances: true, showEdges: true, closed: false,
        points: locals.map(l => ({ position: new Vec(...l) })), ...flags
    });
    return {
        scene: {
            measurements: [
                measure('m-dist', [CLOUD.A.local, CLOUD.B.local]),
                measure('m-area', [CLOUD.A.local, CLOUD.C.local, CLOUD.D.local], { showArea: true, closed: true })
            ],
            annotations: { traverse: fn => fn({ uuid: 'a-1', title: 'Crack', position: new Vec(...CLOUD.D.local) }) }
        }
    };
}

// The map: what it shows after a load, and what it saves
function mapSave(storage, loaded) {
    const source = new VectorSource();
    const { groups } = importMap(loaded, source, 'metric', null);
    return storage.save(exportMap(source, 'cloud.laz', 'metric', groups));
}

describe('a file written before 2.0', () => {
    beforeEach(() => vi.mocked(downloadText).mockClear());

    it('is migrated when read and left as it is on disk', async () => {
        const { dataset, state } = memoryDataset(JSON.stringify(mixedFile()));
        const before = state.content;
        const mapView = await storageFor(dataset, MAP).load();
        const cloudView = await storageFor(dataset, POINT_CLOUD, { pointCloudCrs: cloudCoordinateSystem() }).load();
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(state.content).toBe(before);
        expect(mapView.metadata.version).toBe('2.0');
        expect(sectionOf(mapView, MAP).groups).toEqual(GROUPS);
        closeTo(cloudView.features.find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
    });

    it('gives each view its own section and features', async () => {
        const { dataset } = memoryDataset(JSON.stringify(mixedFile()));
        const mapView = await storageFor(dataset, MAP).load();
        const cloudView = await storageFor(dataset, POINT_CLOUD).load();
        expect(Object.keys(mapView.metadata.views)).toEqual([MAP]);
        expect(Object.keys(cloudView.metadata.views)).toEqual([POINT_CLOUD]);
        expect(cloudView.metadata.views.pointCloud.pointCloudFile).toBe('cloud.laz');
        expect(mapView.features.every(f => ownerOf(f) === MAP)).toBe(true);
        expect(cloudView.features.every(f => ownerOf(f) === POINT_CLOUD)).toBe(true);
    });

    it('the map saves its groups and shows them again after a reload', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(mapFile11()));
        const storage = storageFor(dataset, MAP);
        await mapSave(storage, await storage.load());
        expect(file().metadata.views.map.groups).toEqual(GROUPS);
        expect(file().metadata.groups).toBeUndefined();

        const source = new VectorSource();
        const { features, groups } = importMap(await storageFor(dataset, MAP).load(), source, 'metric', null);
        expect(groups).toEqual(GROUPS);
        expect(features).toHaveLength(3);
        expect(features.find(f => f.get('name') === 'Fence line').get('groupId')).toBe('g1');
    });

    it('a map save keeps the 3D viewer\'s features (corrected once) and section; a 3D save keeps the map\'s', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(mixedFile()));
        const map = storageFor(dataset, MAP);
        const before = await map.load();
        await mapSave(map, before);
        expect(cloudFeaturesOf(file())).toHaveLength(4);
        closeTo(cloudFeaturesOf(file()).find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(file().metadata.views.pointCloud.pointCloudFile).toBe('cloud.laz');
        expect(file().metadata.views.pointCloud.coordinateSystem).toEqual(cloudCoordinateSystem());

        const mapFeaturesBefore = file().features.filter(f => ownerOf(f) === MAP);
        await storageFor(dataset, POINT_CLOUD, { pointCloudCrs: cloudCoordinateSystem() }).save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem()));
        expect(file().features.filter(f => ownerOf(f) === MAP)).toEqual(mapFeaturesBefore);
        expect(file().metadata.views.map.groups).toEqual(GROUPS);
    });

    it('AC-033: map save, 3D save, then a third save changes nothing', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(mixedFile()));
        const map = storageFor(dataset, MAP);
        await mapSave(map, await map.load());
        const cloud = storageFor(dataset, POINT_CLOUD, { pointCloudCrs: cloudCoordinateSystem() });
        await cloud.save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem()));
        const second = file();
        expect(second.metadata.version).toBe('2.0');
        expect(second.features.filter(f => ownerOf(f) === MAP)).toHaveLength(3);
        expect(cloudFeaturesOf(second).map(f => f.id).sort()).toEqual(['a-1', 'm-area', 'm-dist']);
        const dist = cloudFeaturesOf(second).find(f => f.id === 'm-dist').geometry.coordinates;
        closeTo(dist[0], CLOUD.A.geo);
        closeTo(dist[1], CLOUD.B.geo);
        expect(sectionOf(second, MAP).groups).toEqual(GROUPS);

        await mapSave(map, await map.load());
        expect(normalized(file())).toEqual(normalized(second));
        // and a fourth, from the 3D viewer
        await cloud.save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem()));
        expect(normalized(file())).toEqual(normalized(second));
    });

    it('an older Hub saving over a 2.0 file: the next read takes its groups and works out the 3D geometry again', async () => {
        const { dataset, file, state } = memoryDataset(JSON.stringify(mixedFile()));
        const map = storageFor(dataset, MAP);
        await mapSave(map, await map.load());
        // The older Hub's map save: the metadata it does not know stays, it sets 1.1 and writes the groups at the top
        const current = file();
        const groups = [{ id: 'g2', name: 'Roads' }];
        const stale = current.features.map(f => (f.id === 'a-1' ? { ...f, geometry: { type: 'Point', coordinates: [500583, 4504507, 1] } } : f));
        state.content = JSON.stringify({ ...current, metadata: { ...current.metadata, version: '1.1', groups }, features: stale });

        expect(sectionOf(await storageFor(dataset, MAP).load(), MAP).groups).toEqual(groups);
        const cloudView = await storageFor(dataset, POINT_CLOUD).load();
        closeTo(cloudView.features.find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
        // The next save of the map writes 2.0 again, with the groups
        await mapSave(storageFor(dataset, MAP), await storageFor(dataset, MAP).load());
        expect(file().metadata.version).toBe('2.0');
        expect(file().metadata.groups).toBeUndefined();
        expect(file().metadata.views.map.groups).toEqual(groups);
    });

    it('a 3D save over a file with no point cloud features yet writes the cloud\'s section and corrected geometry', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(mapFile11()));
        await storageFor(dataset, POINT_CLOUD).save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem(UTM_18N_WKT)));
        expect(file().features).toHaveLength(6);
        expect(file().metadata.views.map.groups).toEqual(GROUPS);
        expect(file().crs.properties.name).toBe('EPSG:4326');
    });

    it('a point cloud file with no SRS has no crs member after a save', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(pointCloudFile10({ srs: null })));
        await storageFor(dataset, POINT_CLOUD).save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem(null)));
        expect('crs' in file()).toBe(false);
        expect(JSON.stringify(file())).not.toContain('EPSG:4326');
    });
});

describe('a file that cannot be read is not replaced', () => {
    const cases = {
        'text that is not JSON': '{"type": "FeatureCollection", "features": [',
        'JSON that is not a collection': JSON.stringify({ hello: 'world' }),
        'a file of another application': JSON.stringify({ ...mapFile11(), metadata: { ...mapFile11().metadata, application: 'QGIS' } }),
        'a file of a newer format': JSON.stringify({ ...mapFile11(), metadata: { ...mapFile11().metadata, version: '9.0' } }),
        'a read that failed': Object.assign(new Error('Network down'), { status: 500 })
    };
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
    for (const [label, content] of Object.entries(cases)) {
        it(`${label}: save and delete throw, nothing is written or removed`, async () => {
            const { dataset, state } = memoryDataset(content);
            const storage = storageFor(dataset, MAP);
            await expect(storage.save(collection([feature('length', 'l9')]))).rejects.toThrow(/Failed to save measurements/);
            await expect(storage.deleteSaved()).rejects.toThrow(/Failed to save measurements/);
            await expect(storage.load()).rejects.toThrow();
            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(dataset.deleteObj).not.toHaveBeenCalled();
            expect(state.content).toBe(content);
        });
    }

    it('a missing or empty file is a new file', async () => {
        const missing = memoryDataset(undefined);
        await storageFor(missing.dataset, MAP).save(collection([feature('length', 'l1')]));
        expect(ids(missing.file())).toEqual(['l1']);
        expect(missing.file().metadata.createdAt).toBe(missing.file().metadata.modifiedAt);
        const empty = memoryDataset('  ');
        await storageFor(empty.dataset, MAP).save(collection([feature('length', 'l1')]));
        expect(ids(empty.file())).toEqual(['l1']);
    });
});

describe('a 3D file the 2D map saves first, with no CRS for the cloud in it (the map does not know it)', () => {
    // The 3D viewer's old file that does not say the cloud's CRS: its geometry is the old, wrong one
    const oldFileWithoutCrs = () => {
        const file = mixedFile();
        delete file.metadata.coordinateSystem;
        return file;
    };

    it('the map keeps the 3D features as they were; the 3D viewer\'s read corrects them; a third save changes nothing', async () => {
        const old = oldFileWithoutCrs();
        const { dataset, file, state } = memoryDataset(JSON.stringify(old));
        const map = storageFor(dataset, MAP);
        await mapSave(map, await map.load());

        const first = file();
        expect(first.metadata.version).toBe('2.0');
        expect(cloudFeaturesOf(first)).toEqual(cloudFeaturesOf(old));
        expect(first.metadata.views.pointCloud).toEqual({ pointCloudFile: 'cloud.laz', legacyGeometry: true });
        expect('crs' in first).toBe(false);
        // Another map save leaves the 3D features to the 3D viewer
        await mapSave(map, await map.load());
        expect(normalized(file())).toEqual(normalized(first));

        // The 3D viewer reads it with the SRS of its cloud: corrected, and nothing written
        const writes = state.writes;
        const cloud = storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT });
        const loaded = await cloud.load();
        expect(state.writes).toBe(writes);
        const dist = loaded.features.find(f => f.id === 'm-dist').geometry.coordinates;
        closeTo(dist[0], CLOUD.A.geo);
        closeTo(dist[1], CLOUD.B.geo);
        closeTo(loaded.features.find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(loaded.metadata.views.pointCloud).toEqual({ pointCloudFile: 'cloud.laz', coordinateSystem: { srs: UTM_18N_WKT } });

        // Its save writes the corrected geometry; a third save (the map's) changes nothing
        await cloud.save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem()));
        const second = file();
        expect(second.metadata.views.pointCloud.legacyGeometry).toBeUndefined();
        expect(second.crs.properties.name).toBe('EPSG:4326');
        closeTo(cloudFeaturesOf(second).find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(sectionOf(second, MAP).groups).toEqual(GROUPS);
        await mapSave(map, await map.load());
        expect(normalized(file())).toEqual(normalized(second));
    });

    it('a map save after the 3D viewer\'s read (no 3D save) keeps the mark: the 3D viewer still corrects it', async () => {
        const { dataset, file } = memoryDataset(JSON.stringify(oldFileWithoutCrs()));
        const map = storageFor(dataset, MAP);
        await mapSave(map, await map.load());
        await storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT }).load();
        await mapSave(map, await map.load());
        expect(file().metadata.views.pointCloud.legacyGeometry).toBe(true);
        const loaded = await storageFor(dataset, POINT_CLOUD, { pointCloudCrs: cloudCoordinateSystem() }).load();
        closeTo(loaded.features.find(f => f.id === 'a-1').geometry.coordinates, CLOUD.D.geo);
    });
});

// ---------------------------------------------------------------------------------------------
// The dataset of the Registry client, on a fetch that answers as the Registry does
// ---------------------------------------------------------------------------------------------

const problem = (status, title, detail) => new Response(
    JSON.stringify({ type: 'https://tools.ietf.org/html/rfc9110', title, status, detail }),
    { status, headers: { 'Content-Type': 'application/problem+json' } });

/**
 * A dataset of the real client (Registry -> Organization -> Dataset -> http client) whose file is
 * `content` (null: not there, the Registry's 404 for a path that has no entry; a Response: that answer).
 */
function registryDataset(content) {
    const state = { content, posts: [], deletes: 0 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
        const method = (init.method || 'GET').toUpperCase();
        const path = new URL(String(url)).pathname;
        // The single-file route: GET /orgs/{org}/ds/{ds}/download/{path}?inline=1
        if (method === 'GET' && path.includes('/download/')) {
            if (state.content instanceof Response) return state.content.clone();
            if (state.content === null) return problem(404, 'Not Found', "Cannot find 'cloud_measurements.geojson'");
            return new Response(state.content, { status: 200, headers: { 'Content-Type': 'application/geo+json' } });
        }
        if (method === 'POST' && path.endsWith('/obj')) {
            const text = await init.body.get('file').text();
            state.posts.push({ overwrite: init.body.get('overwrite'), text });
            state.content = text;
            return new Response(JSON.stringify({ path: init.body.get('path') }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE' && path.endsWith('/obj')) {
            state.deletes++;
            if (state.content === null) return problem(404, 'Not Found', "Cannot find 'cloud_measurements.geojson'");
            state.content = null;
            return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected ${method} ${path}`);
    });
    const dataset = new Registry(`http://u205-${Math.random().toString(36).slice(2)}.test`).Organization('org').Dataset('ds');
    return { dataset, state, file: () => JSON.parse(state.content) };
}

describe('with the Registry client: a missing file is the client\'s 404, and the first save makes the file', () => {
    afterEach(() => vi.restoreAllMocks());

    it('the client raises an ApiError with status 404 for a file that is not there', async () => {
        const { dataset } = registryDataset(null);
        const error = await dataset.getFileContents('cloud_measurements.geojson').catch(e => e);
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(404);
        expect(error.message).toBe('Not found');
    });

    it('the first save of the map writes a new 2.0 file; load before it is nothing', async () => {
        const { dataset, state, file } = registryDataset(null);
        const storage = storageFor(dataset, MAP);
        expect(await storage.load()).toBeNull();
        const result = await storage.save(collection([feature('length', 'l1')]));
        expect(result).toMatchObject({ count: 1, deleted: false });
        expect(state.posts).toHaveLength(1);
        expect(state.posts[0].overwrite).toBe('true');
        expect(file().metadata).toMatchObject({ version: '2.0', application: 'DroneDB Registry' });
        expect(ids(file())).toEqual(['l1']);
    });

    it('the first save of a stockpile writes it to a new file', async () => {
        const { dataset, file } = registryDataset(null);
        const pile = buildStockpileFeature({ type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] },
            { id: 's1', title: 'North pile', netVolume: 8097.19, materialDensity: 1.68 });
        await storageFor(dataset, MAP).save(collection([pile]));
        expect(ids(file())).toEqual(['s1']);
        expect(file().features[0].properties).toMatchObject({ measurementType: 'stockpile', netVolume: 8097.19 });
    });

    it('the first save of the 3D viewer writes a new file', async () => {
        const { dataset, file } = registryDataset(null);
        await storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT }).save(exportCloud(cloudViewer(), 'cloud.laz', cloudCoordinateSystem()));
        expect(cloudFeaturesOf(file()).map(f => f.id).sort()).toEqual(['a-1', 'm-area', 'm-dist']);
    });

    it('an empty file (a 200 with no body) is a new file', async () => {
        const { dataset, file } = registryDataset('');
        await storageFor(dataset, MAP).save(collection([feature('length', 'l1')]));
        expect(ids(file())).toEqual(['l1']);
    });

    it('an empty save with no file: the delete\'s 404 is not an error', async () => {
        const { dataset, state } = registryDataset(null);
        const result = await storageFor(dataset, MAP).save(collection([]));
        expect(result.deleted).toBe(true);
        expect(state.deletes).toBe(1);
        expect(state.posts).toHaveLength(0);
    });

    it.each([
        ['a server error', () => problem(500, 'Internal Server Error', 'boom')],
        ['no access', () => problem(403, 'Forbidden', 'No access')],
        ['a bad request that says "not found" in its text', () => problem(400, 'Bad Request', 'Path not found in the index')]
    ])('%s is not a missing file: save throws and writes nothing', async (_label, answer) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { dataset, state } = registryDataset(answer());
        await expect(storageFor(dataset, MAP).save(collection([feature('length', 'l1')]))).rejects.toThrow(/Failed to save measurements/);
        await expect(storageFor(dataset, MAP).load()).rejects.toThrow();
        expect(state.posts).toHaveLength(0);
        expect(state.deletes).toBe(0);
    });

    it('a network failure (the client\'s status 0) is not a missing file', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { dataset, state } = registryDataset(null);
        vi.mocked(globalThis.fetch).mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
        await expect(storageFor(dataset, MAP).save(collection([feature('length', 'l1')]))).rejects.toThrow(/Network error/);
        expect(state.posts).toHaveLength(0);
    });
});

describe('MeasurementStorage.exportToFile', () => {
    it('downloads the 2.0 document of the view: version, application, its section and its groups', () => {
        const source = new VectorSource();
        const { storage } = storageWith([feature('length', 'l1')]);
        importMap(mapFile11(), source, 'metric', null);
        storage.exportToFile(exportMap(source, 'cloud.laz', 'metric', GROUPS), 'm.geojson');
        const [text, name] = vi.mocked(downloadText).mock.calls.at(-1);
        const doc = JSON.parse(text);
        expect(name).toBe('m.geojson');
        expect(doc.metadata).toMatchObject({ version: '2.0', application: 'DroneDB Registry' });
        expect(doc.metadata.views.map.groups).toEqual(GROUPS);
        expect(doc.metadata.groups).toBeUndefined();
    });
});

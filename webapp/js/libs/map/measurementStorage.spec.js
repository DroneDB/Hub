/**
 * The 2D map and the 3D viewer keep their measurements in the same file. Each view loads, saves
 * and deletes its own: the other view's features and metadata stay, and nothing left means no file.
 */
import { describe, it, expect, vi } from 'vitest';
import { MeasurementStorage, MeasurementOwner, ownerOf, saveResultMessage } from './measurementStorage';

const { MAP, POINT_CLOUD } = MeasurementOwner;
const feature = (measurementType, id, extra = {}) => ({ type: 'Feature', geometry: null, properties: { id, measurementType, ...extra } });
// What the 3D viewer writes: its local coordinates with every feature
const cloud = (measurementType, id) => feature(measurementType, id, { localCoordinates: [[1, 2, 3]] });
const collection = (features, metadata = {}) => ({ type: 'FeatureCollection', metadata, features });
const ids = geojson => geojson.features.map(f => f.properties.id);

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

describe('MeasurementStorage.save', () => {
    it('writes the stockpiles, contours and profiles of the 2D map once (they are on the map and in the file)', async () => {
        const mine = () => [feature('length', 'l1'), feature('stockpile', 's1'), feature('contour', 'c1'), feature('profile', 'r1')];
        const { storage, written } = storageWith(mine());
        const result = await storage.save(collection(mine()));
        expect(ids(await written())).toEqual(['l1', 's1', 'c1', 'r1']);
        expect(result).toMatchObject({ count: 4, deleted: false });
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
        await storage.save(collection([cloud('height', 'h3')], { application: 'Registry-Potree' }));
        const file = await written();
        expect(ids(file)).toEqual(['h3', 'l1']);
        expect(file.metadata).toMatchObject({ groups, application: 'Registry-Potree' });
    });

    it('the map\'s save replaces its groups (none left: none in the file)', async () => {
        const { storage, written } = storageWith([feature('length', 'l1')], MAP, { groups: [{ id: 'g1' }], pointCloudFile: 'cloud.laz' });
        await storage.save(collection([feature('length', 'l1')]));
        const file = await written();
        expect(file.metadata.groups).toBeUndefined();
        expect(file.metadata.pointCloudFile).toBe('cloud.laz');
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

/**
 * MeasurementStorage.save makes the file match what the caller owns: the caller's features
 * replace those of its types, other viewers' features stay, and nothing left means no file.
 */
import { describe, it, expect, vi } from 'vitest';
import { MeasurementStorage } from './measurementStorage';

const feature = (measurementType, id) => ({ type: 'Feature', geometry: null, properties: { id, measurementType } });
const collection = features => ({ type: 'FeatureCollection', metadata: {}, features });

function storageWith(fileFeatures) {
    const dataset = {
        getFileContents: vi.fn(async () => {
            if (!fileFeatures) throw Object.assign(new Error('Not found'), { status: 404 });
            return JSON.stringify(collection(fileFeatures));
        }),
        writeObj: vi.fn(async () => {}),
        deleteObj: vi.fn(async () => {})
    };
    const storage = new MeasurementStorage(dataset, { path: 'ortho.tif' });
    const written = async () => JSON.parse(await dataset.writeObj.mock.calls[0][1].text());
    return { dataset, storage, written };
}

describe('MeasurementStorage.save', () => {
    it('writes the stockpiles, contours and profiles of the 2D map once (they are on the map and in the file)', async () => {
        const mine = () => [feature('length', 'l1'), feature('stockpile', 's1'), feature('contour', 'c1'), feature('profile', 'r1')];
        const { storage, written } = storageWith(mine());
        const result = await storage.save(collection(mine()));
        expect((await written()).features.map(f => f.properties.id)).toEqual(['l1', 's1', 'c1', 'r1']);
        expect(result.deleted).toBe(false);
    });

    it('removes a stockpile deleted on the map', async () => {
        const { storage, written } = storageWith([feature('area', 'a1'), feature('stockpile', 's1')]);
        await storage.save(collection([feature('area', 'a1')]));
        expect((await written()).features.map(f => f.properties.id)).toEqual(['a1']);
    });

    it('keeps the features of the 3D viewer', async () => {
        const { storage, written } = storageWith([feature('height', 'h1'), feature('point', 'p1')]);
        await storage.save(collection([]));
        expect((await written()).features.map(f => f.properties.id)).toEqual(['h1']);
    });

    it('deletes the file when nothing is left', async () => {
        const { dataset, storage } = storageWith([feature('point', 'p1')]);
        const result = await storage.save(collection([]));
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(dataset.deleteObj).toHaveBeenCalledWith('ortho_measurements.geojson');
        expect(result).toEqual({ path: 'ortho_measurements.geojson', fileName: 'ortho_measurements.geojson', deleted: true });
    });

    it('an empty save without a file neither writes nor fails when the delete finds nothing', async () => {
        const { dataset, storage } = storageWith(null);
        dataset.deleteObj.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
        const result = await storage.save(collection([]));
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(result.deleted).toBe(true);
    });
});

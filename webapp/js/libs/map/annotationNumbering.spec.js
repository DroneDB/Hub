/**
 * The ids and the refs of the annotations of a measurements file, through the storage that reads and writes it:
 * a new file is 3.0 with the first ref, an older file is numbered by the first save of either view (the same ids
 * and refs whichever view saves first), a ref is never issued twice, and two views that issue the same ref
 * settle it when the second one saves.
 */
import { describe, it, expect, vi } from 'vitest';
import Feature from 'ol/Feature';
import { Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Vector as VectorSource } from 'ol/source';
import { MeasurementStorage, MeasurementOwner, numberMeasurementFile, notifyRenumbered } from './measurementStorage';
import { exportMeasurements as exportMap, importMeasurements as importMap } from './olMeasurementConverter';
import { exportMeasurements as exportCloud } from './potreeMeasurementConverter';
import { read, FORMAT_VERSION } from './measurementFormat';
import { mixedFile, cloudCoordinateSystem, CLOUD, UTM_18N_WKT, CREATED, MODIFIED } from './measurementFormat.fixtures';
import { duplicateRefs } from './annotationIds';
import { notify } from '@/libs/notify';

const { MAP, POINT_CLOUD } = MeasurementOwner;
const COORDINATES = [{ x: 9.2, y: 45.2 }, { x: 9.201, y: 45.2 }, { x: 9.201, y: 45.201 }];

function memoryDataset(initial) {
    const state = { content: initial === undefined ? null : JSON.stringify(initial), writes: 0 };
    const dataset = {
        getFileContents: vi.fn(async () => {
            if (state.content === null) throw Object.assign(new Error('Not found'), { status: 404 });
            return state.content;
        }),
        writeObj: vi.fn(async (_path, blob) => { state.writes++; state.content = await blob.text(); }),
        deleteObj: vi.fn(async () => { state.content = null; })
    };
    return { dataset, state, file: () => JSON.parse(state.content) };
}
const storageFor = (dataset, owner, options) => new MeasurementStorage(dataset, { path: 'cloud.laz' }, owner, options);

// A 2D measurement as the map has it on its source: in the map's projection
function areaFeature(properties, at = 0) {
    const ring = [...COORDINATES, COORDINATES[0]].map(c => fromLonLat([c.x + at, c.y]));
    return new Feature({ geometry: new Polygon([ring]), measurementType: 'area', ...properties });
}
function mapSave(storage, features, groups = []) {
    const source = new VectorSource();
    source.addFeatures(features);
    return storage.save(exportMap(source, 'cloud.laz', 'metric', groups));
}
async function mapShows(storage) {
    const source = new VectorSource();
    importMap(await storage.load(), source, 'metric', null);
    return source.getFeatures();
}

// The 3D viewer's measure: its viewer properties, with the property bag the converter keeps
class Vec {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
const measureOf = (ddbProperties, locals = [CLOUD.A.local, CLOUD.B.local]) => ({
    ddbProperties, name: 'Distance', color: { getHexString: () => 'ff0000' }, showDistances: true, showEdges: true, closed: false,
    points: locals.map(l => ({ position: new Vec(...l) }))
});
const viewerOf = (...measures) => ({ scene: { measurements: measures, annotations: { traverse: () => {} } } });
const cloudSave = (storage, ...measures) => storage.save(exportCloud(viewerOf(...measures), 'cloud.laz', cloudCoordinateSystem()));
const bagOf = feature => ({ id: feature.properties.id, ...(feature.properties.ref ? { ref: feature.properties.ref } : {}), createdAt: feature.properties.createdAt });

// A 2.0 file: a 3D distance and two 2D areas, none with an id or a ref, created in that order
const OLD = [
    { time: '2026-01-01T10:00:00.000Z' }, { time: '2026-01-01T11:00:00.000Z' }, { time: '2026-01-01T12:00:00.000Z' }
];
function oldFile({ extra = {} } = {}) {
    const doc = mixedFile();
    const cloud = doc.features.filter(f => f.properties.localCoordinates);
    const distance = cloud.find(f => f.properties.measurementType === 'distance');
    return {
        type: 'FeatureCollection',
        crs: doc.crs,
        metadata: {
            version: '2.0', kind: 'measurements', application: 'DroneDB Registry', createdAt: CREATED, modifiedAt: MODIFIED,
            views: { pointCloud: { pointCloudFile: 'cloud.laz', coordinateSystem: cloudCoordinateSystem() } }
        },
        features: [
            // Geometry as the 3D viewer writes it today, so a 2.0 file needs no correction
            { type: 'Feature', geometry: { type: 'LineString', coordinates: [CLOUD.A.geo, CLOUD.B.geo] }, properties: { ...distance.properties, createdAt: OLD[0].time, ...extra } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[9.2, 45.2], [9.201, 45.2], [9.201, 45.201], [9.2, 45.2]]] }, properties: { measurementType: 'area', createdAt: OLD[2].time, name: 'Late' } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[9.3, 45.3], [9.301, 45.3], [9.301, 45.301], [9.3, 45.3]]] }, properties: { measurementType: 'area', createdAt: OLD[1].time, name: 'Early' } }
        ]
    };
}
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const byName = (file, name) => file.features.find(f => f.properties.name === name);

describe('a new file', () => {
    it('is 3.0, with lastRef and the first annotation having an id and ref "1"', async () => {
        const { dataset, file } = memoryDataset();
        const storage = storageFor(dataset, MAP);
        expect(await storage.load()).toBeNull();
        const feature = areaFeature({ createdAt: '2026-02-01T00:00:00.000Z', id: 'new-id', ref: storage.refs.issue() });
        const result = await mapSave(storage, [feature]);
        expect(file().metadata).toMatchObject({ version: FORMAT_VERSION, lastRef: 1 });
        expect(FORMAT_VERSION).toBe('3.0');
        expect(file().features[0].properties).toMatchObject({ id: 'new-id', ref: '1' });
        expect(file().features[0].id).toBe('new-id');
        expect(result.refs).toEqual({ 'new-id': '1' });
    });
});

describe('a 2.0 file read by the map', () => {
    it('gives the area an id, keeps the id of the stockpile, numbers both and keeps every other property', async () => {
        const stockpile = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] },
            properties: { id: 's1', measurementType: 'stockpile', title: 'North pile', netVolume: 8097.19, materialDensity: 1.8, createdAt: OLD[0].time } };
        const area = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[9.2, 45.2], [9.201, 45.2], [9.201, 45.201], [9.2, 45.2]]] },
            properties: { measurementType: 'area', name: 'Field', description: 'Wheat', stroke: '#112233', createdAt: OLD[1].time, tooltipText: '0.49 ha' } };
        const doc = { type: 'FeatureCollection', metadata: { version: '2.0', kind: 'measurements', application: 'DroneDB Registry', createdAt: CREATED, modifiedAt: MODIFIED, views: {} }, features: [stockpile, area] };
        const { dataset, file } = memoryDataset(doc);
        const storage = storageFor(dataset, MAP);
        await mapSave(storage, await mapShows(storage));

        const saved = file();
        expect(saved.metadata.version).toBe('3.0');
        const pile = saved.features.find(f => f.properties.measurementType === 'stockpile');
        const field = saved.features.find(f => f.properties.name === 'Field');
        expect(pile.properties.id).toBe('s1');
        expect(field.properties.id).toMatch(/^[0-9a-f]{64}$/);
        expect([pile.properties.ref, field.properties.ref].sort()).toEqual(['1', '2']);
        // In creation order: the pile first
        expect(pile.properties.ref).toBe('1');
        expect(field.properties).toMatchObject({ description: 'Wheat', stroke: '#112233', createdAt: OLD[1].time, name: 'Field', measurementType: 'area' });
        expect(pile.properties).toMatchObject({ title: 'North pile', netVolume: 8097.19, materialDensity: 1.8 });
        expect(saved.metadata.lastRef).toBe(2);
    });

    it('is not changed by being loaded: what the map shows is the saved state, with ids and without refs', async () => {
        const { dataset, state } = memoryDataset(oldFile());
        const before = state.content;
        const features = await mapShows(storageFor(dataset, MAP));
        expect(features).toHaveLength(2);
        features.forEach(f => {
            expect(f.get('id')).toMatch(/^[0-9a-f]{64}$/);
            expect(f.get('ref')).toBeUndefined();
        });
        expect(state.content).toBe(before);
        expect(dataset.writeObj).not.toHaveBeenCalled();
    });
});

describe('the refs of the annotations', () => {
    it('are never issued twice: 1, 2, 3, delete 2 and add: 4, delete 4 and add: 5; the others keep theirs', async () => {
        const { dataset, file } = memoryDataset();
        const storage = storageFor(dataset, MAP);
        await storage.load();
        const item = (n, ref) => areaFeature({ id: `i${n}`, ref, createdAt: `2026-02-0${n}T00:00:00.000Z` }, n / 100);
        const items = [item(1, storage.refs.issue()), item(2, storage.refs.issue(['1'])), item(3, storage.refs.issue(['1', '2']))];
        await mapSave(storage, items);
        expect(file().features.map(f => f.properties.ref).sort()).toEqual(['1', '2', '3']);

        const four = item(4, storage.refs.issue(['1', '3']));
        await mapSave(storage, [items[0], items[2], four]);
        expect(Object.fromEntries(file().features.map(f => [f.properties.id, f.properties.ref]))).toEqual({ i1: '1', i3: '3', i4: '4' });

        // Another session of the same view loaded the file: its next ref is after lastRef
        const five = item(5, storage.refs.issue(['1', '3']));
        await mapSave(storage, [items[0], items[2], five]);
        expect(Object.fromEntries(file().features.map(f => [f.properties.id, f.properties.ref]))).toEqual({ i1: '1', i3: '3', i5: '5' });
        expect(file().metadata.lastRef).toBe(5);
    });

    it('are never issued again after a reload either: lastRef keeps the highest', async () => {
        const { dataset } = memoryDataset();
        const first = storageFor(dataset, MAP);
        await first.load();
        await mapSave(first, [areaFeature({ id: 'a', ref: first.refs.issue() }), areaFeature({ id: 'b', ref: first.refs.issue(['1']) }, 0.01)]);
        await mapSave(first, [areaFeature({ id: 'a', ref: '1' })]);
        const second = storageFor(dataset, MAP);
        await second.load();
        expect(second.refs.issue(['1'])).toBe('3');
    });

    it('settles a ref that two views issued: the second save gives its new item the next one and says so', async () => {
        const start = oldFile();
        const { dataset, file } = memoryDataset(start);
        // Number the file: 1 the distance, 2 and 3 the areas
        await mapSave(storageFor(dataset, MAP), await mapShows(storageFor(dataset, MAP)));
        expect(file().metadata.lastRef).toBe(3);

        const map = storageFor(dataset, MAP);
        const cloud = storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT });
        const mapItems = await mapShows(map);
        const cloudLoaded = await cloud.load();
        const distance = cloudLoaded.features[0];
        expect(distance.properties.ref).toBe('1');

        // Each view issues "4" for a new item and has not saved it
        const cloudNew = measureOf({ id: 'cloud-new', ref: cloud.refs.issue(), createdAt: '2026-03-01T00:00:00.000Z' }, [CLOUD.C.local, CLOUD.D.local]);
        const mapNew = areaFeature({ id: 'map-new', ref: map.refs.issue(mapItems.map(f => f.get('ref'))), createdAt: '2026-03-02T00:00:00.000Z' }, 0.5);
        expect([cloudNew.ddbProperties.ref, mapNew.get('ref')]).toEqual(['4', '4']);

        const firstResult = await cloudSave(cloud, measureOf(bagOf(distance)), cloudNew);
        expect(firstResult.renumbered).toEqual([]);

        const result = await mapSave(map, [...mapItems, mapNew]);
        expect(result.renumbered).toEqual([{ id: 'map-new', from: '4', to: '5' }]);
        expect(result.refs['map-new']).toBe('5');
        const saved = file();
        expect(saved.features.find(f => f.properties.id === 'map-new').properties.ref).toBe('5');
        expect(saved.features.find(f => f.properties.id === 'cloud-new').properties.ref).toBe('4');
        expect(saved.metadata.lastRef).toBe(5);

        const warn = vi.spyOn(notify, 'warn').mockImplementation(() => {});
        notifyRenumbered(result);
        expect(warn).toHaveBeenCalledWith('Reference 4 was taken; the item is now 5', expect.anything());
        warn.mockRestore();
    });

    it('keep a ref a saved item has even when another feature of the file has it (a file edited outside the Hub)', async () => {
        const doc = oldFile();
        doc.features[0].properties.ref = '2';
        doc.features[1].properties.ref = '2';
        const { dataset, file } = memoryDataset(doc);
        const map = storageFor(dataset, MAP);
        await mapSave(map, await mapShows(map));
        // Both kept, the one that had none gets the next after the highest
        expect(file().features.map(f => f.properties.ref).sort()).toEqual(['2', '2', '3']);
        expect(duplicateRefs(file().features.map(f => f.properties.ref))).toEqual(['2']);
    });
});

describe('the first save of either view', () => {
    it('numbers both owners in creation order, whichever view saves, and changes nothing else (the map saves)', async () => {
        const start = oldFile({ extra: { customKey: 5 } });
        const { dataset, file } = memoryDataset(start);
        const map = storageFor(dataset, MAP);
        await mapSave(map, await mapShows(map));

        const saved = file();
        const distance = saved.features.find(f => f.properties.measurementType === 'distance');
        expect(distance.properties.ref).toBe('1');
        expect(byName(saved, 'Early').properties.ref).toBe('2');
        expect(byName(saved, 'Late').properties.ref).toBe('3');
        expect(distance.properties.id).toMatch(/^[0-9a-f]{64}$/);
        // Nothing else of the distance changed: geometry, properties and all
        expect({ ...distance, properties: omit(distance.properties, ['id', 'ref']) }).toEqual(start.features[0]);
        expect(distance.properties.customKey).toBe(5);
    });

    it('gives the two views the same id and ref for a feature: the 3D viewer loaded the file before the map saved', async () => {
        const { dataset, file } = memoryDataset(oldFile());
        const cloud = storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT });
        const loaded = await cloud.load();
        const idInCloud = loaded.features[0].properties.id;
        expect(loaded.features[0].properties.ref).toBeUndefined();

        const map = storageFor(dataset, MAP);
        await mapSave(map, await mapShows(map));
        const afterMap = file();
        const distance = afterMap.features.find(f => f.properties.measurementType === 'distance');
        expect(distance.properties.id).toBe(idInCloud);
        expect(distance.properties.ref).toBe('1');

        // The 3D viewer saves what it holds: an id and no ref, the ref is the file's, and nothing new is issued
        const result = await cloudSave(cloud, measureOf({ id: idInCloud, createdAt: distance.properties.createdAt }));
        expect(result.renumbered).toEqual([]);
        const afterCloud = file();
        const same = afterCloud.features.find(f => f.properties.measurementType === 'distance');
        expect(same.properties.id).toBe(idInCloud);
        expect(same.properties.ref).toBe('1');
        expect(afterCloud.metadata.lastRef).toBe(3);
        expect(afterCloud.features.filter(f => f.properties.measurementType === 'area').map(f => f.properties.ref).sort()).toEqual(['2', '3']);
        expect(result.refs[idInCloud]).toBe('1');
    });

    it('is the same when the 3D viewer saves first: both owners are numbered by it', async () => {
        const { dataset, file } = memoryDataset(oldFile());
        const cloud = storageFor(dataset, POINT_CLOUD, { pointCloudCrs: UTM_18N_WKT });
        const loaded = await cloud.load();
        await cloudSave(cloud, measureOf({ id: loaded.features[0].properties.id, createdAt: loaded.features[0].properties.createdAt }));
        const saved = file();
        expect(saved.metadata.version).toBe('3.0');
        expect(saved.features.find(f => f.properties.measurementType === 'distance').properties.ref).toBe('1');
        expect(byName(saved, 'Early').properties.ref).toBe('2');
        expect(byName(saved, 'Late').properties.ref).toBe('3');
    });

    it('gives the same ids to a file of 1.x read with and without the CRS of its cloud', () => {
        const old = mixedFile();
        const without = read(old);
        const withCrs = read(old, { pointCloudCrs: UTM_18N_WKT });
        expect(withCrs.features.map(f => f.properties.id)).toEqual(without.features.map(f => f.properties.id));
        expect(new Set(without.features.map(f => f.properties.id)).size).toBe(without.features.length);
        // A 2.0 file that still has the old 3D geometry (the map saved it with no CRS): the same
        const mapSaved = JSON.parse(JSON.stringify(read(old)));
        expect(read(mapSaved, { pointCloudCrs: UTM_18N_WKT }).features.map(f => f.properties.id)).toEqual(without.features.map(f => f.properties.id));
    });
});

describe('numberMeasurementFile (the save of a report)', () => {
    it('numbers the three items of a 2.0 file in creation order and writes nothing else', async () => {
        const start = oldFile();
        const { dataset, file } = memoryDataset(start);
        const result = await numberMeasurementFile(dataset, 'cloud_measurements.geojson');
        expect(result).toMatchObject({ path: 'cloud_measurements.geojson', written: true });
        const saved = file();
        expect(saved.metadata).toMatchObject({ version: '3.0', lastRef: 3 });
        expect(saved.features.map(f => f.properties.ref)).toEqual(['1', '3', '2']);
        saved.features.forEach((f, i) => {
            expect(f.properties.id).toMatch(/^[0-9a-f]{64}$/);
            expect({ ...f, properties: omit(f.properties, ['id', 'ref']) }).toEqual(start.features[i]);
        });
        expect(saved.metadata.views).toEqual(start.metadata.views);
    });

    it('does not write a file that is numbered, a file that is not there, or a second time', async () => {
        const { dataset } = memoryDataset(oldFile());
        await numberMeasurementFile(dataset, 'cloud_measurements.geojson');
        const writes = dataset.writeObj.mock.calls.length;
        expect((await numberMeasurementFile(dataset, 'cloud_measurements.geojson')).written).toBe(false);
        expect(dataset.writeObj.mock.calls).toHaveLength(writes);
        expect((await numberMeasurementFile(memoryDataset().dataset, 'cloud_measurements.geojson')).written).toBe(false);
    });

    it('fails with the reason when the file cannot be written, and leaves it as it was', async () => {
        const { dataset, state } = memoryDataset(oldFile());
        const before = state.content;
        dataset.writeObj.mockRejectedValue(new Error('Disk full'));
        await expect(numberMeasurementFile(dataset, 'cloud_measurements.geojson')).rejects.toThrow('Disk full');
        expect(state.content).toBe(before);
    });

    it('refuses a file of a newer format', async () => {
        const doc = oldFile();
        doc.metadata.version = '4.0';
        await expect(numberMeasurementFile(memoryDataset(doc).dataset, 'cloud_measurements.geojson')).rejects.toThrow(/newer format/);
    });
});

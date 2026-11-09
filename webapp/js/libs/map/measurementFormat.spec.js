/**
 * The format of the measurements file: files of the writers before 2.0 (fixtures in the shapes the old
 * map, 3D viewer and stockpile code wrote) are migrated on read, never on disk; a write keeps what
 * the other view has in the file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    read, write, parse, sectionOf, ownerOf, VIEW, FORMAT_VERSION, APPLICATION_ID, MeasurementFileError, LEGACY_GEOMETRY
} from './measurementFormat';
import {
    mapFile10, mapFile11, pointCloudFile10, pointCloudFile11, pointCloudFileNoSrs, mixedFile,
    legacyStockpileFile, orthophotoStockpileFile, cloudCoordinateSystem, CLOUD, GROUPS, CREATED, MODIFIED, UTM_18N_WKT
} from './measurementFormat.fixtures';

afterEach(() => vi.useRealTimers());

const byId = (doc, id) => doc.features.find(f => f.id === id || (f.properties && f.properties.id === id));
const normalized = doc => ({
    ...doc,
    metadata: { ...doc.metadata, modifiedAt: undefined },
    features: [...doc.features].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
});
// 1e-7 degree is about 1 cm
const expectClose = (actual, expected) => {
    expect(actual).toHaveLength(expected.length);
    expect(Math.abs(actual[0] - expected[0])).toBeLessThan(1e-7);
    expect(Math.abs(actual[1] - expected[1])).toBeLessThan(1e-7);
    expect(actual[2]).toBeCloseTo(expected[2], 6);
};

describe('read: the 2D map\'s files', () => {
    it('1.0 becomes 2.0 with the map\'s own metadata in its section', () => {
        const file = mapFile10();
        const doc = read(file);
        expect(doc.metadata).toMatchObject({ version: FORMAT_VERSION, application: APPLICATION_ID, createdAt: CREATED, modifiedAt: MODIFIED });
        expect(doc.metadata.views).toEqual({ map: { orthophotoFile: 'ortho.tif', unitPreference: 'metric' } });
        expect(doc.metadata.orthophotoFile).toBeUndefined();
        expect(doc.crs.properties.name).toBe('EPSG:4326');
        expect(doc.features).toEqual(file.features);
    });

    it('1.1: the groups move into the map\'s section', () => {
        const doc = read(mapFile11());
        expect(sectionOf(doc, VIEW.MAP).groups).toEqual(GROUPS);
        expect(doc.metadata.groups).toBeUndefined();
    });

    it('does not change the file it reads', () => {
        const file = mixedFile();
        const before = JSON.stringify(file);
        read(file, { pointCloudCrs: UTM_18N_WKT });
        expect(JSON.stringify(file)).toBe(before);
    });
});

describe('read: the 3D viewer\'s files', () => {
    it('the old file\'s geometry is far from the measured point, over 100 m (the migration has something to correct)', () => {
        const [lon, lat] = byId(pointCloudFile10(), 'a-1').geometry.coordinates;
        expect(Math.abs(lon - CLOUD.D.geo[0])).toBeGreaterThan(0.001);
        expect(Math.abs(lat - CLOUD.D.geo[1])).toBeGreaterThan(0.001);
    });

    it('1.0: the geometry is the measured position in WGS84 (the cloud\'s scale and offset are not applied twice)', () => {
        const doc = read(pointCloudFile10());
        expectClose(byId(doc, 'm-dist').geometry.coordinates[0], CLOUD.A.geo);
        expectClose(byId(doc, 'm-dist').geometry.coordinates[1], CLOUD.B.geo);
        const ring = byId(doc, 'm-area').geometry.coordinates[0];
        expect(ring).toHaveLength(4);
        [CLOUD.A, CLOUD.C, CLOUD.D, CLOUD.A].forEach((p, i) => expectClose(ring[i], p.geo));
        // An angle is its vertex, an annotation its position
        expect(byId(doc, 'm-angle').geometry.type).toBe('Point');
        expectClose(byId(doc, 'm-angle').geometry.coordinates, CLOUD.B.geo);
        expectClose(byId(doc, 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(doc.crs.properties.name).toBe('EPSG:4326');
        expect(doc.metadata).toMatchObject({ version: FORMAT_VERSION, application: APPLICATION_ID, createdAt: CREATED });
        expect(doc.metadata.views).toEqual({ pointCloud: { pointCloudFile: 'cloud.laz', coordinateSystem: cloudCoordinateSystem() } });
        expect(byId(doc, 'm-dist').properties.localCoordinates).toEqual([CLOUD.A.local, CLOUD.B.local]);
    });

    it('1.1: groups at the top belong to the map, never to the 3D viewer', () => {
        const doc = read(pointCloudFile11());
        expect(sectionOf(doc, VIEW.MAP).groups).toEqual(GROUPS);
        expect(sectionOf(doc, VIEW.POINT_CLOUD).groups).toBeUndefined();
    });

    it('with no SRS the 3D features stay as they were, marked for a later read with a CRS, and the file has no crs (never labelled WGS84)', () => {
        const file = pointCloudFileNoSrs();
        const doc = read(file);
        expect('crs' in doc).toBe(false);
        expect(doc.features).toEqual(file.features);
        expect(sectionOf(doc, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY]).toBe(true);
        expect(doc.metadata.version).toBe(FORMAT_VERSION);
        expect(JSON.stringify(doc)).not.toContain('EPSG:4326');
    });

    it('an SRS proj4 cannot use is no SRS', () => {
        const file = pointCloudFile10({ srs: 'EPSG:2056' });
        const doc = read(file);
        expect('crs' in doc).toBe(false);
        expect(byId(doc, 'a-1').geometry).toEqual(byId(file, 'a-1').geometry);
        expect(sectionOf(doc, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY]).toBe(true);
    });

    it('the CRS of the point cloud is used when the file states none, and is kept in the file\'s section', () => {
        const doc = read(pointCloudFileNoSrs(), { pointCloudCrs: cloudCoordinateSystem() });
        expectClose(byId(doc, 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(doc.crs.properties.name).toBe('EPSG:4326');
        expect(sectionOf(doc, VIEW.POINT_CLOUD).coordinateSystem.srs).toBe(UTM_18N_WKT);
        // as a plain SRS too
        expectClose(byId(read(pointCloudFileNoSrs(), { pointCloudCrs: 'EPSG:32618' }), 'a-1').geometry.coordinates, CLOUD.D.geo);
    });

    it('the CRS the file states wins over the point cloud\'s', () => {
        const doc = read(pointCloudFile10(), { pointCloudCrs: 'EPSG:32633' });
        expectClose(byId(doc, 'a-1').geometry.coordinates, CLOUD.D.geo);
    });

    it('a feature with no local coordinates keeps its geometry', () => {
        const file = pointCloudFile10();
        delete file.features[0].properties.localCoordinates;
        const geometry = JSON.stringify(file.features[0].geometry);
        expect(JSON.stringify(read(file).features[0].geometry)).toBe(geometry);
    });
});

describe('read: mixed files and migration rules', () => {
    it('a file of both views: the map\'s groups and unit, the 3D viewer\'s file and cloud, each in its section', () => {
        const doc = read(mixedFile());
        expect(doc.metadata.views).toEqual({
            map: { orthophotoFile: 'cloud.laz', unitPreference: 'metric', groups: GROUPS },
            pointCloud: { pointCloudFile: 'cloud.laz', coordinateSystem: cloudCoordinateSystem() }
        });
        expectClose(byId(doc, 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(doc.features.filter(f => ownerOf(f) === VIEW.MAP)).toHaveLength(3);
        expect(doc.features.filter(f => ownerOf(f) === VIEW.POINT_CLOUD)).toHaveLength(4);
    });

    it('is idempotent: migrating what was migrated changes nothing', () => {
        for (const file of [mapFile10(), mapFile11(), pointCloudFile10(), pointCloudFile11(), pointCloudFileNoSrs(), mixedFile()]) {
            const once = read(file);
            expect(read(once)).toEqual(once);
            expect(read(JSON.parse(JSON.stringify(once)))).toEqual(once);
        }
    });

    it('a 2.0 file is not migrated again (its geometry and groups stay)', () => {
        const doc = read(mixedFile());
        doc.features.find(f => f.id === 'a-1').geometry.coordinates = [1, 2, 3];
        expect(read(doc, { pointCloudCrs: UTM_18N_WKT }).features.find(f => f.id === 'a-1').geometry.coordinates).toEqual([1, 2, 3]);
    });

    it('a file with no version is a 1.0 file', () => {
        const file = pointCloudFile10();
        delete file.metadata.version;
        expectClose(byId(read(file), 'a-1').geometry.coordinates, CLOUD.D.geo);
        const noMetadata = { type: 'FeatureCollection', features: mapFile10().features };
        expect(read(noMetadata).metadata).toMatchObject({ version: FORMAT_VERSION, application: APPLICATION_ID });
    });

    it('older Hub saves over a 2.0 file: the groups it writes at the top replace the map\'s, the rest of the views stays', () => {
        const current = write(read(mixedFile()), VIEW.MAP, mapFile11().features, { groups: GROUPS });
        // What an older Hub does: keeps the metadata it does not know (views), sets 1.1 and writes the groups at the top
        const newGroups = [{ id: 'g2', name: 'Roads' }];
        const older = { ...current, metadata: { ...current.metadata, version: '1.1', groups: newGroups } };
        const doc = read(older);
        expect(sectionOf(doc, VIEW.MAP).groups).toEqual(newGroups);
        expect(sectionOf(doc, VIEW.POINT_CLOUD).pointCloudFile).toBe('cloud.laz');
        expect(doc.metadata.groups).toBeUndefined();
        // Without the key (none left) the groups of the 2.0 file stay
        const withoutGroups = { ...older.metadata };
        delete withoutGroups.groups;
        expect(sectionOf(read({ ...older, metadata: withoutGroups }), VIEW.MAP).groups).toEqual(GROUPS);
        // The 3D features it wrote are worked out again from their local coordinates
        const stale = older.features.map(f => (f.id === 'a-1' ? { ...f, geometry: { type: 'Point', coordinates: [500583, 4504507, 1] } } : f));
        expectClose(byId(read({ ...older, features: stale }), 'a-1').geometry.coordinates, CLOUD.D.geo);
    });
});

describe('a pre-2.0 file with 3D features and no CRS, saved first by the 2D map', () => {
    const oldFile = () => {
        const file = mixedFile();
        delete file.metadata.coordinateSystem;
        return file;
    };
    const mapOnly = doc => doc.features.filter(f => ownerOf(f) === VIEW.MAP);
    const cloudOnly = doc => doc.features.filter(f => ownerOf(f) === VIEW.POINT_CLOUD);
    // What a save puts on disk and the next read gets back
    const disk = doc => JSON.parse(JSON.stringify(doc));
    const ctx = { pointCloudCrs: UTM_18N_WKT };

    it('is written as 2.0 with the 3D features as they were; the 3D viewer\'s read corrects them; the third save changes nothing', () => {
        const file = oldFile();
        const mapRead = read(file);
        const first = disk(write(mapRead, VIEW.MAP, mapOnly(mapRead), sectionOf(mapRead, VIEW.MAP)));
        expect(first.metadata.version).toBe(FORMAT_VERSION);
        expect(cloudOnly(first)).toEqual(cloudOnly(file));
        expect(sectionOf(first, VIEW.POINT_CLOUD)).toEqual({ pointCloudFile: 'cloud.laz', [LEGACY_GEOMETRY]: true });
        expect('crs' in first).toBe(false);
        // Read again without a CRS (the map): nothing changes
        expect(read(first)).toEqual(first);

        const cloudRead = read(first, ctx);
        expectClose(byId(cloudRead, 'm-dist').geometry.coordinates[0], CLOUD.A.geo);
        expectClose(byId(cloudRead, 'm-dist').geometry.coordinates[1], CLOUD.B.geo);
        expectClose(byId(cloudRead, 'm-angle').geometry.coordinates, CLOUD.B.geo);
        expectClose(byId(cloudRead, 'a-1').geometry.coordinates, CLOUD.D.geo);
        expect(sectionOf(cloudRead, VIEW.POINT_CLOUD)).toEqual({ pointCloudFile: 'cloud.laz', coordinateSystem: { srs: UTM_18N_WKT } });
        expect(cloudRead.crs.properties.name).toBe('EPSG:4326');
        expect(mapOnly(cloudRead)).toEqual(mapOnly(first));
        // Idempotent: what was corrected is not corrected again
        expect(read(disk(cloudRead), ctx)).toEqual(disk(cloudRead));

        const second = disk(write(cloudRead, VIEW.POINT_CLOUD, cloudOnly(cloudRead), sectionOf(cloudRead, VIEW.POINT_CLOUD)));
        expect(sectionOf(second, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY]).toBeUndefined();
        const again = read(second);
        const third = disk(write(again, VIEW.MAP, mapOnly(again), sectionOf(again, VIEW.MAP)));
        expect(normalized(third)).toEqual(normalized(second));
        expect(sectionOf(third, VIEW.MAP).groups).toEqual(GROUPS);
    });

    it('a 2.0 file without the mark is never worked out again, with or without a CRS', () => {
        const doc = disk(read(mixedFile()));
        expect(read(doc, ctx)).toEqual(doc);
    });
});

describe('read: files of the stockpile panel and of other applications', () => {
    it('accepts the application ids of every writer', () => {
        for (const application of ['DroneDB Registry', 'Registry-Potree', 'Registry-Stockpile', 'Registry-Orthophoto']) {
            const file = mapFile10();
            file.metadata.application = application;
            expect(read(file).metadata.application).toBe(APPLICATION_ID);
        }
    });

    it('reads the legacy stockpile files: kind, polygon and the tagged pile', () => {
        const legacy = read(legacyStockpileFile());
        expect(legacy.metadata).toMatchObject({ kind: 'stockpile', version: FORMAT_VERSION });
        expect(legacy.features).toHaveLength(1);
        const piles = read(orthophotoStockpileFile()).features.filter(f => f.properties.measurementType === 'stockpile');
        expect(piles.map(f => f.properties.id)).toEqual(['s1']);
    });

    it('refuses a file of another application, a file that is not a collection, and a newer format', () => {
        const foreign = mapFile10();
        foreign.metadata.application = 'QGIS';
        expect(() => read(foreign)).toThrow(MeasurementFileError);
        expect(() => read(foreign)).toThrow(/another application/);
        expect(() => read({ type: 'Feature', geometry: null })).toThrow(/not a GeoJSON FeatureCollection/);
        expect(() => read([])).toThrow(MeasurementFileError);
        expect(() => read({ type: 'FeatureCollection', features: [], metadata: { version: '3.0' } })).toThrow(/newer format/);
        try { read(foreign); } catch (e) { expect(e.code).toBe('foreign'); }
    });
});

describe('parse', () => {
    it('is null for an empty file, reads text and objects, and refuses text that is not JSON', () => {
        expect(parse('')).toBeNull();
        expect(parse('  \n')).toBeNull();
        expect(parse(null)).toBeNull();
        expect(parse(JSON.stringify(mapFile11())).metadata.version).toBe(FORMAT_VERSION);
        expect(parse(mapFile11()).metadata.version).toBe(FORMAT_VERSION);
        expect(() => parse('{"type": "FeatureColl')).toThrow(/not valid JSON/);
    });
});

describe('write', () => {
    it('makes a 2.0 document of the view\'s features and section', () => {
        const doc = write(null, VIEW.MAP, mapFile10().features, { orthophotoFile: 'ortho.tif', unitPreference: 'imperial', groups: GROUPS });
        expect(doc.type).toBe('FeatureCollection');
        expect(doc.metadata).toMatchObject({ version: '2.0', kind: 'measurements', application: 'DroneDB Registry' });
        expect(doc.metadata.createdAt).toBe(doc.metadata.modifiedAt);
        expect(doc.metadata.views).toEqual({ map: { orthophotoFile: 'ortho.tif', unitPreference: 'imperial', groups: GROUPS } });
        expect(doc.metadata.groups).toBeUndefined();
        expect(doc.crs.properties.name).toBe('EPSG:4326');
        expect(doc.features).toHaveLength(3);
    });

    it('keeps createdAt and sets modifiedAt', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-05T08:00:00.000Z'));
        const doc = write(read(mapFile11()), VIEW.MAP, mapFile11().features, { groups: GROUPS });
        expect(doc.metadata.createdAt).toBe(CREATED);
        expect(doc.metadata.modifiedAt).toBe('2026-01-05T08:00:00.000Z');
    });

    it('the map keeps the 3D viewer\'s features and section; the 3D viewer keeps the map\'s', () => {
        const existing = read(mixedFile());
        const mapSave = write(existing, VIEW.MAP, [mapFile10().features[2]], { groups: [] });
        expect(mapSave.features.filter(f => ownerOf(f) === VIEW.MAP)).toHaveLength(1);
        expect(mapSave.features.filter(f => ownerOf(f) === VIEW.POINT_CLOUD)).toEqual(existing.features.filter(f => ownerOf(f) === VIEW.POINT_CLOUD));
        expect(sectionOf(mapSave, VIEW.POINT_CLOUD)).toEqual(sectionOf(existing, VIEW.POINT_CLOUD));
        // Its groups went with the groups it saved
        expect(sectionOf(mapSave, VIEW.MAP).groups).toBeUndefined();

        const cloudSave = write(existing, VIEW.POINT_CLOUD, [byId(existing, 'a-1')], { pointCloudFile: 'cloud.laz', coordinateSystem: cloudCoordinateSystem() });
        expect(cloudSave.features.filter(f => ownerOf(f) === VIEW.MAP)).toEqual(existing.features.filter(f => ownerOf(f) === VIEW.MAP));
        expect(cloudSave.features.filter(f => ownerOf(f) === VIEW.POINT_CLOUD)).toHaveLength(1);
        expect(sectionOf(cloudSave, VIEW.MAP)).toEqual(sectionOf(existing, VIEW.MAP));
    });

    it('a view with no features has no section left', () => {
        const doc = write(read(mixedFile()), VIEW.POINT_CLOUD, [], { pointCloudFile: 'cloud.laz' });
        expect(doc.metadata.views.pointCloud).toBeUndefined();
        expect(doc.metadata.views.map.groups).toEqual(GROUPS);
        expect('crs' in doc).toBe(true);
    });

    it('has a crs member only when every geometry in it is WGS84', () => {
        const noSrs = read(pointCloudFileNoSrs());
        expect('crs' in write(noSrs, VIEW.MAP, [], {})).toBe(false);
        const withSrs = write(null, VIEW.POINT_CLOUD, read(pointCloudFile10()).features, { coordinateSystem: cloudCoordinateSystem() });
        expect(withSrs.crs.properties.name).toBe('EPSG:4326');
        const unreferenced = write(null, VIEW.POINT_CLOUD, read(pointCloudFileNoSrs()).features, { coordinateSystem: cloudCoordinateSystem(null) });
        expect('crs' in unreferenced).toBe(false);
    });

    it('migrates a document that is not 2.0 before writing, so nothing is written in an old shape', () => {
        const doc = write(mapFile11(), VIEW.POINT_CLOUD, [], {});
        expect(doc.metadata.groups).toBeUndefined();
        expect(doc.metadata.views.map.groups).toEqual(GROUPS);
    });

    it('is idempotent: writing what was read gives the same document (modifiedAt apart)', () => {
        const first = write(read(mixedFile()), VIEW.MAP, read(mixedFile()).features.filter(f => ownerOf(f) === VIEW.MAP), { ...sectionOf(read(mixedFile()), VIEW.MAP) });
        const second = write(read(JSON.parse(JSON.stringify(first))), VIEW.MAP, first.features.filter(f => ownerOf(f) === VIEW.MAP), sectionOf(first, VIEW.MAP));
        expect(normalized(second)).toEqual(normalized(first));
    });
});

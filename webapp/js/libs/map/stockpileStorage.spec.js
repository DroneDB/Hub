/**
 * A saved stockpile keeps what it was weighed and priced with: its properties survive the
 * measurement layer and the measurements file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import { buildStockpileFeature, legacySourceRaster, loadStockpile, sameOutline, stockpilePolygonOf, STOCKPILE_PROPERTIES } from './stockpileStorage';
import { write, read, VIEW } from './measurementFormat';
import { pointCloudFile10, legacyStockpileFile, orthophotoStockpileFile } from './measurementFormat.fixtures';
import { exportMeasurements, importMeasurements } from './olMeasurementConverter';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import Registry from '@/libs/ddb/registry';

const POLYGON = { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] };
const PROPERTIES = {
    title: 'North pile', material: 'u-k3f9x2', materialName: 'Rail ballast', materialDensity: 1.8,
    costPerTon: 22, currency: 'EUR', netVolume: 100, cutVolume: 100, fillVolume: 0, area2d: 50,
    weightEstimate: { tons: 180, basedOn: 'cutVolume' }, costEstimate: { amount: 3960, currency: 'EUR' },
    unitSystem: 'metric'
};

describe('a stockpile in the measurements file', () => {
    it('keeps its material name, density, price and currency through import and export', () => {
        const feature = buildStockpileFeature(POLYGON, PROPERTIES);
        const source = new VectorSource();
        // A stockpile keeps its own text: the units and the map are not needed
        importMeasurements({ type: 'FeatureCollection', features: [feature] }, source);
        const [saved] = exportMeasurements(source, 'dsm.tif').features;
        expect(saved.properties).toMatchObject({ measurementType: 'stockpile', ...PROPERTIES });
    });

    it('every stockpile property is listed once', () => {
        expect(new Set(STOCKPILE_PROPERTIES).size).toBe(STOCKPILE_PROPERTIES.length);
        for (const key of ['materialName', 'costPerTon', 'currency', 'basePlaneMethod', 'sourceRaster', 'flatElevation']) expect(STOCKPILE_PROPERTIES).toContain(key);
    });

    it('keeps the elevation model and the flat elevation it was measured with through import and export', () => {
        const feature = buildStockpileFeature(POLYGON, { ...PROPERTIES, basePlaneMethod: 'flat', flatElevation: 12.5, sourceRaster: 'site/dsm.tif' });
        const source = new VectorSource();
        importMeasurements({ type: 'FeatureCollection', features: [feature] }, source);
        const [saved] = exportMeasurements(source, 'site/dsm.tif').features;
        expect(saved.properties).toMatchObject({ basePlaneMethod: 'flat', flatElevation: 12.5, sourceRaster: 'site/dsm.tif' });
    });
});

describe('loadStockpile', () => {
    const datasetWith = content => ({
        getFileContents: vi.fn(async () => {
            if (content === null) throw Object.assign(new Error('Not found'), { status: 404 });
            return typeof content === 'string' ? content : JSON.stringify(content);
        })
    });
    const pile = buildStockpileFeature(POLYGON, { ...PROPERTIES, id: 's1' });

    it('reads the pile of a file the 3D viewer saved last (its application id is accepted)', async () => {
        // The 3D viewer's file with the map's pile in it: the viewer's 1.0 file, the pile added by the map
        const file = pointCloudFile10();
        file.features.push(pile);
        const loaded = await loadStockpile(datasetWith(file), 'dsm_measurements.geojson', 'dsm.tif');
        expect(loaded.properties).toMatchObject({ id: 's1', materialName: 'Rail ballast' });
        expect(loaded.polygon).toEqual(POLYGON);

        // ... and one the 3D viewer saved under the 2.0 format
        const saved = write(read({ type: 'FeatureCollection', metadata: { version: '1.0' }, features: [pile] }), VIEW.POINT_CLOUD, [], {});
        expect((await loadStockpile(datasetWith(saved), 'dsm_measurements.geojson', 'dsm.tif')).properties.id).toBe('s1');
    });

    it('reads the files of the legacy application ids and the untagged polygon of the oldest ones', async () => {
        expect((await loadStockpile(datasetWith(orthophotoStockpileFile()), 'x_measurements.geojson', 'x.tif')).properties.id).toBe('s1');
        expect((await loadStockpile(datasetWith(legacyStockpileFile()), 'x_measurements.geojson', 'x.tif')).properties.title).toBe('Old pile');
    });

    it('has nothing to show for a missing file, a file that cannot be used or a foreign one', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await loadStockpile(datasetWith(null), 'x_measurements.geojson', 'x.tif')).toBeNull();
        expect(await loadStockpile(datasetWith('{ not json'), 'x_measurements.geojson', 'x.tif')).toBeNull();
        const foreign = orthophotoStockpileFile();
        foreign.metadata.application = 'QGIS';
        expect(await loadStockpile(datasetWith(foreign), 'x_measurements.geojson', 'x.tif')).toBeNull();
        warn.mockRestore();
    });

    it('does not ask for a file its folder does not list: no 404 for the browser to log when the panel opens', async () => {
        const dataset = { ...datasetWith(orthophotoStockpileFile()), list: vi.fn(async () => [{ path: 'x.tif' }]) };
        expect(await loadStockpile(dataset, 'site/x_measurements.geojson', 'site/x.tif')).toBeNull();
        expect(dataset.list).toHaveBeenCalledWith('site');
        expect(dataset.getFileContents).not.toHaveBeenCalled();

        dataset.list = vi.fn(async () => [{ path: 'site/x.tif' }, { path: 'site/x_measurements.geojson' }]);
        expect((await loadStockpile(dataset, 'site/x_measurements.geojson', 'site/x.tif')).properties.id).toBe('s1');
        expect(dataset.getFileContents).toHaveBeenCalledWith('site/x_measurements.geojson');
    });

    it('skips the piles the user removed', async () => {
        expect(await loadStockpile(datasetWith(orthophotoStockpileFile()), 'x_measurements.geojson', 'x.tif', new Set(['s1']))).toBeNull();
    });

    describe('the measurements file the map shows', () => {
        const pileOn = (id, sourceRaster) => buildStockpileFeature(POLYGON, { ...PROPERTIES, id, ...(sourceRaster ? { sourceRaster } : {}) });
        const fileOf = (features, orthophotoFile) => ({
            type: 'FeatureCollection',
            metadata: { version: '2.0', application: 'DroneDB Registry', views: orthophotoFile ? { map: { orthophotoFile } } : {} },
            features
        });

        it('is the file at the path it is given, whatever the raster the panel is on', async () => {
            // The map of a folder saves in measurements.geojson: no raster has a sidecar of its own there
            const dataset = datasetWith(fileOf([pileOn('a', 'site/dsm.tif')]));
            const loaded = await loadStockpile(dataset, 'site/measurements.geojson', 'site/dsm.tif');
            expect(loaded.properties.id).toBe('a');
            expect(dataset.getFileContents).toHaveBeenCalledWith('site/measurements.geojson');
            // Not <raster>_measurements.geojson
            expect(dataset.getFileContents).not.toHaveBeenCalledWith('site/dsm_measurements.geojson');
        });

        it('has nothing to read without a path', async () => {
            const dataset = datasetWith(fileOf([pileOn('a')]));
            expect(await loadStockpile(dataset, null, 'dsm.tif')).toBeNull();
            expect(dataset.getFileContents).not.toHaveBeenCalled();
        });

        it('prefers the pile measured on the raster of the panel, then the one saved last', async () => {
            const file = fileOf([pileOn('on-dtm', 'dtm.tif'), pileOn('on-dsm', 'dsm.tif'), pileOn('also-dtm', 'dtm.tif')]);
            expect((await loadStockpile(datasetWith(file), 'measurements.geojson', 'dsm.tif')).properties.id).toBe('on-dsm');
            expect((await loadStockpile(datasetWith(file), 'measurements.geojson', 'dtm.tif')).properties.id).toBe('also-dtm');
            // None of that raster: the one saved last, whatever it was measured on
            expect((await loadStockpile(datasetWith(file), 'measurements.geojson', 'other.tif')).properties.id).toBe('also-dtm');
        });

        it('gives a pile without sourceRaster the raster its file says, in memory only', async () => {
            const file = fileOf([pileOn('old')], 'site/dsm.tif');
            const loaded = await loadStockpile(datasetWith(file), 'site/measurements.geojson', 'site/dtm.tif');
            expect(loaded.properties.sourceRaster).toBe('site/dsm.tif');
            expect(loaded.defaultRaster).toBe('site/dsm.tif');
            expect(file.features[0].properties.sourceRaster).toBeUndefined();
        });

        it('gives it the raster its file is the sidecar of when the file says none', async () => {
            const loaded = await loadStockpile(datasetWith(fileOf([pileOn('old')])), 'site/dsm_measurements.geojson', 'site/dsm.tif');
            expect(loaded.properties.sourceRaster).toBe('site/dsm.tif');
        });

        it('leaves a pile without sourceRaster as it is when nothing tells its raster', async () => {
            const loaded = await loadStockpile(datasetWith(fileOf([pileOn('old')])), 'site/measurements.geojson', 'site/dsm.tif');
            expect(loaded.properties.sourceRaster).toBeUndefined();
            expect(loaded.defaultRaster).toBeNull();
        });

        it('keeps the sourceRaster a pile was saved with, whatever its file says', async () => {
            const loaded = await loadStockpile(datasetWith(fileOf([pileOn('a', 'site/dtm.tif')], 'site/dsm.tif')), 'site/measurements.geojson', 'site/dsm.tif');
            expect(loaded.properties.sourceRaster).toBe('site/dtm.tif');
        });
    });
});

describe('sameOutline', () => {
    const square = (d = 0) => ({ type: 'Polygon', coordinates: [[[9 + d, 45], [9.001, 45], [9.001, 45.001], [9 + d, 45]]] });
    it('is the same outline within the tolerance (the rounding of the trip through the map projection)', () => {
        expect(sameOutline(square(), square(1e-9))).toBe(true);
    });
    it('is another outline when a vertex moved, a vertex is missing, or one is absent', () => {
        expect(sameOutline(square(), square(1e-5))).toBe(false);
        const short = { type: 'Polygon', coordinates: [square().coordinates[0].slice(1)] };
        expect(sameOutline(square(), short)).toBe(false);
        expect(sameOutline(square(), null)).toBe(false);
    });
});

describe('legacySourceRaster', () => {
    it('is the raster the file records, else the raster whose sidecar the file is, else none', () => {
        const recorded = { metadata: { views: { map: { orthophotoFile: 'a/dsm.tif' } } } };
        expect(legacySourceRaster(recorded, 'a/measurements.geojson', 'a/other.tif')).toBe('a/dsm.tif');
        expect(legacySourceRaster({ metadata: {} }, 'a/dsm_measurements.geojson', 'a/dsm.tif')).toBe('a/dsm.tif');
        expect(legacySourceRaster({ metadata: {} }, 'a/dsm_measurements.geojson', 'a/other.tif')).toBeNull();
        expect(legacySourceRaster({ metadata: {} }, 'a/measurements.geojson', null)).toBeNull();
    });
});

describe('stockpilePolygonOf', () => {
    it('is the outline of the feature as a WGS84 polygon, from the projection of the map', () => {
        const ring = [[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]];
        const feature = new Feature(new Polygon([ring.map(c => fromLonLat(c))]));
        const polygon = stockpilePolygonOf(feature, 'EPSG:3857');
        expect(polygon.type).toBe('Polygon');
        polygon.coordinates[0].forEach((c, i) => {
            expect(c[0]).toBeCloseTo(ring[i][0], 6);
            expect(c[1]).toBeCloseTo(ring[i][1], 6);
        });
    });

    it('is null for a feature that is not a polygon', () => {
        expect(stockpilePolygonOf(new Feature())).toBeNull();
    });
});

describe('loadStockpile with the Registry client', () => {
    afterEach(() => vi.restoreAllMocks());

    // The Registry's answer for a path with no entry: 404 with a ProblemDetails body
    const notFound = () => new Response(JSON.stringify({ title: 'Not Found', status: 404, detail: "Cannot find 'dsm_measurements.geojson'" }),
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
    const datasetAnswering = answer => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answer());
        return new Registry(`http://stockpile-${Math.random().toString(36).slice(2)}.test`).Organization('org').Dataset('ds');
    };

    it('has no pile, and nothing to warn about, when the file is not there yet (the client\'s 404)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await loadStockpile(datasetAnswering(notFound), 'dsm_measurements.geojson', 'dsm.tif')).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    it('has no pile for an empty file', async () => {
        expect(await loadStockpile(datasetAnswering(() => new Response('', { status: 200 })), 'dsm_measurements.geojson', 'dsm.tif')).toBeNull();
    });

    it('warns about a file it could not read (a server error is not a missing file)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await loadStockpile(datasetAnswering(() => new Response('boom', { status: 500 })), 'dsm_measurements.geojson', 'dsm.tif')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

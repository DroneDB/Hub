/**
 * A saved stockpile keeps what it was weighed and priced with: its properties survive the
 * measurement layer and the measurements file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import { buildStockpileFeature, loadStockpile, STOCKPILE_PROPERTIES } from './stockpileStorage';
import { write, read, VIEW } from './measurementFormat';
import { pointCloudFile10, legacyStockpileFile, orthophotoStockpileFile } from './measurementFormat.fixtures';
import { exportMeasurements, importMeasurements } from './olMeasurementConverter';
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
        for (const key of ['materialName', 'costPerTon', 'currency', 'basePlaneMethod']) expect(STOCKPILE_PROPERTIES).toContain(key);
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
        const loaded = await loadStockpile(datasetWith(file), 'dsm.tif');
        expect(loaded.properties).toMatchObject({ id: 's1', materialName: 'Rail ballast' });
        expect(loaded.polygon).toEqual(POLYGON);

        // ... and one the 3D viewer saved under the 2.0 format
        const saved = write(read({ type: 'FeatureCollection', metadata: { version: '1.0' }, features: [pile] }), VIEW.POINT_CLOUD, [], {});
        expect((await loadStockpile(datasetWith(saved), 'dsm.tif')).properties.id).toBe('s1');
    });

    it('reads the files of the legacy application ids and the untagged polygon of the oldest ones', async () => {
        expect((await loadStockpile(datasetWith(orthophotoStockpileFile()), 'x.tif')).properties.id).toBe('s1');
        expect((await loadStockpile(datasetWith(legacyStockpileFile()), 'x.tif')).properties.title).toBe('Old pile');
    });

    it('has nothing to show for a missing file, a file that cannot be used or a foreign one', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await loadStockpile(datasetWith(null), 'x.tif')).toBeNull();
        expect(await loadStockpile(datasetWith('{ not json'), 'x.tif')).toBeNull();
        const foreign = orthophotoStockpileFile();
        foreign.metadata.application = 'QGIS';
        expect(await loadStockpile(datasetWith(foreign), 'x.tif')).toBeNull();
        warn.mockRestore();
    });

    it('skips the piles the user removed', async () => {
        expect(await loadStockpile(datasetWith(orthophotoStockpileFile()), 'x.tif', new Set(['s1']))).toBeNull();
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
        expect(await loadStockpile(datasetAnswering(notFound), 'dsm.tif')).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    it('has no pile for an empty file', async () => {
        expect(await loadStockpile(datasetAnswering(() => new Response('', { status: 200 })), 'dsm.tif')).toBeNull();
    });

    it('warns about a file it could not read (a server error is not a missing file)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await loadStockpile(datasetAnswering(() => new Response('boom', { status: 500 })), 'dsm.tif')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

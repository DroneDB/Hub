/**
 * A saved stockpile keeps what it was weighed and priced with: its properties survive the
 * measurement layer and the measurements file.
 */
import { describe, it, expect } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import { buildStockpileFeature, STOCKPILE_PROPERTIES } from './stockpileStorage';
import { exportMeasurements, importMeasurements } from './olMeasurementConverter';

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

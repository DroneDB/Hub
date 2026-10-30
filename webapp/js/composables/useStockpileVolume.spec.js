/**
 * The weight and the cost of a pile follow the material: a change of material, of the user's
 * materials or of a custom value weighs the pile again, both in the panel and on the pile the
 * toolbar saves. A restored pile keeps what it was weighed and priced with.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import { flushPromises } from '@vue/test-utils';
import Feature from 'ol/Feature';
import { Vector as VectorSource } from 'ol/source';
import { useStockpileVolume } from './useStockpileVolume';
import { PREF, setPref, _resetPrefListenersForTests } from '@/libs/preferences';

const POLYGON = { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] };
const VOLUME = { cutVolume: 100, fillVolume: 0, netVolume: 100, area2d: 50 };

let scope;
let pile;
let source;
let savedFile;

function start() {
    source = new VectorSource();
    const measureControls = {
        source,
        // As the measure control does: one OL feature per GeoJSON feature, with its properties
        importFromGeoJSON(fc) {
            for (const f of fc.features) {
                const feature = new Feature();
                feature.setProperties(f.properties);
                source.addFeature(feature);
            }
        },
        refreshButtons() {}
    };
    const dataset = {
        calculateStockpileVolume: async () => ({ ...VOLUME }),
        getFileContents: async () => {
            if (!savedFile) throw Object.assign(new Error('not found'), { status: 404 });
            return JSON.stringify(savedFile);
        }
    };
    scope = effectScope();
    pile = scope.run(() => useStockpileVolume({
        dataset: () => dataset,
        map: ref(null),
        measureControls: shallowRef(measureControls),
        currentUnitPref: ref('metric'),
        deletedMeasurementIds: ref([]),
        rasterFilePath: ref(''),
        getMapCenterLatLon: () => () => null
    }));
}

/** The pile on the map, as the toolbar saves it */
const draft = () => source.getFeatures().find(f => f.get('measurementType') === 'stockpile');

async function measure(material) {
    pile.stockpileMaterial.value = material;
    await nextTick();
    pile.openStockpileVolume('dsm.tif');
    await flushPromises();
    await pile.calculateStockpileVolume(POLYGON);
    await flushPromises();
}

const savedPile = properties => ({
    type: 'FeatureCollection',
    metadata: { application: 'DroneDB Registry', kind: 'measurements' },
    features: [{ type: 'Feature', geometry: POLYGON, properties: { id: 'p1', measurementType: 'stockpile', ...VOLUME, ...properties } }]
});

beforeEach(() => {
    _resetPrefListenersForTests();
    setPref(PREF.STOCKPILE_MATERIALS, null);
    setPref(PREF.CURRENCY, null);
    savedFile = null;
    start();
});
afterEach(() => {
    scope.stop();
    _resetPrefListenersForTests();
});

describe('weight and cost of a measured pile', () => {
    it('are those of the selected material, in the panel and on the pile', async () => {
        await measure('gravel');
        expect(pile.stockpileResult.value.weightEstimate).toEqual({ tons: 168, basedOn: 'cutVolume' });
        expect(pile.stockpileResult.value.costEstimate).toEqual({ amount: 2520, currency: 'USD' });
        expect(draft().get('weightEstimate').tons).toBe(168);
        expect(draft().getProperties()).toMatchObject({ material: 'gravel', materialName: 'Gravel', materialDensity: 1.68, costPerTon: 15, currency: 'USD' });
    });

    it('follow a change of material after the measure (the saved pile was left with the old ones)', async () => {
        await measure('gravel');
        pile.stockpileMaterial.value = 'sand';
        await flushPromises();
        expect(pile.stockpileResult.value.weightEstimate.tons).toBe(160);
        expect(draft().get('weightEstimate').tons).toBe(160);
        expect(draft().get('costEstimate').amount).toBe(1920);
        expect(draft().get('materialName')).toBe('Sand');
    });

    it('are gone, on the pile too, when the material is set to none', async () => {
        await measure('gravel');
        pile.stockpileMaterial.value = null;
        await flushPromises();
        expect(pile.stockpileResult.value.weightEstimate).toBeUndefined();
        expect(draft().get('weightEstimate')).toBeUndefined();
        expect(draft().get('materialName')).toBeUndefined();
    });

    it('follow the user values and currency, also when they change with the panel open', async () => {
        setPref(PREF.CURRENCY, 'EUR');
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { gravel: { costPerTon: 20 } } });
        await measure('gravel');
        expect(pile.stockpileResult.value.costEstimate).toEqual({ amount: 3360, currency: 'EUR' });
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { gravel: { densityTonPerM3: 2, costPerTon: 20 } } });
        await flushPromises();
        expect(pile.stockpileResult.value.weightEstimate.tons).toBe(200);
        expect(draft().get('costEstimate')).toEqual({ amount: 4000, currency: 'EUR' });
        // The general currency setting changes from the Units tab
        setPref(PREF.CURRENCY, 'GBP');
        await flushPromises();
        expect(draft().get('costEstimate')).toEqual({ amount: 4000, currency: 'GBP' });
        expect(draft().get('currency')).toBe('GBP');
    });

    it('a custom material: the typed density and price, in the user currency, and a price change weighs again', async () => {
        setPref(PREF.CURRENCY, 'CHF');
        pile.stockpileCustomDensity.value = 2;
        pile.stockpileCustomCostPerTon.value = 5;
        await measure('__custom__');
        expect(pile.stockpileResult.value.costEstimate).toEqual({ amount: 1000, currency: 'CHF' });
        pile.stockpileCustomCostPerTon.value = 7;
        await flushPromises();
        expect(draft().get('costEstimate').amount).toBe(1400);
        expect(draft().get('costPerTon')).toBe(7);
    });

    it('a material the user hides is no longer selected, and the pile has no weight', async () => {
        await measure('snow');
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { snow: { hidden: true } } });
        await flushPromises();
        expect(pile.stockpileMaterials.value.some(m => m.slug === 'snow')).toBe(false);
        expect(pile.stockpileMaterial.value).toBeNull();
        expect(pile.stockpileResult.value.weightEstimate).toBeUndefined();
    });

    it('offers the user materials after the built-in ones, without the hidden ones', async () => {
        setPref(PREF.STOCKPILE_MATERIALS, {
            overrides: { coal: { hidden: true } },
            custom: [{ id: 'u-1', name: 'Ballast', densityTonPerM3: 1.8, costPerTon: 22 }]
        });
        await flushPromises();
        const slugs = pile.stockpileMaterials.value.map(m => m.slug);
        expect(slugs).not.toContain('coal');
        expect(slugs.at(-1)).toBe('u-1');
    });
});

describe('a restored pile', () => {
    async function restore(properties) {
        savedFile = savedPile({ weightEstimate: { tons: 1, basedOn: 'cutVolume' }, costEstimate: { amount: 1, currency: 'USD' }, ...properties });
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    }

    it('with the values of one of the user materials selects it', async () => {
        await restore({ material: 'gravel', materialDensity: 1.68, costPerTon: 15, currency: 'USD' });
        expect(pile.stockpileMaterial.value).toBe('gravel');
        expect(pile.stockpileMaterials.value.some(m => m.saved)).toBe(false);
    });

    it('priced otherwise keeps its own material, offered first, and its saved slug', async () => {
        setPref(PREF.CURRENCY, 'EUR');
        await restore({
            material: 'u-other', materialName: 'Their ballast', materialDensity: 1.8, costPerTon: 22, currency: 'GBP',
            weightEstimate: { tons: 180, basedOn: 'cutVolume' }, costEstimate: { amount: 3960, currency: 'GBP' }
        });
        expect(pile.stockpileMaterials.value[0]).toMatchObject({ name: 'Their ballast', saved: true, currency: 'GBP' });
        expect(pile.stockpileMaterial.value).toBe(pile.stockpileMaterials.value[0].slug);
        // Weighed again with what it was saved with: the same figures
        expect(pile.stockpileResult.value.weightEstimate.tons).toBeCloseTo(180, 9);
        expect(pile.stockpileResult.value.costEstimate).toEqual({ amount: 3960, currency: 'GBP' });
        // A pile measured with it is saved under its own slug and name, not "__saved__"
        await pile.calculateStockpileVolume(POLYGON);
        await flushPromises();
        expect(draft().getProperties()).toMatchObject({ material: 'u-other', materialName: 'Their ballast', costPerTon: 22, currency: 'GBP' });
    });

    it('a built-in material whose price the user has changed since keeps the saved price', async () => {
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { gravel: { costPerTon: 30 } } });
        await restore({ material: 'gravel', materialDensity: 1.68, weightEstimate: { tons: 168 }, costEstimate: { amount: 2520, currency: 'USD' } });
        const saved = pile.stockpileMaterials.value[0];
        expect(saved).toMatchObject({ name: 'Gravel', saved: true, costPerTon: 15 });
        expect(pile.stockpileResult.value.costEstimate.amount).toBeCloseTo(2520, 6);
    });

    it('with a custom material gets the typed density and price back', async () => {
        await restore({ material: '__custom__', materialDensity: 2.2, costPerTon: 9 });
        expect(pile.stockpileMaterial.value).toBe('__custom__');
        expect(pile.stockpileCustomDensity.value).toBe(2.2);
        expect(pile.stockpileCustomCostPerTon.value).toBe(9);
    });

    it('its own material is no longer offered once the panel closes', async () => {
        await restore({ material: 'u-other', materialName: 'Their ballast', materialDensity: 1.8, costPerTon: 22 });
        pile.closeStockpileVolume();
        await flushPromises();
        expect(pile.stockpileMaterials.value.some(m => m.saved)).toBe(false);
        expect(pile.stockpileMaterial.value).toBeNull();
    });
});

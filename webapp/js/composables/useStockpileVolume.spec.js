/**
 * The weight and the cost of a pile follow the material: a change of material, of the user's
 * materials or of a custom value weighs the pile again, both in the panel and on the pile the
 * toolbar saves. A restored pile keeps what it was weighed and priced with.
 *
 * The base of the volume: a pile found by a click is measured from the best-fit plane and a drawn
 * polygon from the lowest perimeter, until the user picks a base; a pick measures the pile again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import { flushPromises } from '@vue/test-utils';
import Feature from 'ol/Feature';
import { Vector as VectorSource } from 'ol/source';
import { useStockpileVolume } from './useStockpileVolume';
import { PREF, setPref, _resetPrefListenersForTests } from '@/libs/preferences';
import { formatDensity, formatVolume } from '@/libs/format';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Draw from 'ol/interaction/Draw';
import { toLonLat } from 'ol/proj';
import { LineString } from 'ol/geom';
import MeasureControls from '@/libs/map/controls/measureControl';
import { MeasurementStorage } from '@/libs/map/measurementStorage';
import { ApiError } from '@/libs/ddb/apiError';

const POLYGON = { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] };
const VOLUME = { cutVolume: 100, fillVolume: 0, netVolume: 100, area2d: 50 };

let scope;
let pile;
let source;
let savedFile;
// The ids of the measurements in the file, as the measure control tells
let savedIds;
// The units of the map
let unitPref;
// The map the composable draws its overlay on (none unless a test gives one)
let olMap;
let dataset;
// The base of every volume asked for, and the volume of each base (a pile on a slope)
let measuredBases;
let netVolumeOf;
// The measure control (or what stands for it) the composable locks while a mode draws
let toolbar;

/** @param {any} [controls]  the real measure control (default: one that does what the composable needs) */
function start(controls) {
    source = controls ? controls.source : new VectorSource();
    savedIds = new Set();
    const measureControls = controls || {
        source,
        // As the measure control does: one OL feature per GeoJSON feature, with its properties
        importFromGeoJSON(fc) {
            for (const f of fc.features) {
                const feature = new Feature();
                feature.setProperties(f.properties);
                source.addFeature(feature);
            }
        },
        refreshButtons() {},
        setToolsDisabled: vi.fn(),
        // As the measure control does: in the saved file, whatever else changed on the map
        isSaved: id => savedIds.has(id),
        deleteMeasurement(feature) { source.removeFeature(feature); }
    };
    dataset = {
        calculateStockpileVolume: async (path, polygon, { baseMethod }) => {
            measuredBases.push(baseMethod);
            const net = netVolumeOf[baseMethod] ?? VOLUME.netVolume;
            return { ...VOLUME, cutVolume: net, netVolume: net, basePlaneMethod: baseMethod };
        },
        detectStockpile: async () => ({ polygon: POLYGON, confidence: 0.8, estimatedVolume: 8.7, basePlaneMethod: 'auto' }),
        getFileContents: async () => {
            if (!savedFile) throw Object.assign(new Error('not found'), { status: 404 });
            return JSON.stringify(savedFile);
        }
    };
    toolbar = measureControls;
    scope = effectScope();
    pile = scope.run(() => useStockpileVolume({
        dataset: () => dataset,
        map: olMap = ref(null),
        measureControls: shallowRef(measureControls),
        currentUnitPref: unitPref = ref('metric'),
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
    measuredBases = [];
    netVolumeOf = {};
    start();
});
afterEach(() => {
    scope.stop();
    _resetPrefListenersForTests();
});

// FR-MAP-05: the label of the pile on the map writes its volume and density as the panel does
describe('the label of a measured pile', () => {
    afterEach(() => { delete navigator.language; });

    it('writes the volume and the density with the formatter of the panel, in the browser locale', async () => {
        Object.defineProperty(navigator, 'language', { value: 'it-IT', configurable: true });
        dataset.calculateStockpileVolume = async () => ({ ...VOLUME, cutVolume: 1234.567, netVolume: 1234.567 });
        await measure('gravel');
        expect(draft().get('tooltipText')).toBe(`${formatVolume(1234.567, 'metric')} - Gravel - ${formatDensity(1.68, 'metric')}`);
        expect(draft().get('tooltipText')).toBe('1.234,57 m³ - Gravel - 1,68 t/m³');
    });
});

describe('the label of a measured pile in imperial (FR-MAP-13)', () => {
    afterEach(() => { delete navigator.language; });

    it('is built from the metric result in yd³ and ST/yd³, the properties stay metric', async () => {
        Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
        unitPref.value = 'imperial';
        dataset.calculateStockpileVolume = async () => ({ ...VOLUME, cutVolume: 8097.19, netVolume: 8097.19 });
        await measure('gravel');
        // 8097.19 m³ x 1.307950619 = 10,590.72 yd³; 1.68 t/m³ x 0.8427774 = 1.416 ST/yd³
        expect(draft().get('tooltipText')).toBe('10,590.72 yd³ - Gravel - 1.416 ST/yd³');
        expect(draft().get('netVolume')).toBe(8097.19);
        expect(draft().get('materialDensity')).toBe(1.68);
    });
});

describe('Clear (FR-MAP-02, AC-014)', () => {
    it('removes a pile that is not saved from the map', async () => {
        await measure('gravel');
        expect(draft()).toBeDefined();
        pile.clearStockpileOverlay();
        expect(draft()).toBeUndefined();
        expect(pile.stockpileResult.value).toBeNull();
    });

    it('keeps a pile that was saved: after adopt, markSaved and Clear it is still in the source', async () => {
        await measure('gravel');
        savedIds.add(draft().get('id'));
        pile.clearStockpileOverlay();
        expect(draft()).toBeDefined();
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileDetectedPolygon.value).toBeNull();
    });

    it('keeps a saved pile also when the map has other unsaved changes', async () => {
        await measure('gravel');
        savedIds.add(draft().get('id'));
        // A distance drawn after the save: the map is dirty, the pile is still saved
        source.addFeature(new Feature({ measurementType: 'length', id: 'd1' }));
        pile.clearStockpileOverlay();
        expect(source.getFeatures().filter(f => f.get('measurementType') === 'stockpile')).toHaveLength(1);
        expect(source.getFeatures()).toHaveLength(2);
    });

    it('then a pile measured next is a new one: the saved pile is not replaced or removed by it', async () => {
        await measure('gravel');
        const first = draft().get('id');
        savedIds.add(first);
        pile.clearStockpileOverlay();
        await pile.calculateStockpileVolume(POLYGON);
        await flushPromises();
        const ids = source.getFeatures().filter(f => f.get('measurementType') === 'stockpile').map(f => f.get('id'));
        expect(ids).toHaveLength(2);
        expect(ids).toContain(first);
    });
});

describe('Clear after a save, then Save, with the real measure control and storage (FR-MAP-02, AC-014)', () => {
    let control;
    let olMapOfControl;
    let file;
    let storage;

    beforeEach(() => {
        scope.stop();
        control = new MeasureControls({});
        const target = document.createElement('div');
        document.body.appendChild(target);
        olMapOfControl = new OlMap({ target });
        control.setMap(olMapOfControl);
        file = { content: null };
        // The dataset's file: the client's 404 until the first save writes it
        const fileDataset = {
            getFileContents: async () => {
                if (file.content === null) throw new ApiError('Not found', 404);
                return file.content;
            },
            writeObj: async (_path, blob) => { file.content = await blob.text(); },
            deleteObj: async () => { file.content = null; }
        };
        storage = new MeasurementStorage(fileDataset, { path: 'dsm.tif' });
        start(control);
    });
    afterEach(() => {
        control.setMap(null);
        olMapOfControl.setTarget(undefined);
    });

    // The toolbar's Save
    async function save() {
        await storage.save(control.exportToGeoJSON('dsm.tif'));
        control.markSaved();
    }
    const fileFeatures = type => JSON.parse(file.content).features.filter(f => f.properties.measurementType === type);

    it('a title edit after the save, then Clear, then Save: the pile is still in the file, with its new title', async () => {
        await measure('gravel');
        await save();
        const id = draft().get('id');
        expect(fileFeatures('stockpile').map(f => f.properties.id)).toEqual([id]);

        pile.stockpileTitle.value = 'North pile';
        await nextTick();
        expect(control.isDirty()).toBe(true);
        pile.clearStockpileOverlay();
        await save();
        const piles = fileFeatures('stockpile');
        expect(piles.map(f => f.properties.id)).toEqual([id]);
        expect(piles[0].properties.title).toBe('North pile');
    });

    it('a new measurement after the save, then Clear, then Save: the pile and the new measurement are in the file', async () => {
        await measure('gravel');
        await save();
        const id = draft().get('id');

        const line = new Feature(new LineString([[0, 0], [100, 0]]));
        line.setProperties({ measurementType: 'length', name: 'Fence' });
        control.source.addFeature(line);
        expect(control.isDirty()).toBe(true);
        pile.clearStockpileOverlay();
        await save();
        expect(fileFeatures('stockpile').map(f => f.properties.id)).toEqual([id]);
        expect(fileFeatures('length').map(f => f.properties.name)).toEqual(['Fence']);
    });

    it('a pile that was never saved goes with Clear, and the next Save does not write it', async () => {
        await measure('gravel');
        pile.clearStockpileOverlay();
        expect(draft()).toBeUndefined();
        const line = new Feature(new LineString([[0, 0], [100, 0]]));
        line.setProperties({ measurementType: 'length', name: 'Fence' });
        control.source.addFeature(line);
        await save();
        expect(fileFeatures('length')).toHaveLength(1);
        expect(fileFeatures('stockpile')).toEqual([]);
    });
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

describe('a saved pile read while the panel changes', () => {
    /** A map that keeps the layers added to it, and the features of the overlay of the pile */
    function withMap() {
        const layers = [];
        olMap.value = { addLayer: l => layers.push(l), getView: () => ({ getProjection: () => 'EPSG:3857' }) };
        return () => layers.flatMap(l => l.getSource().getFeatures());
    }
    /** Each read of a file waits until the test answers it, with the saved pile of that raster */
    function slowReads(dataset) {
        const reads = [];
        dataset.getFileContents = path => new Promise(resolve => reads.push({ path, answer: () => resolve(JSON.stringify(savedPile({ title: path }))) }));
        return reads;
    }

    it('is not shown when the panel opened on another raster before it was read', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        // The elevation model is switched while the pile of the DSM is still being read
        pile.closeStockpileVolume();
        pile.openStockpileVolume('dtm.tif');
        reads.find(r => r.path === 'dsm_measurements.geojson').answer();
        await flushPromises();
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileDetectedPolygon.value).toBeNull();
        expect(overlay()).toHaveLength(0);
        // The pile of the DTM is shown when it is read
        reads.find(r => r.path === 'dtm_measurements.geojson').answer();
        await flushPromises();
        expect(pile.stockpileTitle.value).toBe('dtm_measurements.geojson');
        expect(overlay()).toHaveLength(1);
    });

    it('is not shown once the panel closed', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        pile.closeStockpileVolume();
        reads[0].answer();
        await flushPromises();
        expect(pile.stockpileResult.value).toBeNull();
        expect(overlay()).toHaveLength(0);
    });

    it('does not replace a pile the user found by a click before it was read', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        await pile.autoDetectAndCalculate(9.0005, 45.0005);
        pile.stockpileTitle.value = 'North heap';
        reads[0].answer();
        await flushPromises();
        expect(pile.stockpileResult.value).toMatchObject({ confidence: 0.8, estimatedFromDetection: 8.7 });
        expect(pile.stockpileResult.value._restored).toBeUndefined();
        expect(pile.stockpileTitle.value).toBe('North heap');
        expect(pile.stockpileBaseMethod.value).toBe('best_fit');
        expect(overlay()).toHaveLength(0);
    });

    it('does not replace a pile the user drew while it was read', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        const drawn = pile.calculateStockpileVolume(POLYGON);
        reads[0].answer();
        await drawn;
        await flushPromises();
        expect(pile.stockpileResult.value._restored).toBeUndefined();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileBaseMethod.value).toBe('lowest_perimeter');
        expect(overlay()).toHaveLength(0);
    });

    it('drawn for one raster is cleared when the panel opens for another', async () => {
        const overlay = withMap();
        savedFile = savedPile({ title: 'DSM pile' });
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        expect(overlay()).toHaveLength(1);
        savedFile = null;
        pile.openStockpileVolume('dtm.tif');
        await flushPromises();
        expect(overlay()).toHaveLength(0);
        expect(pile.stockpileTitle.value).toBe('');
    });
});

describe('the base of a pile', () => {
    async function open() {
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    }
    async function detect() {
        await pile.autoDetectAndCalculate(9.0005, 45.0005);
        await flushPromises();
    }

    it('found by a click is the best-fit plane, shown in the panel and saved with the pile', async () => {
        await open();
        await detect();
        expect(measuredBases).toEqual(['best_fit']);
        expect(pile.stockpileBaseMethod.value).toBe('best_fit');
        expect(pile.stockpileResult.value).toMatchObject({ basePlaneMethod: 'best_fit', confidence: 0.8, estimatedFromDetection: 8.7 });
        expect(draft().get('basePlaneMethod')).toBe('best_fit');
    });

    it('of a drawn polygon is the lowest perimeter, also after a detected pile', async () => {
        await open();
        await detect();
        await pile.calculateStockpileVolume(POLYGON);
        await flushPromises();
        expect(measuredBases).toEqual(['best_fit', 'lowest_perimeter']);
        expect(pile.stockpileBaseMethod.value).toBe('lowest_perimeter');
        const piles = source.getFeatures().filter(f => f.get('measurementType') === 'stockpile');
        expect(piles.map(f => f.get('basePlaneMethod'))).toEqual(['best_fit', 'lowest_perimeter']);
    });

    it('picked by the user is the base of the piles found by a click, and of the drawn ones', async () => {
        await open();
        await pile.chooseStockpileBaseMethod('average_perimeter');
        await detect();
        await pile.calculateStockpileVolume(POLYGON);
        await flushPromises();
        expect(measuredBases).toEqual(['average_perimeter', 'average_perimeter']);
    });

    it('picked as the lowest perimeter is kept for a detected pile', async () => {
        await open();
        await pile.calculateStockpileVolume(POLYGON);
        await pile.chooseStockpileBaseMethod('best_fit');
        await pile.chooseStockpileBaseMethod('lowest_perimeter');
        await detect();
        expect(measuredBases.at(-1)).toBe('lowest_perimeter');
        expect(pile.stockpileBaseMethod.value).toBe('lowest_perimeter');
    });

    it('picked after the detection measures the pile again, in the panel and on the pile', async () => {
        netVolumeOf = { best_fit: 6.8, lowest_perimeter: 35.5 };
        await open();
        pile.stockpileMaterial.value = 'sand';
        await detect();
        expect(pile.stockpileResult.value.netVolume).toBe(6.8);
        const id = draft().get('id');
        await pile.chooseStockpileBaseMethod('lowest_perimeter');
        await flushPromises();
        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 35.5, basePlaneMethod: 'lowest_perimeter', confidence: 0.8 });
        // The same pile, weighed again from its new volume
        expect(source.getFeatures().filter(f => f.get('measurementType') === 'stockpile')).toHaveLength(1);
        expect(draft().getProperties()).toMatchObject({ id, netVolume: 35.5, basePlaneMethod: 'lowest_perimeter' });
        expect(draft().get('weightEstimate').tons).toBeCloseTo(35.5 * 1.6, 9);
    });

    it('picked after the pile was cleared measures nothing', async () => {
        await open();
        await detect();
        pile.clearStockpileOverlay();
        await pile.chooseStockpileBaseMethod('flat');
        expect(measuredBases).toEqual(['best_fit']);
        expect(pile.stockpileResult.value).toBeNull();
    });

    it('of a restored pile is the one it was saved with', async () => {
        savedFile = savedPile({ basePlaneMethod: 'average_perimeter' });
        await open();
        expect(pile.stockpileBaseMethod.value).toBe('average_perimeter');
        expect(measuredBases).toEqual([]);
    });
});

// FR-MAP-06, FR-XC-17, D-027: Click map and Draw run in the shared drawing session
describe('Click map and Draw (the shared drawing session)', () => {
    const key = (k, on = document.body) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const drawOf = () => olMap.value.getInteractions().getArray().find(i => i instanceof Draw);
    const rightClick = (x, y, upX = x, upY = y) => {
        const vp = olMap.value.getViewport();
        vp.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 2, bubbles: true }));
        vp.dispatchEvent(new MouseEvent('pointerup', { clientX: upX, clientY: upY, button: 2, bubbles: true }));
    };

    beforeEach(async () => {
        // No target: the map has no size and renders nothing, the interactions work all the same
        olMap.value = new OlMap({ view: new View({ center: [1000000, 5600000], zoom: 10 }) });
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        dataset.detectStockpile = vi.fn(async () => ({ polygon: POLYGON, confidence: 0.8, estimatedVolume: 8.7, basePlaneMethod: 'auto' }));
    });

    it('Click map: Space at the crosshair detects the pile at the centre of the view, and the mode ends', async () => {
        pile.startStockpileClickMode();
        expect(pile.stockpileMode.value).toBe('click');
        expect(drawOf()).toBeDefined();
        const [lon, lat] = toLonLat(olMap.value.getView().getCenter());
        key(' ');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(dataset.detectStockpile).toHaveBeenCalledTimes(1);
        const [path, calledLat, calledLon] = dataset.detectStockpile.mock.calls[0];
        expect(path).toBe('dsm.tif');
        expect(calledLon).toBeCloseTo(lon, 9);
        expect(calledLat).toBeCloseTo(lat, 9);
        expect(pile.stockpileMode.value).toBeNull();
        await vi.waitFor(() => expect(drawOf()).toBeUndefined());
    });

    it('Click map: Esc ends the mode and detects nothing', async () => {
        pile.startStockpileClickMode();
        key('Escape');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(pile.stockpileMode.value).toBeNull();
        expect(drawOf()).toBeUndefined();
        expect(dataset.detectStockpile).not.toHaveBeenCalled();
    });

    it('Click map: a second press of the button cancels it', () => {
        pile.startStockpileClickMode();
        pile.startStockpileClickMode();
        expect(pile.stockpileMode.value).toBeNull();
        expect(drawOf()).toBeUndefined();
    });

    it('locks the measurement toolbar once while a mode runs and gives it back once, also when Click map follows Draw', () => {
        pile.startStockpilePolygonDrawing();
        expect(toolbar.setToolsDisabled.mock.calls).toEqual([[true]]);
        pile.startStockpileClickMode();
        expect(toolbar.setToolsDisabled.mock.calls).toEqual([[true], [false], [true]]);
        key('Escape');
        expect(toolbar.setToolsDisabled.mock.calls).toEqual([[true], [false], [true], [false]]);
        expect(drawOf()).toBeUndefined();
    });

    it('Draw: Space adds the corners at the crosshair, Enter measures the polygon', async () => {
        const calculate = vi.spyOn(dataset, 'calculateStockpileVolume');
        pile.startStockpilePolygonDrawing();
        expect(pile.stockpileMode.value).toBe('draw');
        olMap.value.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        const view = olMap.value.getView();
        [[1000000, 5600000], [1000500, 5600000], [1000500, 5600500]].forEach(c => { view.setCenter(c); key(' '); });
        key('Enter');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(calculate).toHaveBeenCalledTimes(1);
        const ring = calculate.mock.calls[0][1].coordinates[0];
        expect(ring).toHaveLength(4);
        expect(ring[0]).toEqual(ring[3]);
        expect(pile.stockpileMode.value).toBeNull();
        expect(pile.stockpileResult.value).not.toBeNull();
    });

    it('Draw: Esc cancels the polygon: nothing is measured, the overlay is empty', async () => {
        const calculate = vi.spyOn(dataset, 'calculateStockpileVolume');
        pile.startStockpilePolygonDrawing();
        olMap.value.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        const view = olMap.value.getView();
        [[1000000, 5600000], [1000500, 5600000]].forEach(c => { view.setCenter(c); key(' '); });
        key('Escape');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(calculate).not.toHaveBeenCalled();
        expect(pile.stockpileMode.value).toBeNull();
        expect(drawOf()).toBeUndefined();
        expect(olMap.value.getLayers().getArray().flatMap(l => (l.getSource?.().getFeatures?.() ?? []))).toHaveLength(0);
    });

    it('Draw: a right click finishes the polygon, a 20 px right-drag does not', async () => {
        const calculate = vi.spyOn(dataset, 'calculateStockpileVolume');
        pile.startStockpilePolygonDrawing();
        olMap.value.getPixelFromCoordinate = c => [c[0] / 10, c[1] / 10];
        const view = olMap.value.getView();
        [[1000000, 5600000], [1000500, 5600000], [1000500, 5600500]].forEach(c => { view.setCenter(c); key(' '); });
        rightClick(10, 10, 30, 10);
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(calculate).not.toHaveBeenCalled();
        expect(pile.stockpileMode.value).toBe('draw');
        rightClick(10, 10, 12, 11);
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(calculate).toHaveBeenCalledTimes(1);
    });
});

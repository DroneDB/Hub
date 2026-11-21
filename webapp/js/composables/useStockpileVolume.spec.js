/**
 * The weight and the cost of a pile follow the material: a change of material, of the user's
 * materials or of a custom value weighs the pile again, both in the panel and on the pile the
 * toolbar saves. A restored pile keeps what it was weighed and priced with.
 *
 * The base of the volume: a pile found by a click is measured from the best-fit plane and a drawn
 * polygon from the lowest perimeter, until the user picks a base; a pick measures the chosen pile
 * again, and that pile only.
 *
 * The piles of "Find all piles": drawn before they are added, measured at most four at a time, added
 * to the measurements with Add; a pile that is on the map is chosen with a click and edited
 * (its base, its material, its outline) without the other piles being touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick, ref, shallowRef, defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Feature from 'ol/Feature';
import { Vector as VectorSource } from 'ol/source';
import GeoJSON from 'ol/format/GeoJSON';
import { useStockpileVolume } from './useStockpileVolume';
import { PREF, setPref, _resetPrefListenersForTests } from '@/libs/preferences';
import { formatDensity, formatVolume } from '@/libs/format';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Draw from 'ol/interaction/Draw';
import { toLonLat } from 'ol/proj';
import { LineString } from 'ol/geom';
import Collection from 'ol/Collection';
import { ModifyEvent } from 'ol/interaction/Modify';
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
// What each volume was asked for: the raster, the polygon and the options
let measureCalls;
// The measurements file the map shows, and the flash the composable says things with
let measurementsFile;
let flash;

/** @param {any} [controls]  the real measure control (default: one that does what the composable needs) */
function start(controls) {
    source = controls ? controls.source : new VectorSource();
    savedIds = new Set();
    const measureControls = controls || {
        source,
        // As the measure control does: one OL feature per GeoJSON feature, with its outline and its properties
        importFromGeoJSON(fc) {
            for (const f of fc.features) {
                const feature = new Feature(new GeoJSON().readGeometry(f.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
                feature.setProperties(f.properties);
                source.addFeature(feature);
            }
        },
        refreshButtons() {},
        setToolsDisabled: vi.fn(),
        // The layer of the measurements (what a click on a pile of the map is looked for in)
        vector: { measurements: true },
        // As the measure control does: in the saved file, whatever else changed on the map
        isSaved: id => savedIds.has(id),
        deleteMeasurement(feature) { source.removeFeature(feature); }
    };
    dataset = {
        calculateStockpileVolume: async (path, polygon, { baseMethod, flatElevation }) => {
            measuredBases.push(baseMethod);
            measureCalls.push({ path, polygon, baseMethod, flatElevation });
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
        map: olMap = shallowRef(null),
        measureControls: shallowRef(measureControls),
        currentUnitPref: unitPref = ref('metric'),
        deletedMeasurementIds: ref([]),
        measurementsPath: () => measurementsFile,
        showFlash: () => flash,
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
    measureCalls = [];
    measurementsFile = 'dsm_measurements.geojson';
    flash = vi.fn();
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
    /** A map (no target: it renders nothing) and the features of the overlay of the pile */
    function withMap() {
        olMap.value = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        return () => olMap.value.getLayers().getArray().flatMap(l => l.getSource().getFeatures());
    }
    /**
     * Each read of the measurements file waits until the test answers it, with a saved pile titled by the order of
     * the read. A read starts once the listing of the folder is asked (stockpileStorage), so `answer` lets the reads
     * started so far reach the file first.
     */
    function slowReads(dataset) {
        const reads = [];
        dataset.getFileContents = () => new Promise(resolve => {
            const n = reads.length;
            reads.push({ reply: () => resolve(JSON.stringify(savedPile({ title: `read ${n}` }))) });
        });
        return {
            async answer(n = 0) {
                await flushPromises();
                reads[n].reply();
            }
        };
    }

    it('is not shown when the panel opened on another raster before it was read', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        // The elevation model is switched while the pile of the DSM is still being read
        pile.closeStockpileVolume();
        pile.openStockpileVolume('dtm.tif');
        await reads.answer(0);
        await flushPromises();
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileDetectedPolygon.value).toBeNull();
        expect(overlay()).toHaveLength(0);
        // The pile of the DTM is shown when it is read
        await reads.answer(1);
        await flushPromises();
        expect(pile.stockpileTitle.value).toBe('read 1');
        expect(overlay()).toHaveLength(1);
    });

    it('is not shown once the panel closed', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        pile.closeStockpileVolume();
        await reads.answer();
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
        await reads.answer();
        await flushPromises();
        expect(pile.stockpileResult.value).toMatchObject({ confidence: 0.8 });
        expect(pile.stockpileTitle.value).toBe('North heap');
        expect(pile.stockpileBaseMethod.value).toBe('best_fit');
        expect(overlay()).toHaveLength(0);
    });

    it('does not replace a pile the user drew while it was read', async () => {
        const overlay = withMap();
        const reads = slowReads(dataset);
        pile.openStockpileVolume('dsm.tif');
        const drawn = pile.calculateStockpileVolume(POLYGON);
        await reads.answer();
        await drawn;
        await flushPromises();
        expect(pile.stockpileResult.value).toMatchObject({ basePlaneMethod: 'lowest_perimeter' });
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
        expect(pile.stockpileResult.value).toMatchObject({ basePlaneMethod: 'best_fit', confidence: 0.8 });
        expect(draft().get('basePlaneMethod')).toBe('best_fit');
    });

    it('is saved with the pile with the elevation model it was measured on and the flat elevation', async () => {
        await open();
        await detect();
        expect(draft().getProperties()).toMatchObject({ sourceRaster: 'dsm.tif', flatElevation: 0 });
        expect(pile.stockpileResult.value).toMatchObject({ sourceRaster: 'dsm.tif', flatElevation: 0 });
        // A drawn pile of another raster is saved with that one
        pile.openStockpileVolume('dtm.tif');
        await flushPromises();
        await pile.calculateStockpileVolume(POLYGON);
        await flushPromises();
        expect(source.getFeatures().at(-1).get('sourceRaster')).toBe('dtm.tif');
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

// FR-MAP-25: "Find all piles" lists the piles of the raster, and the user adopts one as the draft pile
describe('Find all piles (detect-all)', () => {
    const OTHER = { type: 'Polygon', coordinates: [[[9.01, 45.01], [9.011, 45.01], [9.011, 45.011], [9.01, 45.01]]] };
    const FOUND = {
        stockpiles: [
            { id: 0, polygon: POLYGON, estimatedVolume: 812.5, confidence: 0.91, baseElevation: 12, centroid: [9, 45], areaM2: 420, pixelCount: 90 },
            { id: 1, polygon: OTHER, estimatedVolume: 40, confidence: 0.55, baseElevation: 11, centroid: [9.01, 45.01], areaM2: 30, pixelCount: 7 }
        ],
        totalFound: 2, sensitivityUsed: 0.5, minAreaUsed: 5
    };
    /** `count` piles, each with a polygon of its own */
    const many = count => ({
        stockpiles: Array.from({ length: count }, (_, id) => ({
            id, polygon: { type: 'Polygon', coordinates: [[[9 + id * 0.01, 45], [9.001 + id * 0.01, 45], [9.001 + id * 0.01, 45.001], [9 + id * 0.01, 45]]] },
            estimatedVolume: 10, confidence: 0.5, areaM2: 100 - id, centroid: [9, 45], pixelCount: 5
        })),
        totalFound: count
    });

    async function open() {
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        dataset.detectAllStockpiles = vi.fn(async () => FOUND);
    }
    const piles = () => source.getFeatures().filter(f => f.get('measurementType') === 'stockpile');
    const find = async () => {
        await pile.findAllStockpiles();
        await flushPromises();
    };
    /** The list's rows, by position */
    const row = index => pile.stockpilePiles.value[index];
    /** A server whose volumes answer when the test says, with how many are in flight at once */
    function gatedVolumes() {
        const gate = { inFlight: 0, peak: 0, started: [], waiting: [] };
        dataset.calculateStockpileVolume = (path, polygon, { baseMethod }) => {
            gate.started.push(baseMethod);
            gate.inFlight++;
            gate.peak = Math.max(gate.peak, gate.inFlight);
            return new Promise(resolve => {
                gate.waiting.push(() => {
                    gate.inFlight--;
                    resolve({ ...VOLUME, cutVolume: baseMethod === 'best_fit' ? 1 : 2, netVolume: baseMethod === 'best_fit' ? 1 : 2, basePlaneMethod: baseMethod });
                });
            });
        };
        /** Answer every call that is in flight, and whatever it lets start, until none is left */
        gate.releaseAll = async () => {
            for (let i = 0; i < 50; i++) {
                await flushPromises();
                if (!gate.waiting.length) break;
                gate.waiting.splice(0).forEach(release => release());
            }
        };
        return gate;
    }

    it('asks for the piles of the raster with the sensitivity of the panel, and lists them as they come', async () => {
        await open();
        pile.stockpileSensitivity.value = 0.8;

        await find();

        expect(dataset.detectAllStockpiles).toHaveBeenCalledWith('dsm.tif', { sensitivity: 0.8 });
        expect(pile.stockpilePiles.value.map(p => p.id)).toEqual([0, 1]);
        expect(pile.stockpilePilesLoading.value).toBe(false);
        expect(pile.stockpilePilesError.value).toBeNull();
        // Listing is not adding: no measurement on the map
        expect(piles()).toHaveLength(0);
    });

    it('lists no piles for a raster without any, which is not an error', async () => {
        await open();
        dataset.detectAllStockpiles = vi.fn(async () => ({ stockpiles: [], totalFound: 0 }));
        await pile.findAllStockpiles();
        expect(pile.stockpilePiles.value).toEqual([]);
        expect(pile.stockpilePilesError.value).toBeNull();
    });

    it('says so when the search fails, with no list', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        await open();
        dataset.detectAllStockpiles = vi.fn(async () => { throw new Error('boom'); });
        await pile.findAllStockpiles();
        expect(pile.stockpilePiles.value).toBeNull();
        expect(pile.stockpilePilesError.value).toBe('Could not find the piles of this raster. Try again, or adjust the sensitivity.');
        expect(pile.stockpilePilesLoading.value).toBe(false);
        error.mockRestore();
    });

    it('forgets the list when the panel closes, on Clear, and on another raster; an overtaken search is not shown', async () => {
        await open();
        await pile.findAllStockpiles();
        pile.clearStockpileOverlay();
        expect(pile.stockpilePiles.value).toBeNull();

        await pile.findAllStockpiles();
        pile.closeStockpileVolume();
        expect(pile.stockpilePiles.value).toBeNull();

        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        let release;
        dataset.detectAllStockpiles = vi.fn(() => new Promise(resolve => { release = () => resolve(FOUND); }));
        const searching = pile.findAllStockpiles();
        expect(pile.stockpilePilesLoading.value).toBe(true);
        pile.openStockpileVolume('other.tif');
        release();
        await searching;
        expect(pile.stockpilePiles.value).toBeNull();
        expect(pile.stockpilePilesLoading.value).toBe(false);
    });

    describe('the volume of each pile', () => {
        it('is measured for every pile of the list from the base of a detected pile, and kept on its row', async () => {
            netVolumeOf = { best_fit: 44.14 };
            await open();
            await find();

            expect(measureCalls.map(c => [c.path, c.baseMethod, c.flatElevation])).toEqual([['dsm.tif', 'best_fit', 0], ['dsm.tif', 'best_fit', 0]]);
            expect(measureCalls.map(c => c.polygon)).toEqual([POLYGON, OTHER]);
            expect(pile.stockpilePiles.value.map(p => p.measureState)).toEqual(['done', 'done']);
            expect(row(0).measured).toMatchObject({ netVolume: 44.14, basePlaneMethod: 'best_fit', sourceRaster: 'dsm.tif' });
            expect(pile.stockpilePilesBase.value).toBe('best_fit');
        });

        it('shows a row as measuring until its volume comes', async () => {
            await open();
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();
            expect(pile.stockpilePiles.value.map(p => p.measureState)).toEqual(['measuring', 'measuring']);

            gate.waiting[0]();
            await flushPromises();
            expect(pile.stockpilePiles.value.map(p => p.measureState)).toEqual(['done', 'measuring']);
            gate.waiting[1]();
            await finding;
            expect(pile.stockpilePiles.value.map(p => p.measureState)).toEqual(['done', 'done']);
        });

        it('shows a row that cannot be measured as failed, with no volume', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await open();
            dataset.calculateStockpileVolume = async () => { throw new Error('Cannot calculate volume'); };
            await find();
            expect(pile.stockpilePiles.value.map(p => p.measureState)).toEqual(['failed', 'failed']);
            expect(pile.stockpilePiles.value.every(p => p.measured === null)).toBe(true);
            warn.mockRestore();
        });

        it('has at most four calls in flight at once, however many piles there are, and measures them all', async () => {
            await open();
            dataset.detectAllStockpiles = vi.fn(async () => many(10));
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();
            expect(gate.inFlight).toBe(4);

            await gate.releaseAll();
            await finding;
            expect(gate.peak).toBe(4);
            expect(gate.started).toHaveLength(10);
            expect(pile.stockpilePiles.value.every(p => p.measureState === 'done')).toBe(true);
        });

        it('are measured again when the base is picked with no pile on the map chosen, from that base', async () => {
            await open();
            await find();
            measureCalls.length = 0;
            netVolumeOf = { average_perimeter: 7 };

            await pile.chooseStockpileBaseMethod('average_perimeter');
            await flushPromises();

            expect(measureCalls.map(c => c.baseMethod)).toEqual(['average_perimeter', 'average_perimeter']);
            expect(pile.stockpilePilesBase.value).toBe('average_perimeter');
            expect(pile.stockpileBaseMethod.value).toBe('average_perimeter');
            expect(pile.stockpilePiles.value.map(p => p.measured.netVolume)).toEqual([7, 7]);
            // ... and it is the base of the piles measured from now on
            await pile.autoDetectAndCalculate(9, 45);
            expect(measureCalls.at(-1).baseMethod).toBe('average_perimeter');
        });

        it('drop the answers of an earlier measuring when the base is picked meanwhile, and start no more of its piles', async () => {
            await open();
            dataset.detectAllStockpiles = vi.fn(async () => many(10));
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();
            expect(gate.started).toEqual(['best_fit', 'best_fit', 'best_fit', 'best_fit']);

            // The base is picked while four volumes of the first measuring are in flight
            const picking = pile.chooseStockpileBaseMethod('average_perimeter');
            await flushPromises();
            await gate.releaseAll();
            await picking;
            await finding;

            // The first measuring asked for its four and no more; the second for all ten, and only its answers are on the rows
            expect(gate.started.filter(base => base === 'best_fit')).toHaveLength(4);
            expect(gate.started.filter(base => base === 'average_perimeter')).toHaveLength(10);
            expect(pile.stockpilePiles.value.map(p => p.measured.basePlaneMethod)).toEqual(Array(10).fill('average_perimeter'));
            expect(pile.stockpilePiles.value.map(p => p.measured.netVolume)).toEqual(Array(10).fill(2));
        });

        it('drop the answers that come after Clear, a new list or the end of the panel', async () => {
            await open();
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();
            const stale = pile.stockpilePiles.value;

            pile.clearStockpileOverlay();
            await gate.releaseAll();
            await finding;

            expect(pile.stockpilePiles.value).toBeNull();
            // The rows of the list that was dropped did not take the answers
            expect(stale.every(p => p.measured === null)).toBe(true);

            // A list found again, closed while measured: nothing is shown on the next open
            const again = gatedVolumes();
            const second = pile.findAllStockpiles();
            await flushPromises();
            pile.closeStockpileVolume();
            await again.releaseAll();
            await second;
            expect(pile.stockpilePiles.value).toBeNull();
            expect(again.started).toHaveLength(2);
        });
    });

    describe('choosing a pile of the list', () => {
        it('shows it in the Result with the volume of its row, and adds nothing to the measurements', async () => {
            netVolumeOf = { best_fit: 44.14 };
            await open();
            await find();
            measureCalls.length = 0;

            pile.chooseStockpilePile(row(1));

            // The volume of the row, not a second request
            expect(measureCalls).toEqual([]);
            expect(pile.stockpileChosenPile.value).toBe(1);
            expect(pile.stockpileResult.value).toMatchObject({ netVolume: 44.14, confidence: 0.55, basePlaneMethod: 'best_fit', sourceRaster: 'dsm.tif' });
            expect(pile.stockpileDetectedPolygon.value).toEqual(OTHER);
            expect(pile.stockpileBaseMethod.value).toBe('best_fit');
            expect(pile.stockpileChosenName.value).toBe('Pile 2');
            expect(piles()).toHaveLength(0);
            expect(pile.stockpileCanEditOutline.value).toBe(false);
        });

        it('weighs it with the material of the panel, and again when the material changes', async () => {
            await open();
            await find();
            pile.chooseStockpilePile(row(0));
            pile.stockpileMaterial.value = 'gravel';
            await flushPromises();
            expect(pile.stockpileResult.value.weightEstimate).toEqual({ tons: 168, basedOn: 'cutVolume' });
            pile.stockpileMaterial.value = 'sand';
            await flushPromises();
            expect(pile.stockpileResult.value.weightEstimate.tons).toBe(160);
        });

        it('shows the volume of a pile chosen before it was measured as soon as it comes', async () => {
            await open();
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();

            pile.chooseStockpilePile(row(0));
            expect(pile.stockpileResult.value).toBeNull();
            gate.waiting[0]();
            await flushPromises();
            expect(pile.stockpileResult.value).toMatchObject({ netVolume: 1, basePlaneMethod: 'best_fit' });
            gate.waiting.splice(0).forEach(release => release());
            await finding;
        });

        it('says why when the pile of the row could not be measured, and keeps the list', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await open();
            dataset.calculateStockpileVolume = async () => { throw new Error('Cannot calculate volume'); };
            await find();

            pile.chooseStockpilePile(row(0));

            expect(pile.stockpileError.value).toMatch(/Cannot calculate the volume of this pile/);
            expect(pile.stockpileResult.value).toBeNull();
            expect(pile.stockpilePiles.value).toHaveLength(2);
            warn.mockRestore();
        });

        it('takes the place of a pile found by a click: no pile of the map is chosen any more', async () => {
            await open();
            await find();
            await pile.autoDetectAndCalculate(9, 45);
            await flushPromises();
            expect(pile.stockpileCanEditOutline.value).toBe(true);

            pile.chooseStockpilePile(row(0));

            expect(pile.stockpileCanEditOutline.value).toBe(false);
            expect(pile.stockpileChosenPile.value).toBe(0);
            // The pile of the click stays on the map
            expect(piles()).toHaveLength(1);
        });
    });

    describe('adding piles of the list to the measurements', () => {
        it('adds each pile with its measured volume, the base, the model and the material of the panel', async () => {
            netVolumeOf = { best_fit: 44.14 };
            await open();
            pile.stockpileMaterial.value = 'gravel';
            await find();
            measureCalls.length = 0;

            expect(pile.addStockpilePiles([row(0), row(1)])).toBe(2);

            expect(measureCalls).toEqual([]);
            expect(piles()).toHaveLength(2);
            expect(piles()[0].getProperties()).toMatchObject({
                netVolume: 44.14, basePlaneMethod: 'best_fit', sourceRaster: 'dsm.tif', flatElevation: 0, confidence: 0.91,
                material: 'gravel', materialName: 'Gravel'
            });
            expect(piles()[0].get('weightEstimate').tons).toBeCloseTo(44.14 * 1.68, 9);
            expect(piles()[1].get('confidence')).toBe(0.55);
            expect(piles()[0].get('tooltipText')).toContain('Gravel');
        });

        it('adds a pile once: Add selected, then Add all, leave one measurement for each pile', async () => {
            await open();
            await find();
            expect(pile.addStockpilePiles([row(0)])).toBe(1);
            // Add all: every pile of the list, the added one among them
            expect(pile.addStockpilePiles(pile.stockpilePiles.value)).toBe(1);
            expect(pile.addStockpilePiles(pile.stockpilePiles.value)).toBe(0);
            // The same pile twice in one call
            expect(pile.addStockpilePiles([row(0), row(0)])).toBe(0);

            expect(piles()).toHaveLength(2);
            expect(Object.keys(pile.stockpileAddedPiles.value)).toEqual(['0', '1']);
        });

        it('a pile found again that is a measurement on the map already (saved, then the page opened again) is shown as added and not added twice', async () => {
            await open();
            await find();
            pile.addStockpilePiles(pile.stockpilePiles.value);
            const ids = piles().map(f => f.get('id'));
            // Another search of the same raster: a new list, which knows nothing of what this one added
            await find();
            expect(Object.values(pile.stockpileAddedPiles.value).sort()).toEqual([...ids].sort());
            expect(pile.addStockpilePiles(pile.stockpilePiles.value)).toBe(0);
            expect(piles()).toHaveLength(2);
        });

        it('a measurement of another raster with the same outline is not the pile of this list', async () => {
            await open();
            await find();
            pile.addStockpilePiles([row(0)]);
            piles()[0].set('sourceRaster', 'dtm.tif');
            await find();
            expect(pile.stockpileAddedPiles.value).toEqual({});
            expect(pile.addStockpilePiles([row(0)])).toBe(1);
        });

        it('leaves out a pile that has no volume yet', async () => {
            await open();
            const gate = gatedVolumes();
            const finding = pile.findAllStockpiles();
            await flushPromises();
            gate.waiting[0]();
            await flushPromises();

            expect(pile.addStockpilePiles(pile.stockpilePiles.value)).toBe(1);
            expect(Object.keys(pile.stockpileAddedPiles.value)).toEqual(['0']);
            gate.waiting.splice(0).forEach(release => release());
            await finding;
        });

        it('gives the title and the description of the panel to the chosen pile only, and the chosen pile becomes the measurement', async () => {
            await open();
            await find();
            pile.chooseStockpilePile(row(1));
            pile.stockpileTitle.value = 'East pile';
            pile.stockpileDescription.value = 'Next to the gate';
            await flushPromises();

            pile.addStockpilePiles([row(0), row(1)]);

            const [first, second] = piles();
            expect(first.get('title')).toBeUndefined();
            expect(second.getProperties()).toMatchObject({ title: 'East pile', description: 'Next to the gate' });
            // The panel works on the measurement of the chosen pile from now on: its fields are written to it
            expect(pile.stockpileCanEditOutline.value).toBe(true);
            pile.stockpileTitle.value = 'East heap';
            await flushPromises();
            expect(second.get('title')).toBe('East heap');
            expect(first.get('title')).toBeUndefined();
        });

        it('gives the row its check mark until the measurement is deleted: then the pile can be added again', async () => {
            await open();
            await find();
            pile.addStockpilePiles([row(0)]);
            const added = piles()[0];
            expect(pile.stockpileAddedPiles.value).toEqual({ 0: added.get('id') });

            // The eraser, the dialog of the properties and the list of the measurements remove it from the source
            source.removeFeature(added);
            pile.onStockpileFeatureRemoved(added);

            expect(pile.stockpileAddedPiles.value).toEqual({});
            expect(pile.addStockpilePiles([row(0)])).toBe(1);
            expect(piles()).toHaveLength(1);
            expect(piles()[0]).not.toBe(added);
        });

        it('adds a pile again that is no longer on the map even when the removal was not told', async () => {
            await open();
            await find();
            pile.addStockpilePiles([row(0)]);
            source.removeFeature(piles()[0]);

            expect(pile.addStockpilePiles([row(0)])).toBe(1);
            expect(piles()).toHaveLength(1);
        });

        it('keeps what was added when a new search lists the piles again: the row of the added pile is linked to it, no new measurement', async () => {
            await open();
            await find();
            pile.addStockpilePiles([row(0)]);
            const id = piles()[0].get('id');
            await find();
            expect(pile.stockpileAddedPiles.value).toEqual({ 0: id });
            expect(piles()).toHaveLength(1);
        });
    });

    describe('the piles on the map', () => {
        /** The features of the preview layer of the found piles (its zIndex tells it from the others) */
        const previewFeatures = () => {
            const layer = olMap.value.getLayers().getArray().find(l => l.getZIndex() === 1500);
            return layer ? layer.getSource().getFeatures() : [];
        };

        beforeEach(async () => {
            olMap.value = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
            await open();
        });

        it('draws every found pile with the number of its row, before any is added', async () => {
            await find();
            expect(previewFeatures().map(f => [f.get('pileId'), f.get('rank')])).toEqual([[0, 1], [1, 2]]);
            expect(piles()).toHaveLength(0);
        });

        it('takes them off the map on Clear, a new search, another raster and the end of the panel', async () => {
            await find();
            pile.clearStockpileOverlay();
            expect(previewFeatures()).toHaveLength(0);

            await find();
            expect(previewFeatures()).toHaveLength(2);
            dataset.detectAllStockpiles = vi.fn(async () => ({ stockpiles: [FOUND.stockpiles[0]], totalFound: 1 }));
            await find();
            expect(previewFeatures()).toHaveLength(1);

            pile.openStockpileVolume('other.tif');
            expect(previewFeatures()).toHaveLength(0);

            dataset.detectAllStockpiles = vi.fn(async () => FOUND);
            await find();
            pile.closeStockpileVolume();
            expect(previewFeatures()).toHaveLength(0);
        });
    });
});

describe('an answer that comes after the panel moved on', () => {
    const piles = () => source.getFeatures().filter(f => f.get('measurementType') === 'stockpile');
    /** A call of the server that answers when the test says */
    const deferred = () => {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        return { promise, resolve };
    };
    const FOUND = { polygon: POLYGON, confidence: 0.8, estimatedVolume: 8.7 };

    beforeEach(async () => {
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    });

    it('is dropped after Clear: no pile is drawn, there is no result, and the panel is not left loading', async () => {
        const detection = deferred();
        dataset.detectStockpile = vi.fn(() => detection.promise);
        const detecting = pile.autoDetectAndCalculate(9, 45);
        expect(pile.stockpileLoading.value).toBe(true);

        pile.clearStockpileOverlay();
        expect(pile.stockpileLoading.value).toBe(false);
        detection.resolve(FOUND);
        await detecting;
        await flushPromises();

        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileDetectedPolygon.value).toBeNull();
        expect(measuredBases).toEqual([]);
        expect(pile.stockpileLoading.value).toBe(false);
    });

    it('does not end the loading of the pile that was asked for since', async () => {
        const first = deferred();
        const second = deferred();
        dataset.detectStockpile = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const detecting = pile.autoDetectAndCalculate(9, 45);
        pile.clearStockpileOverlay();
        const next = pile.autoDetectAndCalculate(9.5, 45.5);

        first.resolve(FOUND);
        await detecting;
        await flushPromises();
        // The first answer is not the one the panel waits for
        expect(pile.stockpileLoading.value).toBe(true);
        expect(pile.stockpileResult.value).toBeNull();

        second.resolve(FOUND);
        await next;
        await flushPromises();
        expect(pile.stockpileLoading.value).toBe(false);
        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 100 });
        expect(piles()).toHaveLength(1);
    });

    it('is dropped when the volume of a detected pile comes after Clear', async () => {
        const volume = deferred();
        dataset.calculateStockpileVolume = vi.fn(() => volume.promise);
        const detecting = pile.autoDetectAndCalculate(9, 45);
        await flushPromises();

        pile.clearStockpileOverlay();
        volume.resolve({ ...VOLUME, basePlaneMethod: 'best_fit' });
        await detecting;
        await flushPromises();

        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
    });

    it('is not adopted into another raster that was opened meanwhile, and the volume is asked for the raster it was found on', async () => {
        const detection = deferred();
        dataset.detectStockpile = vi.fn(() => detection.promise);
        const calculated = [];
        const calculate = dataset.calculateStockpileVolume;
        dataset.calculateStockpileVolume = vi.fn((path, ...rest) => { calculated.push(path); return calculate(path, ...rest); });
        const detecting = pile.autoDetectAndCalculate(9, 45);

        pile.openStockpileVolume('other.tif');
        await flushPromises();
        detection.resolve(FOUND);
        await detecting;
        await flushPromises();

        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileDetectedPolygon.value).toBeNull();
        expect(calculated).toEqual([]);
    });

    it('asks for the volume of a drawn polygon on the raster it was drawn on, and drops the answer after another raster opens', async () => {
        const volume = deferred();
        const calculated = [];
        dataset.calculateStockpileVolume = vi.fn((path) => { calculated.push(path); return volume.promise; });
        const calculating = pile.calculateStockpileVolume(POLYGON);

        pile.openStockpileVolume('other.tif');
        await flushPromises();
        volume.resolve({ ...VOLUME, basePlaneMethod: 'lowest_perimeter' });
        await calculating;
        await flushPromises();

        expect(calculated).toEqual(['dsm.tif']);
        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileLoading.value).toBe(false);
    });

    it('drops the failure of a call too, which says nothing of the panel now', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const detection = deferred();
        dataset.detectStockpile = vi.fn(() => detection.promise);
        const detecting = pile.autoDetectAndCalculate(9, 45);
        pile.clearStockpileOverlay();

        detection.resolve(Promise.reject(new Error('No stockpile found')));
        await detecting;
        await flushPromises();

        expect(pile.stockpileError.value).toBeNull();
        error.mockRestore();
    });

    it('does not show the volume of a pile of the list that comes after Clear', async () => {
        dataset.detectAllStockpiles = vi.fn(async () => ({ stockpiles: [{ id: 0, polygon: POLYGON, estimatedVolume: 8, confidence: 0.9 }] }));
        const volume = deferred();
        dataset.calculateStockpileVolume = vi.fn(() => volume.promise);
        const finding = pile.findAllStockpiles();
        await flushPromises();
        pile.chooseStockpilePile(pile.stockpilePiles.value[0]);

        pile.clearStockpileOverlay();
        volume.resolve({ ...VOLUME, basePlaneMethod: 'best_fit' });
        await finding;
        await flushPromises();

        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpilePiles.value).toBeNull();
        expect(pile.stockpileLoading.value).toBe(false);
    });

    it('is dropped after Close, and the panel opens again without a spinner', async () => {
        const detection = deferred();
        dataset.detectStockpile = vi.fn(() => detection.promise);
        const detecting = pile.autoDetectAndCalculate(9, 45);

        pile.closeStockpileVolume();
        detection.resolve(FOUND);
        await detecting;
        await flushPromises();
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();

        expect(piles()).toHaveLength(0);
        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileLoading.value).toBe(false);
    });
});

describe('the drawing mode when the component goes away', () => {
    it('Click map ends with the component that has the panel: no interaction and no lock is left', () => {
        const map = new OlMap({ view: new View({ center: [1000000, 5600000], zoom: 10 }) });
        let hosted;
        const wrapper = mount(defineComponent({
            setup() {
                hosted = useStockpileVolume({
                    dataset: () => dataset, map: ref(map), measureControls: shallowRef(toolbar), currentUnitPref: ref('metric'),
                    deletedMeasurementIds: ref([]), rasterFilePath: ref(''), getMapCenterLatLon: () => () => null
                });
                return () => h('div');
            }
        }));
        const drawn = () => map.getInteractions().getArray().some(i => i instanceof Draw);
        toolbar.setToolsDisabled.mockClear();
        hosted.startStockpileClickMode();
        expect(drawn()).toBe(true);

        wrapper.unmount();

        expect(drawn()).toBe(false);
        expect(hosted.stockpileMode.value).toBeNull();
        expect(toolbar.setToolsDisabled.mock.calls).toEqual([[true], [false]]);
    });
});

/** A pile of the measurements layer, as the measure control holds it after an import or a save */
let pileSeq = 0;
function addPile(properties = {}, layerSource = source) {
    const feature = new Feature(new GeoJSON().readGeometry(POLYGON, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
    feature.setProperties({
        id: `pile-${++pileSeq}`, measurementType: 'stockpile', ...VOLUME, confidence: 0.7,
        basePlaneMethod: 'lowest_perimeter', flatElevation: 0, sourceRaster: 'dsm.tif', ...properties
    });
    layerSource.addFeature(feature);
    return feature;
}
const pilesOnMap = () => source.getFeatures().filter(f => f.get('measurementType') === 'stockpile');
const propertiesOf = feature => JSON.parse(JSON.stringify({ ...feature.getProperties(), geometry: undefined }));

describe('choosing a pile that is on the map', () => {
    beforeEach(async () => {
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    });

    it('shows its volumes, its base, its material and its identification, and the panel works on it', async () => {
        const feature = addPile({
            title: 'North pile', description: 'By the gate', material: 'gravel', materialName: 'Gravel', materialDensity: 1.68,
            costPerTon: 15, currency: 'USD', basePlaneMethod: 'average_perimeter', flatElevation: 3, netVolume: 80,
            weightEstimate: { tons: 134.4, basedOn: 'cutVolume' }
        });

        pile.selectStockpileFeature(feature);
        await flushPromises();

        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 80, basePlaneMethod: 'average_perimeter', sourceRaster: 'dsm.tif', flatElevation: 3 });
        expect(pile.stockpileBaseMethod.value).toBe('average_perimeter');
        expect(pile.stockpileFlatElevation.value).toBe(3);
        expect(pile.stockpileMaterial.value).toBe('gravel');
        expect(pile.stockpileTitle.value).toBe('North pile');
        expect(pile.stockpileDescription.value).toBe('By the gate');
        expect(pile.stockpileChosenName.value).toBe('North pile');
        expect(pile.stockpileCanEditOutline.value).toBe(true);
        expect(pile.stockpileDetectedPolygon.value.type).toBe('Polygon');
        expect(pile.stockpileDetectedPolygon.value.coordinates[0][1][0]).toBeCloseTo(9.001, 6);
    });

    it('writes nothing to it: a pile selected is not made unsaved, whatever its material', async () => {
        // No unit system recorded, a material that is not the user's, and one that is no longer offered: what the
        // fields of the panel would write over the pile if they were let to
        const gone = addPile({ material: 'u-gone', materialName: 'Their ballast', materialDensity: 1.8, costPerTon: 22, currency: 'GBP', weightEstimate: { tons: 180, basedOn: 'cutVolume' }, costEstimate: { amount: 3960, currency: 'GBP' } });
        const none = addPile({ title: 'Plain pile' });
        const hidden = addPile({ material: 'snow', materialDensity: 0.5, costPerTon: 1, currency: 'USD' });
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { snow: { hidden: true } } });
        await flushPromises();
        const before = [gone, none, hidden].map(propertiesOf);

        for (const feature of [gone, none, hidden, gone]) {
            pile.selectStockpileFeature(feature);
            await flushPromises();
        }

        expect([gone, none, hidden].map(propertiesOf)).toEqual(before);
    });

    it('is shown without a material when it has none, and does not keep the material of the pile before it', async () => {
        const gravel = addPile({ material: 'gravel', materialName: 'Gravel', materialDensity: 1.68, costPerTon: 15, currency: 'USD' });
        const plain = addPile();
        pile.selectStockpileFeature(gravel);
        await flushPromises();
        expect(pile.stockpileMaterial.value).toBe('gravel');

        pile.selectStockpileFeature(plain);
        await flushPromises();
        expect(pile.stockpileMaterial.value).toBeNull();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileChosenName.value).toBe('Untitled pile');
    });

    it('says the elevation model it was measured on when that is not the one of the panel', async () => {
        const feature = addPile({ sourceRaster: 'site/dtm.tif' });
        expect(pile.stockpileMeasuredOn.value).toBeNull();
        pile.selectStockpileFeature(feature);
        await flushPromises();
        expect(pile.stockpileMeasuredOn.value).toBe('site/dtm.tif');
        pile.selectStockpileFeature(addPile({ sourceRaster: 'dsm.tif' }));
        await flushPromises();
        expect(pile.stockpileMeasuredOn.value).toBeNull();
    });

    it('changes the title, the description and the material of that pile only', async () => {
        const first = addPile({ title: 'First' });
        const second = addPile({ title: 'Second' });
        pile.selectStockpileFeature(first);
        await flushPromises();

        pile.stockpileTitle.value = 'First, renamed';
        pile.stockpileDescription.value = 'Moved';
        pile.stockpileMaterial.value = 'sand';
        await flushPromises();

        expect(first.getProperties()).toMatchObject({ title: 'First, renamed', name: 'First, renamed', description: 'Moved', material: 'sand', materialName: 'Sand' });
        expect(first.get('weightEstimate').tons).toBeCloseTo(100 * 1.6, 9);
        expect(propertiesOf(second)).toMatchObject({ title: 'Second' });
        expect(second.get('material')).toBeUndefined();
        // A material is a weight and a cost: nothing was measured again
        expect(measureCalls).toEqual([]);
    });

    it('chooses the row of the list that the pile was added from', async () => {
        dataset.detectAllStockpiles = vi.fn(async () => ({
            stockpiles: [{ id: 4, polygon: POLYGON, estimatedVolume: 1, confidence: 0.9, areaM2: 5 }], totalFound: 1
        }));
        await pile.findAllStockpiles();
        await flushPromises();
        pile.addStockpilePiles(pile.stockpilePiles.value);
        expect(pile.stockpileChosenPile.value).toBeNull();

        pile.selectStockpileFeature(pilesOnMap()[0]);

        expect(pile.stockpileChosenPile.value).toBe(4);
        // ... and a pile of the map that is not of the list leaves no row chosen
        pile.selectStockpileFeature(addPile());
        expect(pile.stockpileChosenPile.value).toBeNull();
    });

    it('ignores what is not a pile, and ends a measuring that was in flight for the panel', async () => {
        pile.selectStockpileFeature(new Feature({ measurementType: 'length' }));
        pile.selectStockpileFeature(null);
        expect(pile.stockpileResult.value).toBeNull();

        const detection = new Promise(() => {});
        dataset.detectStockpile = vi.fn(() => detection);
        pile.autoDetectAndCalculate(9, 45);
        await flushPromises();
        expect(pile.stockpileLoading.value).toBe(true);

        pile.selectStockpileFeature(addPile({ title: 'Mine' }));
        expect(pile.stockpileLoading.value).toBe(false);
        expect(pile.stockpileTitle.value).toBe('Mine');
    });

    it('is forgotten when its feature is deleted from the map: the panel shows nothing of it', async () => {
        const feature = addPile({ title: 'Doomed' });
        pile.selectStockpileFeature(feature);
        await flushPromises();
        source.removeFeature(feature);
        pile.onStockpileFeatureRemoved(feature);

        expect(pile.stockpileResult.value).toBeNull();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileCanEditOutline.value).toBe(false);
    });
});

describe('the base of a pile on the map', () => {
    beforeEach(async () => {
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    });

    it('is measured again from the new base on the elevation model of the pile, not the one of the panel', async () => {
        netVolumeOf = { flat: 55.5 };
        const feature = addPile({ sourceRaster: 'site/dtm.tif', material: 'gravel', materialName: 'Gravel', materialDensity: 1.68, costPerTon: 15, currency: 'USD' });
        pile.selectStockpileFeature(feature);
        await flushPromises();

        await pile.chooseStockpileBaseMethod('flat');
        await flushPromises();

        expect(measureCalls).toHaveLength(1);
        expect(measureCalls[0]).toMatchObject({ path: 'site/dtm.tif', baseMethod: 'flat', flatElevation: 0 });
        expect(feature.getProperties()).toMatchObject({ basePlaneMethod: 'flat', netVolume: 55.5, sourceRaster: 'site/dtm.tif' });
        expect(feature.get('weightEstimate').tons).toBeCloseTo(55.5 * 1.68, 9);
        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 55.5, basePlaneMethod: 'flat', sourceRaster: 'site/dtm.tif' });
        expect(pile.stockpileBaseMethod.value).toBe('flat');
        expect(pile.stockpileLoading.value).toBe(false);
    });

    it('is that pile\'s only: the other piles and the base of the piles to come stay as they were', async () => {
        const other = addPile({ title: 'Other' });
        const feature = addPile();
        pile.selectStockpileFeature(feature);
        await flushPromises();
        const before = propertiesOf(other);

        await pile.chooseStockpileBaseMethod('average_perimeter');
        await flushPromises();

        expect(propertiesOf(other)).toEqual(before);
        expect(feature.get('basePlaneMethod')).toBe('average_perimeter');
        // A pile found next is measured as before: the best-fit plane
        measureCalls.length = 0;
        await pile.autoDetectAndCalculate(9, 45);
        await flushPromises();
        expect(measureCalls.map(c => c.baseMethod)).toEqual(['best_fit']);
    });

    it('does not measure the list of "Find all piles" again', async () => {
        dataset.detectAllStockpiles = vi.fn(async () => ({
            stockpiles: [{ id: 0, polygon: POLYGON, estimatedVolume: 1, confidence: 0.9, areaM2: 5 }], totalFound: 1
        }));
        await pile.findAllStockpiles();
        await flushPromises();
        pile.selectStockpileFeature(addPile());
        measureCalls.length = 0;

        await pile.chooseStockpileBaseMethod('average_perimeter');
        await flushPromises();

        expect(measureCalls).toHaveLength(1);
        expect(pile.stockpilePilesBase.value).toBe('best_fit');
        expect(pile.stockpilePiles.value[0].measured.basePlaneMethod).toBe('best_fit');
    });

    it('is measured on the elevation model its file records when the pile was saved before the model was', async () => {
        const feature = addPile({ id: 'p1', sourceRaster: undefined });
        feature.unset('sourceRaster');
        savedFile = {
            ...savedPile({}),
            metadata: { version: '2.0', application: 'DroneDB Registry', views: { map: { orthophotoFile: 'site/dsm.tif' } } }
        };
        pile.openStockpileVolume('site/dtm.tif');
        await flushPromises();
        // The pile of the file is the one on the map: it is the chosen one, on the model of its file
        expect(pile.stockpileCanEditOutline.value).toBe(true);
        expect(pile.stockpileResult.value.sourceRaster).toBe('site/dsm.tif');
        expect(pile.stockpileMeasuredOn.value).toBe('site/dsm.tif');
        expect(feature.get('sourceRaster')).toBeUndefined();

        await pile.chooseStockpileBaseMethod('average_perimeter');
        await flushPromises();

        expect(measureCalls.at(-1)).toMatchObject({ path: 'site/dsm.tif', baseMethod: 'average_perimeter' });
        expect(feature.get('sourceRaster')).toBe('site/dsm.tif');
    });

    it('keeps the volumes and the base of the pile, and says why, when the new base cannot be measured', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const feature = addPile({ netVolume: 80 });
        pile.selectStockpileFeature(feature);
        await flushPromises();
        dataset.calculateStockpileVolume = async () => { throw new Error('Cannot calculate volume'); };

        await pile.chooseStockpileBaseMethod('best_fit');
        await flushPromises();

        expect(feature.getProperties()).toMatchObject({ basePlaneMethod: 'lowest_perimeter', netVolume: 80 });
        expect(pile.stockpileBaseMethod.value).toBe('lowest_perimeter');
        expect(pile.stockpileError.value).toMatch(/Cannot calculate volume for this area/);
        expect(pile.stockpileLoading.value).toBe(false);
        error.mockRestore();
    });

    it('takes the flat elevation typed for a flat base, and keeps it for the others without measuring', async () => {
        const feature = addPile();
        pile.selectStockpileFeature(feature);
        await flushPromises();

        await pile.chooseStockpileFlatElevation(12.5);
        expect(pile.stockpileFlatElevation.value).toBe(12.5);
        expect(measureCalls).toEqual([]);

        await pile.chooseStockpileBaseMethod('flat');
        await flushPromises();
        expect(measureCalls.at(-1)).toMatchObject({ baseMethod: 'flat', flatElevation: 12.5 });
        expect(feature.get('flatElevation')).toBe(12.5);

        await pile.chooseStockpileFlatElevation(20);
        await flushPromises();
        expect(measureCalls.at(-1)).toMatchObject({ baseMethod: 'flat', flatElevation: 20 });
        expect(feature.get('flatElevation')).toBe(20);
        // Not a number: nothing changes
        await pile.chooseStockpileFlatElevation('abc');
        expect(pile.stockpileFlatElevation.value).toBe(20);
    });
});

describe('the outline of a pile on the map changes', () => {
    const moveOutline = (feature, metres) => feature.getGeometry().translate(metres, 0);
    const settle = () => vi.advanceTimersByTimeAsync(0);
    const longitudeOf = call => call.polygon.coordinates[0][0][0];

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => vi.useRealTimers());

    const material = { material: 'gravel', materialName: 'Gravel', materialDensity: 2, costPerTon: 10, currency: 'EUR' };

    it('measures it again once the outline rests, from the base, the flat elevation and the model recorded with the pile', async () => {
        netVolumeOf = { flat: 70 };
        const feature = addPile({ ...material, basePlaneMethod: 'flat', flatElevation: 4, sourceRaster: 'site/dtm.tif', confidence: 0.66 });
        moveOutline(feature, 1000);

        pile.remeasureStockpileFeature(feature);
        // Not at once: a vertex may be followed by another
        await vi.advanceTimersByTimeAsync(300);
        expect(measureCalls).toEqual([]);
        await vi.advanceTimersByTimeAsync(200);

        expect(measureCalls).toHaveLength(1);
        expect(measureCalls[0]).toMatchObject({ path: 'site/dtm.tif', baseMethod: 'flat', flatElevation: 4 });
        // The outline asked for is the one the pile has now, in WGS84
        expect(longitudeOf(measureCalls[0])).toBeGreaterThan(9.005);
        expect(feature.getProperties()).toMatchObject({ netVolume: 70, cutVolume: 70, basePlaneMethod: 'flat', flatElevation: 4, confidence: 0.66 });
        // The weight and the cost of the material saved with the pile
        expect(feature.get('weightEstimate').tons).toBeCloseTo(140, 9);
        expect(feature.get('costEstimate')).toEqual({ amount: 1400, currency: 'EUR' });
        expect(feature.get('tooltipText')).toBe('70 m³ - Gravel - 2 t/m³');
    });

    it('measures once for a run of changes, with the last outline', async () => {
        const feature = addPile();
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(300);
        moveOutline(feature, 500);
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(300);
        moveOutline(feature, 500);
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);

        expect(measureCalls).toHaveLength(1);
        expect(longitudeOf(measureCalls[0])).toBeGreaterThan(9.008);
    });

    it('drops the answer for an earlier outline that comes after the one for the later outline', async () => {
        const feature = addPile();
        const answers = [];
        dataset.calculateStockpileVolume = (path, polygon, { baseMethod }) => new Promise(resolve => {
            answers.push(net => resolve({ ...VOLUME, cutVolume: net, netVolume: net, basePlaneMethod: baseMethod }));
        });

        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(answers).toHaveLength(1);
        // The outline changes while the first is being measured
        moveOutline(feature, 500);
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(answers).toHaveLength(2);

        answers[1](222);
        await settle();
        expect(feature.get('netVolume')).toBe(222);
        // The answer for the first outline arrives last: it is not written
        answers[0](111);
        await settle();
        expect(feature.get('netVolume')).toBe(222);
    });

    it('measures each pile on its own turn: a change of one does not drop the answer of another', async () => {
        const first = addPile();
        const second = addPile();
        const answers = [];
        dataset.calculateStockpileVolume = (path, polygon, { baseMethod }) => new Promise(resolve => {
            answers.push(net => resolve({ ...VOLUME, cutVolume: net, netVolume: net, basePlaneMethod: baseMethod }));
        });
        pile.remeasureStockpileFeature(first);
        await vi.advanceTimersByTimeAsync(400);
        pile.remeasureStockpileFeature(second);
        await vi.advanceTimersByTimeAsync(400);
        expect(answers).toHaveLength(2);

        answers[0](11);
        answers[1](22);
        await settle();
        expect(first.get('netVolume')).toBe(11);
        expect(second.get('netVolume')).toBe(22);
    });

    it('keeps the figures and says so on the label and with a flash when the volume cannot be had, then recovers', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const feature = addPile({ ...material, netVolume: 80, tooltipText: '80 m³ - Gravel - 2 t/m³' });
        dataset.calculateStockpileVolume = async () => { throw new Error('Cannot calculate volume'); };
        moveOutline(feature, 1000);

        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);

        expect(feature.get('netVolume')).toBe(80);
        expect(feature.get('tooltipText')).toBe('80 m³ - Gravel - 2 t/m³ (not recalculated)');
        expect(flash).toHaveBeenCalledTimes(1);
        expect(flash.mock.calls[0][0]).toMatch(/could not be calculated for its new outline/);
        expect(flash.mock.calls[0][1]).toBe('warning');

        // The next outline that can be measured writes its volume and takes the note off
        dataset.calculateStockpileVolume = async (path, polygon, { baseMethod }) => ({ ...VOLUME, cutVolume: 90, netVolume: 90, basePlaneMethod: baseMethod });
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(feature.get('netVolume')).toBe(90);
        expect(feature.get('tooltipText')).toBe('90 m³ - Gravel - 2 t/m³');
        error.mockRestore();
    });

    it('works with the panel closed, and never opened', async () => {
        const feature = addPile({ sourceRaster: 'site/dsm.tif' });
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(measureCalls).toHaveLength(1);
        expect(measureCalls[0].path).toBe('site/dsm.tif');
        expect(pile.stockpilePanelVisible.value).toBe(false);

        pile.openStockpileVolume('dsm.tif');
        await settle();
        pile.closeStockpileVolume();
        pile.remeasureStockpileFeature(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(measureCalls).toHaveLength(2);
    });

    it('shows the new volumes in the panel when the pile is the chosen one, and the outline it exports', async () => {
        netVolumeOf = { lowest_perimeter: 33 };
        pile.openStockpileVolume('dsm.tif');
        await settle();
        const feature = addPile();
        pile.selectStockpileFeature(feature);
        await settle();
        moveOutline(feature, 1000);

        pile.remeasureStockpileFeature(feature);
        // The outline is the new one at once
        expect(pile.stockpileDetectedPolygon.value.coordinates[0][0][0]).toBeGreaterThan(9.005);
        await vi.advanceTimersByTimeAsync(400);

        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 33, basePlaneMethod: 'lowest_perimeter' });
    });

    it('writes nothing for a pile deleted meanwhile, and measures nothing for what is not a pile', async () => {
        const feature = addPile();
        pile.remeasureStockpileFeature(feature);
        pile.remeasureStockpileFeature(new Feature({ measurementType: 'area', id: 'a1' }));
        pile.remeasureStockpileFeature(null);
        source.removeFeature(feature);
        pile.onStockpileFeatureRemoved(feature);
        await vi.advanceTimersByTimeAsync(400);
        expect(measureCalls).toEqual([]);

        // Removed while it is being measured
        const other = addPile({ netVolume: 80 });
        let answer;
        dataset.calculateStockpileVolume = (path, polygon, { baseMethod }) => new Promise(resolve => {
            answer = () => resolve({ ...VOLUME, cutVolume: 1, netVolume: 1, basePlaneMethod: baseMethod });
        });
        pile.remeasureStockpileFeature(other);
        await vi.advanceTimersByTimeAsync(400);
        source.removeFeature(other);
        pile.onStockpileFeatureRemoved(other);
        answer();
        await settle();
        expect(other.get('netVolume')).toBe(80);
        expect(flash).not.toHaveBeenCalled();
    });

    it('does not measure again once the component that has the panel is gone', async () => {
        let hosted;
        const wrapper = mount(defineComponent({
            setup() {
                hosted = useStockpileVolume({
                    dataset: () => dataset, map: ref(null), measureControls: shallowRef(toolbar), currentUnitPref: ref('metric'),
                    deletedMeasurementIds: ref([]), rasterFilePath: ref(''), getMapCenterLatLon: () => () => null
                });
                return () => h('div');
            }
        }));
        const feature = addPile();
        hosted.remeasureStockpileFeature(feature);

        wrapper.unmount();
        await vi.advanceTimersByTimeAsync(400);

        expect(measureCalls).toEqual([]);
    });
});

describe('Edit outline, with the real measure control', () => {
    let control;
    let controlMap;

    beforeEach(async () => {
        scope.stop();
        control = new MeasureControls({ onFeatureModified: feature => pile.remeasureStockpileFeature(feature) });
        const target = document.createElement('div');
        document.body.appendChild(target);
        controlMap = new OlMap({ target, view: new View({ center: [1000000, 5600000], zoom: 10 }) });
        control.setMap(controlMap);
        start(control);
        olMap.value = controlMap;
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
    });
    afterEach(() => {
        control.setMap(null);
        controlMap.setTarget(undefined);
        vi.useRealTimers();
    });

    const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const chosenPile = (props = {}) => {
        const feature = addPile(props, control.source);
        pile.selectStockpileFeature(feature);
        return feature;
    };

    it('edits the chosen pile only: the edit mode is asked for that one feature', async () => {
        addPile({}, control.source);
        const feature = chosenPile();
        const enable = vi.spyOn(control, 'enableEditMode');

        pile.toggleStockpileOutlineEdit();

        expect(enable).toHaveBeenCalledTimes(1);
        expect(enable.mock.calls[0][1].features).toHaveLength(1);
        expect(enable.mock.calls[0][1].features[0]).toBe(feature);
        expect(control.isEditMode).toBe(true);
        expect(pile.stockpileEditing.value).toBe(true);
    });

    it('is not offered, and does nothing, without a pile on the map chosen', () => {
        expect(pile.stockpileCanEditOutline.value).toBe(false);
        pile.toggleStockpileOutlineEdit();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);
    });

    it('ends with a second press, with Esc and with the toolbar, and the panel knows', () => {
        chosenPile();
        pile.toggleStockpileOutlineEdit();
        pile.toggleStockpileOutlineEdit();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);

        pile.toggleStockpileOutlineEdit();
        esc();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);

        pile.toggleStockpileOutlineEdit();
        control.toggleEditMode();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);
    });

    it('ends when another pile is chosen, the panel closes, Clear is pressed or the pile is deleted', () => {
        const first = chosenPile();
        pile.toggleStockpileOutlineEdit();
        chosenPile();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);

        pile.toggleStockpileOutlineEdit();
        pile.closeStockpileVolume();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);

        pile.openStockpileVolume('dsm.tif');
        pile.selectStockpileFeature(first);
        pile.toggleStockpileOutlineEdit();
        pile.clearStockpileOverlay();
        expect(control.isEditMode).toBe(false);

        pile.selectStockpileFeature(first);
        pile.toggleStockpileOutlineEdit();
        control.source.removeFeature(first);
        pile.onStockpileFeatureRemoved(first);
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);
    });

    it('gives way to the toolbar\'s edit of every measurement, and takes its place', () => {
        chosenPile();
        control.toggleEditMode();
        expect(control.isEditMode).toBe(true);
        pile.toggleStockpileOutlineEdit();
        expect(control.isEditMode).toBe(true);
        expect(pile.stockpileEditing.value).toBe(true);
    });

    it('starting Click map or Draw ends it', () => {
        chosenPile();
        pile.toggleStockpileOutlineEdit();
        pile.startStockpileClickMode();
        expect(control.isEditMode).toBe(false);
        expect(pile.stockpileEditing.value).toBe(false);
        pile.stopStockpileInteractions();
    });

    it('measures the pile again when the user ends a move of a vertex: once, after the pause, with the outline it has', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const feature = chosenPile({ netVolume: 80 });
        pile.toggleStockpileOutlineEdit();
        netVolumeOf = { lowest_perimeter: 91 };
        const modified = () => control.modifyInteraction.dispatchEvent(new ModifyEvent('modifyend', new Collection([feature]), undefined));

        feature.getGeometry().translate(500, 0);
        modified();
        await vi.advanceTimersByTimeAsync(200);
        feature.getGeometry().translate(500, 0);
        modified();
        await vi.advanceTimersByTimeAsync(300);
        expect(measureCalls).toEqual([]);
        await vi.advanceTimersByTimeAsync(200);

        expect(measureCalls).toHaveLength(1);
        expect(measureCalls[0].polygon.coordinates[0][0][0]).toBeGreaterThan(9.008);
        expect(feature.get('netVolume')).toBe(91);
        expect(pile.stockpileResult.value.netVolume).toBe(91);
    });

    it('measures the pile again after an undo, and after the toolbar\'s Edit moves one', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const feature = addPile({}, control.source);
        control.enableEditMode(controlMap);
        control.undoStack.push({ feature, geometry: feature.getGeometry().clone(), tooltipText: undefined });
        feature.getGeometry().translate(500, 0);

        control.undo();
        await vi.advanceTimersByTimeAsync(400);

        expect(measureCalls).toHaveLength(1);
        expect(measureCalls[0].polygon.coordinates[0][0][0]).toBeCloseTo(9, 4);
    });
});

describe('a click on the map while the panel is open', () => {
    /** The preview layer of the found piles, and what a click at a pixel hits: [layer, feature] pairs */
    const previewLayer = () => olMap.value.getLayers().getArray().find(l => l.getZIndex() === 1500);
    const previewOf = id => previewLayer().getSource().getFeatures().find(f => f.get('pileId') === id);
    let hits;
    const click = () => olMap.value.dispatchEvent({ type: 'singleclick', pixel: [10, 10] });
    const FOUND = {
        stockpiles: [
            { id: 0, polygon: POLYGON, estimatedVolume: 1, confidence: 0.9, areaM2: 50 },
            { id: 1, polygon: POLYGON, estimatedVolume: 2, confidence: 0.8, areaM2: 40 }
        ],
        totalFound: 2
    };

    beforeEach(async () => {
        olMap.value = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        hits = [];
        // A map that is not rendered has no hit detection: the hits are what the test says is under the pointer
        olMap.value.forEachFeatureAtPixel = (pixel, callback, { layerFilter }) => {
            for (const [layer, feature] of hits) {
                if (!layerFilter(layer)) continue;
                const found = callback(feature, layer);
                if (found) return found;
            }
            return undefined;
        };
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        dataset.detectAllStockpiles = vi.fn(async () => FOUND);
        await pile.findAllStockpiles();
        await flushPromises();
    });

    it('on the outline of a pile of the list chooses its row, with the volume of the row', () => {
        hits = [[previewLayer(), previewOf(1)]];
        click();
        expect(pile.stockpileChosenPile.value).toBe(1);
        expect(pile.stockpileResult.value).toMatchObject({ netVolume: 100 });
        expect(pilesOnMap()).toHaveLength(0);
    });

    it('on a pile on the map chooses it: the panel works on it', () => {
        const feature = addPile({ title: 'On the map' });
        hits = [[toolbar.vector, feature]];
        click();
        expect(pile.stockpileTitle.value).toBe('On the map');
        expect(pile.stockpileCanEditOutline.value).toBe(true);
    });

    it('on a pile that was added from the list chooses its row and its measurement', () => {
        pile.addStockpilePiles([pile.stockpilePiles.value[1]]);
        hits = [[previewLayer(), previewOf(1)]];
        click();
        expect(pile.stockpileChosenPile.value).toBe(1);
        expect(pile.stockpileCanEditOutline.value).toBe(true);
    });

    it('on a measurement that is not a pile does nothing', () => {
        hits = [[toolbar.vector, new Feature({ measurementType: 'length', id: 'l1' })]];
        click();
        expect(pile.stockpileChosenPile.value).toBeNull();
        expect(pile.stockpileResult.value).toBeNull();
    });

    it('is not a choice while Click map or Draw runs, a measure tool is selected or the outlines are being edited', () => {
        hits = [[previewLayer(), previewOf(1)]];
        pile.startStockpilePolygonDrawing();
        click();
        expect(pile.stockpileChosenPile.value).toBeNull();
        pile.stopStockpileInteractions();

        toolbar.selectedTool = 'length';
        click();
        expect(pile.stockpileChosenPile.value).toBeNull();
        toolbar.selectedTool = null;

        toolbar.isEditMode = true;
        click();
        expect(pile.stockpileChosenPile.value).toBeNull();
        toolbar.isEditMode = false;

        click();
        expect(pile.stockpileChosenPile.value).toBe(1);
    });

    it('is not a choice once the panel is closed: the listener of the map is gone', () => {
        pile.closeStockpileVolume();
        hits = [[toolbar.vector, addPile({ title: 'On the map' })]];
        click();
        expect(pile.stockpileTitle.value).toBe('');
        expect(pile.stockpileCanEditOutline.value).toBe(false);

        // ... and it is back with the panel, once
        pile.openStockpileVolume('dsm.tif');
        click();
        expect(pile.stockpileTitle.value).toBe('On the map');
    });

    it('takes a hover over a row to the outline of the pile on the map', () => {
        pile.hoverStockpilePile(pile.stockpilePiles.value[1]);
        const layer = previewLayer();
        const style = feature => layer.getStyleFunction()(feature, 1);
        const widthOf = feature => style(feature)[1].getStroke().getWidth();
        expect(widthOf(previewOf(1))).toBeGreaterThan(widthOf(previewOf(0)));
        pile.hoverStockpilePile(null);
        expect(widthOf(previewOf(1))).toBe(widthOf(previewOf(0)));
    });

    it('draws the chosen pile thicker and a pile that was added dimmer than the others', () => {
        const layer = previewLayer();
        const lineOf = feature => layer.getStyleFunction()(feature, 1)[1].getStroke();
        const plain = lineOf(previewOf(0));
        pile.chooseStockpilePile(pile.stockpilePiles.value[1], { fit: false });
        expect(lineOf(previewOf(1)).getWidth()).toBeGreaterThan(plain.getWidth());

        pile.addStockpilePiles([pile.stockpilePiles.value[0]]);
        expect(lineOf(previewOf(0)).getColor()).not.toBe(plain.getColor());
    });
});

describe('the pile the panel restores when it opens', () => {
    it('is read from the measurements file the map shows, not from a file named after the raster', async () => {
        measurementsFile = 'site/measurements.geojson';
        const read = vi.fn(async () => JSON.stringify(savedPile({ title: 'From the folder file' })));
        dataset.getFileContents = read;

        pile.openStockpileVolume('site/dsm.tif');
        await flushPromises();

        expect(read).toHaveBeenCalledWith('site/measurements.geojson');
        expect(read).not.toHaveBeenCalledWith('site/dsm_measurements.geojson');
        expect(pile.stockpileTitle.value).toBe('From the folder file');
    });

    it('reads nothing while the map has no measurements file yet', async () => {
        measurementsFile = null;
        const read = vi.fn(async () => '');
        dataset.getFileContents = read;
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        expect(read).not.toHaveBeenCalled();
    });

    it('is the one measured on the raster of the panel when the file has piles of several', async () => {
        const feature = (id, title, sourceRaster) => ({
            type: 'Feature', geometry: POLYGON, properties: { id, title, sourceRaster, measurementType: 'stockpile', ...VOLUME }
        });
        savedFile = { ...savedPile({}), features: [feature('a', 'On the DTM', 'dtm.tif'), feature('b', 'On the DSM', 'dsm.tif'), feature('c', 'Also on the DTM', 'dtm.tif')] };

        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        expect(pile.stockpileTitle.value).toBe('On the DSM');

        pile.openStockpileVolume('dtm.tif');
        await flushPromises();
        expect(pile.stockpileTitle.value).toBe('Also on the DTM');
    });

    it('is the chosen pile when it is on the map: the panel works on its feature, and it writes nothing to it', async () => {
        const feature = addPile({ id: 'p1', title: 'Saved pile' });
        const before = propertiesOf(feature);
        savedFile = savedPile({ title: 'Saved pile' });

        pile.openStockpileVolume('dsm.tif');
        await flushPromises();

        expect(pile.stockpileCanEditOutline.value).toBe(true);
        expect(pile.stockpileTitle.value).toBe('Saved pile');
        expect(propertiesOf(feature)).toEqual(before);
        pile.stockpileTitle.value = 'Renamed';
        await flushPromises();
        expect(feature.get('title')).toBe('Renamed');
    });

    it('is not chosen while the pile is only in the file: the panel shows it', async () => {
        savedFile = savedPile({ title: 'Only in the file' });
        pile.openStockpileVolume('dsm.tif');
        await flushPromises();
        expect(pile.stockpileTitle.value).toBe('Only in the file');
        expect(pile.stockpileCanEditOutline.value).toBe(false);
    });
});

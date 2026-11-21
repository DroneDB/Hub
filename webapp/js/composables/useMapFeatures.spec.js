/**
 * The map's analysis tools as the map wires them: the tools show as soon as a drawn raster
 * accepts them, a tool opens for the raster chosen at its first use (the one on top), the
 * measurements stay where the files on show put them whichever raster a tool works on, a view has
 * the tools like any map, and split compare closes them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, reactive, nextTick } from 'vue';
import { Tile as TileLayer } from 'ol/layer';
import Feature from 'ol/Feature';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { Polygon } from 'ol/geom';
import ddb from 'ddb';
import MeasureControls from '@/libs/map/controls/measureControl';
import { FileLayers } from '@/libs/map/fileLayers';
import { useMapFeatures } from './useMapFeatures';

const T = ddb.entry.type;
const band = colorInterp => ({ colorInterp });
const entryOf = (path, bands, type = T.GEORASTER) => ({ path, type, properties: { bands: bands.map(band) } });
const ORTHO = entryOf('odm_orthophoto/ortho.tif', ['Red', 'Green', 'Blue', 'Alpha']);
const DSM = entryOf('odm_dem/dsm.tif', ['Gray']);
const DTM = entryOf('odm_dem/dtm.tif', ['Gray']);
// A thermal photo drawn as a raster
const THERMAL = {
    ...entryOf('flight/thermal.tif', ['Gray'], T.GEOIMAGE),
    polygon_geom: { type: 'Polygon', coordinates: [] },
    properties: { sensorCategory: 'thermal', bands: [band('Gray')] }
};

let scope;
let features;
let props;
let dataset;

/** Starts a map on these entries, bottom first as the files are listed, with its layers built. */
function start(entries, extra = {}) {
    dataset = {
        getFileContents: vi.fn(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); }),
        writeObj: vi.fn(),
        deleteObj: vi.fn()
    };
    props = reactive({
        files: entries.map(entry => ({ path: `ddb://x/y/${entry.path}`, entry, selected: false })),
        dataset, canWrite: true, canDelete: true, view: null, ...extra
    });
    scope = effectScope();
    features = scope.run(() => useMapFeatures(props));
    features.measureControls.value = new MeasureControls({});
    rebuild();
}

/** What MapCore does when the files change: one layer for each file, the last on top. */
function rebuild() {
    features.syncRasterLayers(props.files.map(file => {
        const olLayer = new TileLayer();
        olLayer.file = file;
        return { file, olLayer };
    }));
}

const AREA = { type: 'Polygon', coordinates: [[[10, 45], [10.01, 45], [10.01, 45.01], [10, 45.01], [10, 45]]] };
const onGround = entry => ({ ...entry, hash: entry.path, polygon_geom: AREA });
const thermalPhoto = () => ({ ...onGround(THERMAL), point_geom: { type: 'Point', coordinates: [10.005, 45.005, 100] } });

/**
 * What MapCore does with the real file layers: only the files drawn as rasters become rows. A
 * photo is a camera marker on the dataset tab and a raster on the single-file map.
 */
function rebuildFromFileLayers(standalone) {
    const fileLayers = new FileLayers();
    fileLayers.build(props.files, { standalone, shotStyle: 'shot' });
    features.rasterLayer.value = fileLayers.rasters;
    features.syncRasterLayers(fileLayers.rasterSlots);
}

const stockpileButton = () => features.toggleAnalysisPanel('stockpile');
const paths = () => features.analysisCandidates.value.map(c => c.path);

afterEach(() => scope?.stop());

describe('the analysis tools of the map', () => {
    it('show for a DEM with no target chosen yet', () => {
        start([DSM]);
        expect(features.analysisTargetPath.value).toBeNull();
        expect(features.analysisEntry.value).toMatchObject({ path: DSM.path });
    });

    it('show for a DEM with an orthophoto, and do not for an orthophoto alone', () => {
        start([DSM, ORTHO]);
        expect(paths()).toEqual([DSM.path]);
        expect(features.analysisEntry.value).not.toBeNull();
        scope.stop();
        start([ORTHO]);
        expect(features.analysisEntry.value).toBeNull();
    });

    it('list the DEMs top first with the labels of their layers', () => {
        start([DSM, DTM, ORTHO]);
        expect(features.analysisCandidates.value).toEqual([
            { path: DTM.path, label: 'dtm.tif' }, { path: DSM.path, label: 'dsm.tif' }
        ]);
    });

    it('do not count a thermal photo drawn as a camera marker on the dataset tab', () => {
        start([onGround(DSM), thermalPhoto()]);
        rebuildFromFileLayers(false);
        expect(features.rasterLayerList.value.map(r => r.path)).toEqual([DSM.path]);
        expect(paths()).toEqual([DSM.path]);
    });

    it('count that thermal photo on the single-file map, where it is drawn as a raster', () => {
        start([onGround(DSM), thermalPhoto()]);
        rebuildFromFileLayers(true);
        expect(paths()).toEqual([THERMAL.path, DSM.path]);
    });

    it('are offered in a view like on any map', () => {
        start([DSM, DTM], { view: { layers: [] } });
        expect(paths()).toEqual([DTM.path, DSM.path]);
        expect(features.analysisEntry.value).not.toBeNull();
    });

    it('do not count a layer that is only a placeholder', () => {
        start([DSM]);
        const placeholder = { path: 'x.tif', entry: null, placeholder: { path: 'odm_dem/x.tif', kind: 'missing', text: 'Missing' } };
        features.syncRasterLayers([...props.files.map(file => ({ file, olLayer: Object.assign(new TileLayer(), { file }) })), { file: placeholder, olLayer: null }]);
        expect(paths()).toEqual([DSM.path]);
    });
});

describe('the elevation model of a view', () => {
    it('is the one a tool would pick when none was chosen: the raster on top', () => {
        start([DSM, DTM], { view: {} });
        expect(features.defaultAnalysisTarget()).toBe(DTM.path);
    });

    it('is put back without a question or a panel', () => {
        start([DSM, DTM], { view: {} });
        expect(features.restoreAnalysisTarget(DTM.path)).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.rasterFilePath.value).toBeFalsy();
        expect(features.stockpilePanelVisible.value).toBe(false);
        expect(features.dialogs.stack.value).toHaveLength(0);
    });
});

describe('opening a tool', () => {
    it('chooses the raster on top, and opens for it', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
        expect(features.rasterFilePath.value).toBe(DTM.path);
    });

    it('skips an orthophoto on top, which is no elevation model, and leaves the measurements where the files put them', async () => {
        start([DSM, ORTHO]);
        const owner = features.measurementOwnerEntry().path;
        await stockpileButton();
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.measurementOwnerEntry().path).toBe(owner);
        expect(owner).toBe('odm_dem/measurements.geojson');
    });

    it('closes its panel when the button is used again', async () => {
        start([DSM]);
        await stockpileButton();
        await stockpileButton();
        expect(features.stockpilePanelVisible.value).toBe(false);
    });

    it('keeps the target when the layers are rebuilt', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
    });
});

describe('switching the elevation model', () => {
    it('opens the panel for the new raster, and loads and moves no measurements', async () => {
        start([DSM, DTM]);
        await features.loadSavedMeasurements();
        await stockpileButton();
        // The map holds the measurements of its owner: a load would make another storage, and another path
        const storage = features.measurementStorage.value;
        expect(storage).not.toBeNull();
        const owner = features.measurementOwnerEntry().path;
        expect(await features.selectAnalysisTarget(DSM.path)).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.rasterFilePath.value).toBe(DSM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
        await features.loadSavedMeasurements();
        expect(features.measurementStorage.value).toBe(storage);
        expect(features.measurementOwnerEntry().path).toBe(owner);
        expect(features.measurementsFilePath.value).toBe('odm_dem/measurements.geojson');
    });
});

describe('switching with unsaved measurements', () => {
    const unsaved = { type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'LineString', coordinates: [[10, 45], [10.001, 45]] },
        properties: { name: 'm1', measurementType: 'length', createdAt: '2026-10-30T10:00:00.000Z' }
    }] };

    async function withUnsavedMeasurement(entries = [DSM, DTM]) {
        start(entries);
        await features.loadSavedMeasurements();
        await stockpileButton();
        features.measureControls.value.importFromGeoJSON(unsaved);
        expect(features.measureControls.value.isDirty()).toBe(true);
    }

    it('asks nothing and keeps them, for another elevation model or a thermal photo', async () => {
        await withUnsavedMeasurement([DSM, DTM, THERMAL]);
        for (const path of [DSM.path, THERMAL.path]) {
            expect(await features.selectAnalysisTarget(path)).toBe(true);
            expect(features.analysisTargetPath.value).toBe(path);
            expect(features.dialogs.stack.value).toHaveLength(0);
            expect(features.measureControls.value.isDirty()).toBe(true);
        }
    });

    it('asks nothing when a target left the map', async () => {
        await withUnsavedMeasurement();
        props.files = props.files.filter(f => f.entry.path !== DTM.path);
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.dialogs.stack.value).toHaveLength(0);
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.measureControls.value.isDirty()).toBe(true);
    });
});

describe('a target that leaves the map', () => {
    it('is replaced by the other DEM, and the panel opens for it', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        props.files = props.files.filter(f => f.entry.path !== DTM.path);
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.rasterFilePath.value).toBe(DSM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
    });

    it('is cleared with the last DEM, and the tools close and hide', async () => {
        start([ORTHO, DSM]);
        await stockpileButton();
        props.files = props.files.filter(f => f.entry.path === ORTHO.path);
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.analysisTargetPath.value).toBeNull();
        expect(features.stockpilePanelVisible.value).toBe(false);
        expect(features.analysisEntry.value).toBeNull();
    });
});

describe('split compare', () => {
    it('closes an open tool when it turns on', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        features.toggleSplit();
        await nextTick();
        expect(features.splitMode.value).toBe(true);
        expect(features.stockpilePanelVisible.value).toBe(false);
    });

    it('is turned off by a tool asked for while it is on, and the tool opens', async () => {
        start([DSM, DTM]);
        features.toggleSplit();
        await nextTick();
        await stockpileButton();
        expect(features.splitMode.value).toBe(false);
        expect(features.stockpilePanelVisible.value).toBe(true);

        features.toggleSplit();
        await nextTick();
        await features.toggleAnalysisPanel('rasterAnalysis');
        expect(features.splitMode.value).toBe(false);
        expect(features.rasterPanelVisible.value).toBe(true);
    });
});

describe('a pile chosen in the measurement list', () => {
    const pileOn = sourceRaster => {
        const feature = new Feature(new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]));
        feature.setProperties({ measurementType: 'stockpile', id: 'p1', netVolume: 5, sourceRaster });
        features.measureControls.value.source.addFeature(feature);
        return feature;
    };

    it('opens Stockpile Volume on the model the pile was measured on, and the panel works on that pile', () => {
        start([onGround(DSM), onGround(DTM)]);
        const feature = pileOn(DSM.path);
        expect(features.workOnStockpile(feature)).toBe(true);
        expect(features.stockpilePanelVisible.value).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.stockpileResult.value).toMatchObject({ netVolume: 5 });
    });

    it('brings the pile into view', () => {
        start([onGround(DSM)]);
        const olMap = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        olMap.setSize([800, 600]);
        const fit = vi.spyOn(olMap.getView(), 'fit').mockImplementation(() => {});
        features.map.value = olMap;
        const feature = pileOn(DSM.path);
        features.workOnStockpile(feature);
        expect(fit).toHaveBeenCalledWith(feature.getGeometry(), expect.objectContaining({ maxZoom: 21 }));
    });

    it('opens on the top model for a pile of a model that is not on the map', () => {
        start([onGround(DSM), onGround(DTM)]);
        expect(features.workOnStockpile(pileOn('elsewhere/dsm.tif'))).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DTM.path);
    });

    it('does nothing for a measurement that is not a pile', () => {
        start([onGround(DSM)]);
        const area = new Feature(new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]));
        area.set('measurementType', 'area');
        expect(features.workOnStockpile(area)).toBe(false);
        expect(features.stockpilePanelVisible.value).toBe(false);
    });
});

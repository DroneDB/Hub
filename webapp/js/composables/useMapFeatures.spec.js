/**
 * The map's analysis tools as the map wires them: the tools show as soon as a drawn raster
 * accepts them, a tool opens for the raster chosen at its first use, the measurements follow
 * it, a view has them like any map, and split compare closes them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, reactive, nextTick } from 'vue';
import { Tile as TileLayer } from 'ol/layer';
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
// A thermal photo drawn as a raster: the measurements do not follow it
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
    it('is the one a tool would pick when none was chosen', () => {
        start([DSM, DTM], { view: {} });
        expect(features.defaultAnalysisTarget()).toBe(DSM.path);
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
    it('chooses the raster of the measurements, not the DTM drawn above it, and opens for it', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
        expect(features.rasterFilePath.value).toBe(DSM.path);
    });

    it('leaves the measurements of the first georaster where they are', async () => {
        start([ORTHO, DSM]);
        await stockpileButton();
        // The orthophoto is not an elevation model: the DSM is the topmost candidate, and the measurements follow it
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.measurementsRasterPath()).toBe(DSM.path);
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
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
    });
});

describe('switching the elevation model', () => {
    it('loads the measurements of the new raster, then opens the panel for it', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        const loads = [];
        dataset.getFileContents.mockImplementation(async path => {
            loads.push(`${path} ${features.stockpilePanelVisible.value ? 'open' : 'closed'}`);
            throw Object.assign(new Error('Not found'), { status: 404 });
        });
        expect(await features.selectAnalysisTarget(DTM.path)).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.rasterFilePath.value).toBe(DTM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
        expect(features.measurementsRasterPath()).toBe(DTM.path);
        // The measurements file of the DTM was read while the panel was still closed
        expect(loads[0]).toBe('odm_dem/dtm_measurements.geojson closed');
    });
});

describe('switching with unsaved measurements', () => {
    const unsaved = { type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'LineString', coordinates: [[10, 45], [10.001, 45]] },
        properties: { name: 'm1', measurementType: 'length', createdAt: '2026-10-30T10:00:00.000Z' }
    }] };
    const question = () => features.dialogs.stack.value.at(-1);

    async function withUnsavedMeasurement() {
        start([DSM, DTM]);
        await stockpileButton();
        features.measureControls.value.importFromGeoJSON(unsaved);
        expect(features.measureControls.value.isDirty()).toBe(true);
    }

    it('asks to discard them, and Cancel keeps the target, the panel and the measurements', async () => {
        await withUnsavedMeasurement();
        const answer = features.selectAnalysisTarget(DTM.path);
        await nextTick();
        expect(question().props.message).toBe('Discard the unsaved measurements of dsm.tif?');
        expect(question().props.confirmText).toBe('Discard');
        features.dialogs.close(question().id, 'cancel');
        expect(await answer).toBe(false);
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        expect(features.rasterFilePath.value).toBe(DSM.path);
        expect(features.stockpilePanelVisible.value).toBe(true);
        expect(features.measureControls.value.isDirty()).toBe(true);
    });

    it('switches after Discard, to the measurements of the new raster', async () => {
        await withUnsavedMeasurement();
        const answer = features.selectAnalysisTarget(DTM.path);
        await nextTick();
        features.dialogs.close(question().id, 'confirm');
        expect(await answer).toBe(true);
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.rasterFilePath.value).toBe(DTM.path);
        expect(features.measureControls.value.isDirty()).toBe(false);
    });

    it('does not ask, and keeps them, when the switch leaves them in their file (to a thermal photo)', async () => {
        start([DSM, THERMAL]);
        await stockpileButton();
        expect(features.analysisTargetPath.value).toBe(DSM.path);
        features.measureControls.value.importFromGeoJSON(unsaved);
        const answer = features.selectAnalysisTarget(THERMAL.path);
        await nextTick();
        expect(features.dialogs.stack.value).toHaveLength(0);
        expect(await answer).toBe(true);
        expect(features.analysisTargetPath.value).toBe(THERMAL.path);
        expect(features.measurementsRasterPath()).toBe(DSM.path);
        expect(features.measureControls.value.isDirty()).toBe(true);
    });

    it('does not ask when a target left the map: the measurements feature warns instead', async () => {
        await withUnsavedMeasurement();
        props.files = props.files.filter(f => f.entry.path !== DSM.path);
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.dialogs.stack.value).toHaveLength(0);
        expect(features.analysisTargetPath.value).toBe(DTM.path);
    });
});

describe('a target that leaves the map', () => {
    it('is replaced by the other DEM, and the panel opens for it', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        props.files = props.files.filter(f => f.entry.path !== DSM.path);
        rebuild();
        await features.reconcileAnalysisTarget();
        expect(features.analysisTargetPath.value).toBe(DTM.path);
        expect(features.rasterFilePath.value).toBe(DTM.path);
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
    it('closes an open tool when it turns on, and does not let a tool open while it is on', async () => {
        start([DSM, DTM]);
        await stockpileButton();
        features.toggleSplit();
        await nextTick();
        expect(features.splitMode.value).toBe(true);
        expect(features.stockpilePanelVisible.value).toBe(false);
        await stockpileButton();
        expect(features.stockpilePanelVisible.value).toBe(false);
        features.toggleSplit();
        await stockpileButton();
        expect(features.stockpilePanelVisible.value).toBe(true);
    });
});

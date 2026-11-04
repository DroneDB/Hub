/**
 * The map under a view: the parent's state is applied to the map and what the user changes on
 * the map is reported as the whole new state, once the map shows the state's layers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, shallowRef, nextTick } from 'vue';
import { Map as OlMap, View } from 'ol';
import { Tile as TileLayer, Group } from 'ol/layer';
import ddb from 'ddb';
import { useRasterLayers } from './useRasterLayers';
import { useMapSplitCompare } from './useMapSplitCompare';
import { useMapBasemap } from './useMapBasemap';
import { useAnalysisTarget } from './useAnalysisTarget';
import { useMapViewState } from './useMapViewState';
import { PREF, getPref, setPref, safeStorage, _resetPrefListenersForTests } from '@/libs/preferences';

const DSM = 'a/dsm.tif';
const ORTHO = 'a/ortho.tif';
const DTM = 'a/dtm.tif';
const layer = (path, extra = {}) => ({ path, hash: `h-${path}`, opacity: 1, visible: true, vizParams: null, ...extra });
const stateOf = (paths = [DSM, ORTHO], extra = {}) => ({
    v: 1,
    base: { path: paths[0], hash: `h-${paths[0]}` },
    layers: paths.map(p => layer(p)),
    split: { enabled: false, positions: [] },
    view: { center: [10, 20], zoom: 5, rotation: 0 },
    display: { basemap: null },
    analysis: { target: null },
    ...extra
});

let scope;
let emit;
let target;
let olMap;
let rasters;
let split;
let basemap;
let analysis;
let viz;
let refresh;
let confirmDiscard;
let dirty;
let binding;

/** A map like MapCore builds it: the real feature composables, the state of the viewer in `target`. */
function start(initial = stateOf(), { draw = initial.layers.map(l => l.path) } = {}) {
    target = shallowRef(initial);
    // The parent keeps what the map reports, as the viewer does
    emit = vi.fn((event, state) => { target.value = state; });
    confirmDiscard = vi.fn(async () => true);
    dirty = false;
    viz = ref({});
    refresh = vi.fn();
    const map = shallowRef(null);
    scope = effectScope();
    scope.run(() => {
        basemap = useMapBasemap(map);
        const group = shallowRef(new Group());
        rasters = useRasterLayers({ group, vectorLayers: shallowRef([]), splitMode: () => split.splitMode.value });
        split = useMapSplitCompare({ map, rasterLayers: rasters.rasterLayerList, onChange: rasters.updateRastersOpacity });
        // The measurements stay with the DSM until a target decides it
        const pathFor = entry => (entry ? entry.path : DSM);
        analysis = useAnalysisTarget({
            candidates: () => rasters.rasterLayerList.value.filter(r => r.olLayer).map(r => {
                const entry = { path: r.path, type: ddb.entry.type.GEORASTER };
                return { path: r.path, label: r.name, entry, file: { path: `ddb://x/${r.path}`, entry } };
            }),
            measurementsPath: () => pathFor(analysis.targetEntry.value),
            measurementsPathFor: pathFor,
            isDirty: () => dirty,
            confirmDiscard,
            reloadMeasurements: () => Promise.resolve(),
            panels: { openKind: () => null, open: vi.fn(), close: vi.fn() }
        });
        binding = useMapViewState({
            view: () => target.value,
            emit,
            map,
            rasterLayerList: rasters.rasterLayerList,
            rasterOpacity: rasters.rasterOpacity,
            splitMode: split.splitMode,
            splitPositions: split.splitPositions,
            setSplit: split.setSplit,
            vizParamsByPath: viz,
            refreshRasterLayers: refresh,
            selectedBasemap: basemap.selectedBasemap,
            applyBasemap: basemap.applyBasemap,
            analysisTargetPath: analysis.targetPath,
            defaultAnalysisTarget: analysis.defaultTarget,
            restoreAnalysisTarget: analysis.restoreTarget
        });
        olMap = new OlMap({ view: new View({ center: [10, 20], zoom: 5 }), layers: [basemap.createBasemapLayer(), group.value] });
        map.value = olMap;
    });
    if (draw) drawRows(draw);
    return binding;
}

/** The files MapCore draws for the state: the rows follow the order of the state (top first). */
function drawRows(paths) {
    rasters.syncRasterLayers([...paths].reverse().map(path => {
        const file = { path: `ddb://x/${path}`, entry: { path, type: ddb.entry.type.GEORASTER } };
        const olLayer = new TileLayer();
        olLayer.file = file;
        return { file, olLayer };
    }));
}

const rowOf = path => rasters.rasterLayerList.value.find(r => r.path === path);
const setRow = (path, change) => {
    rasters.rasterLayerList.value = rasters.rasterLayerList.value.map(r => (r.path === path ? { ...r, ...change } : r));
};
const settle = async () => { await nextTick(); await nextTick(); };
const reported = () => emit.mock.calls.at(-1)[1];
const stored = () => getPref(PREF.BASEMAP, 'satellite');

beforeEach(() => {
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
    setPref(PREF.BASEMAP, 'satellite');
});
afterEach(() => {
    scope?.stop();
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
});

describe('reporting what the user changes', () => {
    it('reports nothing for a map that shows the state', async () => {
        start();
        await settle();
        expect(emit).not.toHaveBeenCalled();
    });

    it('reports the opacity of a row, the whole state, with the hashes and the base of the parent', async () => {
        start();
        await settle();
        setRow(ORTHO, { opacity: 0.4 });
        await settle();
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit.mock.calls[0][0]).toBe('update:view');
        const expected = stateOf();
        expected.layers[1].opacity = 0.4;
        expected.display.basemap = 'satellite';
        expect(reported()).toEqual(expected);
    });

    it('takes the hashes from the parent, not from what the map drew', async () => {
        const initial = stateOf();
        initial.layers[0].hash = 'newer-than-the-map';
        start(initial);
        await settle();
        setRow(DSM, { opacity: 0.5 });
        await settle();
        expect(reported().layers[0].hash).toBe('newer-than-the-map');
        expect(reported().base).toEqual(initial.base);
    });

    it('reports the opacity of the only row from the row', async () => {
        start(stateOf([DSM]));
        await settle();
        setRow(DSM, { opacity: 0.3 });
        await settle();
        expect(reported().layers[0].opacity).toBe(0.3);
    });

    it('reports a hidden row', async () => {
        start();
        await settle();
        rasters.toggleRasterLayerVisible(DSM);
        await settle();
        expect(reported().layers.map(l => l.visible)).toEqual([false, true]);
    });

    it('reports the plant-health parameters of a layer, and their removal', async () => {
        start();
        await settle();
        viz.value = { [ORTHO]: { formula: 'NDVI' } };
        await settle();
        expect(reported().layers[1].vizParams).toEqual({ formula: 'NDVI' });
        expect(reported().layers[0].vizParams).toBeNull();
    });

    it('reports the rows in their order when the user reorders them', async () => {
        start();
        await settle();
        rasters.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        await settle();
        expect(reported().layers.map(l => l.path)).toEqual([ORTHO, DSM]);
    });

    it('reports the split and its dividers', async () => {
        start();
        await settle();
        split.setSplit(true, [0.3]);
        await settle();
        expect(reported().split).toEqual({ enabled: true, positions: [0.3] });
        split.onSplitPositionsChange([0.6]);
        await settle();
        expect(reported().split.positions).toEqual([0.6]);
        split.setSplit(false, []);
        await settle();
        expect(reported().split).toEqual({ enabled: false, positions: [] });
    });

    it('reports a pan and a zoom at the end of the move, which the parent keeps but does not count', async () => {
        start();
        await settle();
        olMap.getView().setCenter([30, 40]);
        olMap.getView().setZoom(7);
        olMap.dispatchEvent('moveend');
        expect(emit).toHaveBeenCalledTimes(1);
        expect(reported().view).toEqual({ center: [30, 40], zoom: 7, rotation: 0 });
    });

    it('stops listening to the map with the scope', async () => {
        start();
        await settle();
        scope.stop();
        olMap.getView().setCenter([30, 40]);
        olMap.dispatchEvent('moveend');
        expect(emit).not.toHaveBeenCalled();
    });

    it('reports the position of the map when the state has none', async () => {
        start(stateOf([DSM, ORTHO], { view: null }));
        await settle();
        olMap.dispatchEvent('moveend');
        expect(reported().view).toEqual({ center: [10, 20], zoom: 5, rotation: 0 });
    });

    it('reports the basemap the user picks over the one of the state, which is their preference too', async () => {
        start(stateOf([DSM, ORTHO], { display: { basemap: 'osm' } }));
        await settle();
        expect(basemap.selectedBasemap.value).toBe('osm');
        basemap.handleBasemapChanged('satellite');
        await settle();
        expect(reported().display.basemap).toBe('satellite');
        expect(stored()).toBe('satellite');
    });

    it('does not report a basemap pick over a state without one (it matches the preference the user just set)', async () => {
        start();
        await settle();
        basemap.handleBasemapChanged('osm');
        await settle();
        expect(emit).not.toHaveBeenCalled();
        expect(stored()).toBe('osm');
    });

    it('reports the elevation model when it is not the one the tools pick, and null when it is', async () => {
        start(stateOf([ORTHO, DTM, DSM]));
        await settle();
        // The measurements are of the DSM: it is the default, not the DTM on top
        expect(analysis.defaultTarget()).toBe(DSM);
        await analysis.requestOpen('stockpile');
        await settle();
        expect(analysis.targetPath.value).toBe(DSM);
        expect(emit).not.toHaveBeenCalled();

        await analysis.requestSwitch(DTM);
        await settle();
        expect(reported().analysis).toEqual({ target: DTM });

        emit.mockClear();
        await analysis.requestSwitch(DSM);
        await settle();
        expect(reported().analysis).toEqual({ target: null });
    });

    it('does not report a tool that opens on the default elevation model', async () => {
        start();
        await settle();
        await analysis.requestOpen('rasterAnalysis');
        await settle();
        expect(analysis.targetPath.value).toBe(DSM);
        expect(emit).not.toHaveBeenCalled();
    });
});

describe('when the map has not caught up with the state', () => {
    it('reports nothing while the rows are not the layers of the state', async () => {
        start(stateOf(), { draw: [DSM] });
        await settle();
        setRow(DSM, { opacity: 0.2 });
        await settle();
        olMap.dispatchEvent('moveend');
        expect(emit).not.toHaveBeenCalled();
    });

    it('reports nothing while the dividers are not for the rows', async () => {
        start(stateOf());
        await settle();
        split.splitMode.value = true;
        split.splitPositions.value = [];
        await settle();
        expect(emit).not.toHaveBeenCalled();
    });

    it('reports nothing between a new order of the state and the map drawing it, then the user\'s changes', async () => {
        start();
        await settle();
        // The parent reorders (an action outside the map); the files are rebuilt a moment later
        target.value = stateOf([ORTHO, DSM]);
        await settle();
        rasters.toggleRasterLayerVisible(DSM);
        await settle();
        expect(emit).not.toHaveBeenCalled();

        drawRows([ORTHO, DSM]);
        await settle();
        // The map applied the state to the rebuilt rows: the hidden DSM is back
        expect(rowOf(DSM).visible).toBe(true);
        expect(emit).not.toHaveBeenCalled();
        setRow(DSM, { opacity: 0.5 });
        await settle();
        expect(reported().layers.map(l => l.path)).toEqual([ORTHO, DSM]);
    });

    it('applies the state to layers added by the parent once they are drawn', async () => {
        start();
        await settle();
        const next = stateOf([DSM, ORTHO, DTM]);
        next.layers[2].opacity = 0.25;
        target.value = next;
        await settle();
        expect(emit).not.toHaveBeenCalled();
        drawRows([DSM, ORTHO, DTM]);
        await settle();
        expect(rowOf(DTM).opacity).toBe(0.25);
        expect(emit).not.toHaveBeenCalled();
    });
});

describe('applying the state of the parent', () => {
    it('sets the opacity and the visibility of every row', async () => {
        start();
        await settle();
        const next = stateOf();
        next.layers[0].opacity = 0.6;
        next.layers[1].visible = false;
        target.value = next;
        await settle();
        expect(rowOf(DSM).opacity).toBe(0.6);
        expect(rowOf(ORTHO).visible).toBe(false);
        expect(emit).not.toHaveBeenCalled();
    });

    it('sets the opacity of a lone raster in its row and as the single opacity', async () => {
        start(stateOf([DSM]));
        await settle();
        const next = stateOf([DSM]);
        next.layers[0].opacity = 0.7;
        next.layers[0].visible = false;
        target.value = next;
        await settle();
        expect(rowOf(DSM).opacity).toBe(0.7);
        expect(rowOf(DSM).visible).toBe(false);
        expect(rasters.rasterOpacity.value).toBe(0.7);
    });

    it('sets the plant-health parameters and redraws the layers only when they changed', async () => {
        start();
        await settle();
        const next = stateOf();
        next.layers[1].vizParams = { formula: 'NDVI' };
        target.value = next;
        await settle();
        expect(viz.value[ORTHO]).toEqual({ formula: 'NDVI' });
        expect(refresh).toHaveBeenCalledTimes(1);
        const again = stateOf();
        again.layers[1].vizParams = { formula: 'NDVI' };
        target.value = again;
        await settle();
        expect(refresh).toHaveBeenCalledTimes(1);
        target.value = stateOf();
        await settle();
        expect(viz.value[ORTHO]).toBeUndefined();
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('turns the split on with its dividers, and off', async () => {
        start();
        await settle();
        target.value = stateOf([DSM, ORTHO], { split: { enabled: true, positions: [0.3] } });
        await settle();
        expect(split.splitMode.value).toBe(true);
        expect(split.splitPositions.value).toEqual([0.3]);
        expect(emit).not.toHaveBeenCalled();
        target.value = stateOf();
        await settle();
        expect(split.splitMode.value).toBe(false);
    });

    it('leaves the split alone while the rows are not the layers of the state', async () => {
        start(stateOf(), { draw: [DSM] });
        target.value = stateOf([DSM, ORTHO], { split: { enabled: true, positions: [0.3] } });
        await settle();
        expect(split.splitMode.value).toBe(false);
        drawRows([DSM, ORTHO]);
        await settle();
        expect(split.splitMode.value).toBe(true);
        expect(split.splitPositions.value).toEqual([0.3]);
    });

    it('moves the map to the position, and leaves it where it is for a state without one', async () => {
        start();
        await settle();
        target.value = stateOf([DSM, ORTHO], { view: { center: [100, 200], zoom: 8, rotation: 0.5 } });
        await settle();
        const v = olMap.getView();
        expect([v.getCenter(), v.getZoom(), v.getRotation()]).toEqual([[100, 200], 8, 0.5]);
        target.value = stateOf([DSM, ORTHO], { view: null });
        await settle();
        expect(v.getCenter()).toEqual([100, 200]);
    });

    it('draws the basemap of the state without saving it as the preference', async () => {
        start();
        await settle();
        target.value = stateOf([DSM, ORTHO], { display: { basemap: 'osm' } });
        await settle();
        expect(basemap.selectedBasemap.value).toBe('osm');
        expect(stored()).toBe('satellite');
        expect(emit).not.toHaveBeenCalled();
        // A state without a basemap is the user's preference again
        target.value = stateOf();
        await settle();
        expect(basemap.selectedBasemap.value).toBe('satellite');
    });

    it('chooses the elevation model of the state without a question, once the layers are drawn', async () => {
        start(stateOf([DSM, DTM], { analysis: { target: DTM } }), { draw: null });
        await settle();
        expect(analysis.targetPath.value).toBeNull();
        drawRows([DSM, DTM]);
        await settle();
        expect(analysis.targetPath.value).toBe(DTM);
        expect(confirmDiscard).not.toHaveBeenCalled();
        // It is the state's own model: nothing to report
        expect(emit).not.toHaveBeenCalled();
    });

    it('goes back to the default elevation model when the state has none', async () => {
        start(stateOf([DSM, DTM], { analysis: { target: DTM } }));
        await settle();
        expect(analysis.targetPath.value).toBe(DTM);
        target.value = stateOf([DSM, DTM]);
        await settle();
        expect(analysis.targetPath.value).toBe(DSM);
        expect(emit).not.toHaveBeenCalled();
    });

    it('does not drop unsaved measurements to choose it: the map reports the model it has', async () => {
        dirty = false;
        start(stateOf([DSM, DTM], { analysis: { target: DTM } }), { draw: null });
        dirty = true;
        drawRows([DSM, DTM]);
        await settle();
        expect(analysis.targetPath.value).toBeNull();
        expect(confirmDiscard).not.toHaveBeenCalled();
        expect(reported().analysis).toEqual({ target: null });
    });

    it('does nothing for a map without a state', async () => {
        start();
        target.value = null;
        await settle();
        setRow(DSM, { opacity: 0.1 });
        await settle();
        expect(emit).not.toHaveBeenCalled();
    });

    it('applies the state again on request', async () => {
        const state = stateOf();
        state.layers[0].opacity = 0.5;
        start(state);
        await settle();
        // The parent does not take the report
        emit.mockImplementation(() => {});
        setRow(DSM, { opacity: 0.9 });
        await settle();
        binding.applyView();
        await settle();
        expect(rowOf(DSM).opacity).toBe(0.5);
    });
});

describe('a state that the map has applied', () => {
    it('is not reported back, and the state the parent made from a report is not applied again', async () => {
        start();
        await settle();
        setRow(DSM, { opacity: 0.4 });
        await settle();
        expect(emit).toHaveBeenCalledTimes(1);
        await settle();
        expect(emit).toHaveBeenCalledTimes(1);
        expect(rowOf(DSM).opacity).toBe(0.4);
    });
});

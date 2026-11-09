/**
 * Area statistics: the Area tool draws a rectangle on the map, asks the statistics of the
 * pixels under it and shows them; one map tool at a time, and the measurement toolbar waits
 * while the rectangle is drawn. Inspect reads the value of a pixel and the panel keeps it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer } from 'ol/layer';
import Feature from 'ol/Feature';
import { fromExtent } from 'ol/geom/Polygon';
import { Vector as VectorSource } from 'ol/source';
import Draw, { DrawEvent } from 'ol/interaction/Draw';
import { useRasterAnalysis } from './useRasterAnalysis';

const PATH = 'odm_dem/dsm.tif';

// A 100 x 50 pixel raster on a 1000 x 500 map-unit extent
function setup({ areaStats = vi.fn(async () => ({ min: 1, max: 2, pixelCount: 4 })) } = {}) {
    const map = new Map({ view: new View({ center: [0, 0], zoom: 1 }) });
    const layer = new TileLayer({ extent: [0, 0, 1000, 500] });
    // As createRasterTileLayer stamps it
    layer.file = { path: `ddb://h/o/d/${PATH}`, entry: { path: PATH } };
    map.addLayer(layer);
    const dataset = {
        getRasterValueInfo: vi.fn(async () => ({ width: 100, height: 50, unit: 'm' })),
        getRasterAreaStats: areaStats,
        getRasterPointValue: vi.fn(async (path, x, y) => ({ value: 197.1, x, y, hasGeo: false })),
        getRasterProfile: vi.fn(async () => ({ samples: [] }))
    };
    const measureControls = { source: new VectorSource(), setToolsDisabled: vi.fn(), refreshButtons: vi.fn(), deleteMeasurement: vi.fn() };
    const raster = effectScope().run(() => useRasterAnalysis({
        dataset: () => dataset, map: shallowRef(map), measureControls: () => measureControls,
        rasterLayer: () => null, vizParamsByPath: shallowRef({}),
        refreshRasterLayers: () => () => undefined, onRasterProfileHover: () => undefined
    }));
    raster.openRasterAnalysis(PATH);
    return { map, dataset, measureControls, raster };
}

const drawOf = map => map.getInteractions().getArray().find(i => i instanceof Draw);

// Ends the drawing with a rectangle, as OpenLayers does on the second click
async function drawRectangle(map, extent) {
    drawOf(map).dispatchEvent(new DrawEvent('drawend', new Feature(fromExtent(extent))));
    await vi.waitFor(() => expect(drawOf(map)).toBeUndefined());
}

describe('useRasterAnalysis area statistics', () => {
    let ctx;
    beforeEach(() => { ctx = setup(); });

    it('draws a rectangle with the measurement toolbar disabled until it is drawn', async () => {
        const { map, raster, measureControls } = ctx;
        raster.toggleRasterAreaDrawing();
        expect(raster.rasterAreaDrawing.value).toBe(true);
        expect(drawOf(map)).toBeDefined();
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(true);

        await drawRectangle(map, [100, 300, 205, 405]);
        expect(raster.rasterAreaDrawing.value).toBe(false);
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(false);
        expect(measureControls.setToolsDisabled).toHaveBeenCalledTimes(2);
    });

    it('asks the statistics of the pixels under the rectangle and keeps the answer', async () => {
        const { map, raster, dataset } = ctx;
        raster.toggleRasterAreaDrawing();
        await drawRectangle(map, [100, 300, 205, 405]);
        await vi.waitFor(() => expect(raster.rasterAreaStats.value).toEqual({ min: 1, max: 2, pixelCount: 4 }));
        expect(dataset.getRasterAreaStats).toHaveBeenCalledWith(PATH, 10, 9, 20, 20);
        expect(raster.rasterAreaStatsLoading.value).toBe(false);
        expect(raster.rasterAreaStatsError.value).toBeNull();
    });

    it('says so when the rectangle is beside the raster, without asking', async () => {
        const { map, raster, dataset } = ctx;
        raster.toggleRasterAreaDrawing();
        await drawRectangle(map, [2000, 2000, 2100, 2100]);
        await vi.waitFor(() => expect(raster.rasterAreaStatsError.value).toBe('The rectangle is outside the raster.'));
        expect(dataset.getRasterAreaStats).not.toHaveBeenCalled();
    });

    it('shows a server error of the request, and a no-data hint for a failure of the server', async () => {
        const failing = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('Invalid coordinates'), { status: 400 }))
            .mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { status: 500 }));
        const { raster } = setup({ areaStats: failing });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await raster.queryRasterArea(0, 0, 1, 1);
        expect(raster.rasterAreaStatsError.value).toBe('Invalid coordinates');
        await raster.queryRasterArea(0, 0, 1, 1);
        expect(raster.rasterAreaStatsError.value).toMatch(/only pixels without data/);
        expect(raster.rasterAreaStats.value).toBeNull();
        expect(raster.rasterAreaStatsLoading.value).toBe(false);
    });

    it('Esc stops the drawing and gives the toolbar back', () => {
        const { map, raster, measureControls } = ctx;
        raster.toggleRasterAreaDrawing();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(raster.rasterAreaDrawing.value).toBe(false);
        expect(drawOf(map)).toBeUndefined();
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(false);
    });

    it('Inspect stops the rectangle drawing, and the rectangle drawing stops Inspect', () => {
        const { raster } = ctx;
        raster.toggleRasterAreaDrawing();
        raster.toggleRasterInspect();
        expect(raster.rasterAreaDrawing.value).toBe(false);
        expect(raster.rasterInspectActive.value).toBe(true);
        raster.toggleRasterAreaDrawing();
        expect(raster.rasterInspectActive.value).toBe(false);
        expect(raster.rasterAreaDrawing.value).toBe(true);
    });

    it('clearing removes the rectangle and the statistics; closing the panel removes its layer', async () => {
        const { map, raster } = ctx;
        const layers = () => map.getLayers().getLength();
        const before = layers();
        raster.toggleRasterAreaDrawing();
        await drawRectangle(map, [100, 300, 205, 405]);
        await vi.waitFor(() => expect(raster.rasterAreaStats.value).not.toBeNull());
        expect(layers()).toBe(before + 1);

        raster.handleClearAreaStats();
        expect(raster.rasterAreaStats.value).toBeNull();
        raster.closeRasterAnalysis();
        expect(layers()).toBe(before);
    });

    it('opening another raster drops the statistics of the previous one', async () => {
        const { raster } = ctx;
        await raster.queryRasterArea(0, 0, 1, 1);
        expect(raster.rasterAreaStats.value).not.toBeNull();
        raster.openRasterAnalysis('other.tif');
        expect(raster.rasterAreaStats.value).toBeNull();
    });
});

describe('useRasterAnalysis queryRasterPoint', () => {
    it('keeps the value of the pixel for the panel', async () => {
        const { raster, dataset } = setup();
        const result = await raster.queryRasterPoint(12, 7);
        expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 12, 7);
        expect(raster.rasterSpotInfo.value).toEqual(result);
    });
});

// ---- The gesture rule and the keyboard (FR-RAS-30, FR-XC-17, D-027) ----

const key = (k, on = document.body) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const rightClick = (map, x = 50, y = 50, upX = x, upY = y) => {
    const vp = map.getViewport();
    vp.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 2, bubbles: true }));
    vp.dispatchEvent(new MouseEvent('pointerup', { clientX: upX, clientY: upY, button: 2, bubbles: true }));
};

describe('Inspect from the keyboard (FR-RAS-30)', () => {
    it('Space on the focused map reads the value at the centre of the view', async () => {
        const { map, raster, dataset, measureControls } = setup();
        const target = document.body.appendChild(document.createElement('div'));
        map.setTarget(target);
        map.getView().setCenter([500, 250]);
        raster.toggleRasterInspect();
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(true);
        key(' ', map.getViewport());
        // The centre of a 1000 x 500 extent of a 100 x 50 raster is its pixel (50, 25)
        await vi.waitFor(() => expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 50, 25));
        expect(raster.rasterInspectActive.value).toBe(true);
        raster.toggleRasterInspect();
        map.setTarget(undefined);
        target.remove();
    });

    it('Enter places the point too, and the tool stays for the next one', async () => {
        const { map, raster, dataset } = setup();
        map.getView().setCenter([100, 50]);
        raster.toggleRasterInspect();
        key('Enter');
        await vi.waitFor(() => expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 10, 45));
        map.getView().setCenter([900, 450]);
        key('Enter');
        await vi.waitFor(() => expect(dataset.getRasterPointValue).toHaveBeenCalledTimes(2));
        expect(raster.rasterInspectActive.value).toBe(true);
    });

    it('shows the crosshair while it is on, and Esc ends it and gives the toolbar back', () => {
        const { map, raster, measureControls } = setup();
        raster.toggleRasterInspect();
        expect(map.getViewport().querySelector('.map-crosshair')).not.toBeNull();
        key('Escape');
        expect(raster.rasterInspectActive.value).toBe(false);
        expect(map.getViewport().querySelector('.map-crosshair')).toBeNull();
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(false);
    });
});

describe('Profile from the keyboard and the mouse (FR-RAS-30, D-027)', () => {
    it('Space adds a vertex, Enter finishes the line: one profile measurement, asked of the server', async () => {
        const { map, raster, dataset, measureControls } = setup();
        raster.startRasterProfileDrawing();
        expect(raster.rasterProfileDrawing.value).toBe(true);
        map.getView().setCenter([200, 100]);
        key(' ');
        map.getView().setCenter([300, 200]);
        key(' ');
        key('Enter');
        const features = measureControls.source.getFeatures();
        expect(features).toHaveLength(1);
        expect(features[0].get('measurementType')).toBe('profile');
        expect(features[0].getGeometry().getCoordinates()).toEqual([[200, 100], [300, 200]]);
        expect(raster.rasterProfileDrawing.value).toBe(false);
        await vi.waitFor(() => expect(dataset.getRasterProfile).toHaveBeenCalledTimes(1));
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(false);
        await vi.waitFor(() => expect(drawOf(map)).toBeUndefined());
    });

    it('a right click finishes the line, and a right-drag of 20 px does not', () => {
        const { map, raster, measureControls } = setup();
        raster.startRasterProfileDrawing();
        map.getView().setCenter([200, 100]);
        key(' ');
        map.getView().setCenter([300, 200]);
        key(' ');
        rightClick(map, 50, 50, 70, 50);
        expect(measureControls.source.getFeatures()).toHaveLength(0);
        expect(raster.rasterProfileDrawing.value).toBe(true);
        rightClick(map, 50, 50, 52, 51);
        expect(measureControls.source.getFeatures()).toHaveLength(1);
    });

    it('Esc cancels the line: nothing reaches the measurements, the toolbar is given back', () => {
        const { map, raster, measureControls } = setup();
        raster.startRasterProfileDrawing();
        map.getView().setCenter([200, 100]);
        key(' ');
        map.getView().setCenter([300, 200]);
        key(' ');
        key('Escape');
        expect(measureControls.source.getFeatures()).toHaveLength(0);
        expect(raster.rasterProfileDrawing.value).toBe(false);
        expect(drawOf(map)).toBeUndefined();
        expect(measureControls.setToolsDisabled).toHaveBeenLastCalledWith(false);
        expect(measureControls.setToolsDisabled).toHaveBeenCalledTimes(2);
    });
});

describe('Area from the keyboard (FR-RAS-30)', () => {
    it('Space places the first corner, Enter the opposite one: the statistics of the pixels in between', async () => {
        const { map, raster, dataset } = setup();
        raster.toggleRasterAreaDrawing();
        map.getView().setCenter([100, 300]);
        key(' ');
        map.getView().setCenter([205, 405]);
        key('Enter');
        await vi.waitFor(() => expect(dataset.getRasterAreaStats).toHaveBeenCalledWith(PATH, 10, 9, 20, 20));
        expect(raster.rasterAreaDrawing.value).toBe(false);
    });

    it('Esc after the first corner leaves no rectangle and asks nothing', () => {
        const { map, raster, dataset } = setup();
        raster.toggleRasterAreaDrawing();
        key(' ');
        key('Escape');
        expect(raster.rasterAreaDrawing.value).toBe(false);
        expect(dataset.getRasterAreaStats).not.toHaveBeenCalled();
        expect(drawOf(map)).toBeUndefined();
    });
});

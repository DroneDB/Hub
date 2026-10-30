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
import Draw, { DrawEvent } from 'ol/interaction/Draw';
import { useRasterAnalysis } from './useRasterAnalysis';

const PATH = 'odm_dem/dsm.tif';

// A 100 x 50 pixel raster on a 1000 x 500 map-unit extent
function setup({ areaStats = vi.fn(async () => ({ min: 1, max: 2, pixelCount: 4 })) } = {}) {
    const map = new Map({ view: new View({ center: [0, 0], zoom: 1 }) });
    const layer = new TileLayer({ extent: [0, 0, 1000, 500] });
    layer.entryPath = PATH;
    map.addLayer(layer);
    const dataset = {
        getRasterValueInfo: vi.fn(async () => ({ width: 100, height: 50, unit: 'm' })),
        getRasterAreaStats: areaStats,
        getRasterPointValue: vi.fn(async (path, x, y) => ({ value: 197.1, x, y, hasGeo: false }))
    };
    const measureControls = { source: null, setToolsDisabled: vi.fn() };
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

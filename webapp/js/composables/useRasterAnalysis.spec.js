/**
 * Area statistics: the Area tool draws a rectangle on the map, asks the statistics of the
 * pixels under it and shows them; one map tool at a time, and the measurement toolbar waits
 * while the rectangle is drawn. Inspect reads the value of a pixel and the panel keeps it.
 * Both send map coordinates (WGS 84): the server finds the pixels of the file (U-201, D-021, FR-RAS-02). The expected
 * longitude and latitude of the Web Mercator metres are the ones of the spherical formula, written as literals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer } from 'ol/layer';
import Feature from 'ol/Feature';
import { fromExtent } from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import { Vector as VectorSource } from 'ol/source';
import Draw, { DrawEvent } from 'ol/interaction/Draw';
import { useRasterAnalysis } from './useRasterAnalysis';

const PATH = 'odm_dem/dsm.tif';

// A 100 x 50 pixel raster on a 1000 x 500 map-unit extent
function setup({ areaStats = vi.fn(async () => ({ min: 1, max: 2, pixelCount: 4 })), vizParams = {} } = {}) {
    const map = new Map({ view: new View({ center: [0, 0], zoom: 1 }) });
    const layer = new TileLayer({ extent: [0, 0, 1000, 500] });
    // As createRasterTileLayer stamps it
    layer.file = { path: `ddb://h/o/d/${PATH}`, entry: { path: PATH } };
    map.addLayer(layer);
    const dataset = {
        getRasterValueInfo: vi.fn(async () => ({ width: 100, height: 50, unit: 'm' })),
        getRasterAreaStatsOfWindow: areaStats,
        getRasterPointValue: vi.fn(async (path, x, y) => ({ value: 197.1, x, y, hasGeo: false })),
        getRasterPointValueAt: vi.fn(async (path, lon, lat) => ({ value: 197.1, x: 3, y: 4, lon, lat, hasGeo: true })),
        getRasterProfile: vi.fn(async () => ({ samples: [] }))
    };
    const measureControls = { source: new VectorSource(), setToolsDisabled: vi.fn(), refreshButtons: vi.fn(), deleteMeasurement: vi.fn() };
    const raster = effectScope().run(() => useRasterAnalysis({
        dataset: () => dataset, map: shallowRef(map), measureControls: () => measureControls,
        rasterLayer: () => null, vizParamsByPath: shallowRef(vizParams),
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
        // The window of the rectangle in longitude and latitude, never pixels
        expect(dataset.getRasterAreaStatsOfWindow).toHaveBeenCalledTimes(1);
        const [path, bbox, options] = dataset.getRasterAreaStatsOfWindow.mock.calls[0];
        expect(path).toBe(PATH);
        expect(bbox[0]).toBeCloseTo(0.0008983152841195, 9);
        expect(bbox[1]).toBeCloseTo(0.0026949458513694, 9);
        expect(bbox[2]).toBeCloseTo(0.0018415463324450, 9);
        expect(bbox[3]).toBeCloseTo(0.0036381768982489, 9);
        expect(options).toEqual({ nodata: undefined });
        expect(raster.rasterAreaStatsLoading.value).toBe(false);
        expect(raster.rasterAreaStatsError.value).toBeNull();
    });

    it('asks the server for a rectangle beside the raster too: it answers that it is outside', async () => {
        const outside = vi.fn().mockRejectedValue(Object.assign(new Error('No valid data in the area: it is outside the raster'), { status: 400 }));
        const { map, raster } = setup({ areaStats: outside });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        raster.toggleRasterAreaDrawing();
        await drawRectangle(map, [2000, 2000, 2100, 2100]);
        await vi.waitFor(() => expect(raster.rasterAreaStatsError.value).toBe('No valid data in the area: it is outside the raster'));
        expect(outside).toHaveBeenCalledTimes(1);
    });

    it('sends the NoData value of the layer with the window', async () => {
        const { map, raster, dataset } = setup({ vizParams: { [PATH]: { colormap: 'ironbow', nodata: 0 } } });
        raster.toggleRasterAreaDrawing();
        await drawRectangle(map, [100, 300, 205, 405]);
        await vi.waitFor(() => expect(dataset.getRasterAreaStatsOfWindow).toHaveBeenCalled());
        expect(dataset.getRasterAreaStatsOfWindow.mock.calls[0][2]).toEqual({ nodata: 0 });
    });

    it('shows a server error of the request, and a no-data hint for a failure of the server', async () => {
        const failing = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('Invalid coordinates'), { status: 400 }))
            .mockRejectedValueOnce(Object.assign(new Error('Internal server error'), { status: 500 }));
        const { raster } = setup({ areaStats: failing });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await raster.queryRasterArea([0, 0, 1, 1]);
        expect(raster.rasterAreaStatsError.value).toBe('Invalid coordinates');
        await raster.queryRasterArea([0, 0, 1, 1]);
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
        await raster.queryRasterArea([0, 0, 1, 1]);
        expect(raster.rasterAreaStats.value).not.toBeNull();
        raster.openRasterAnalysis('other.tif');
        expect(raster.rasterAreaStats.value).toBeNull();
    });
});

describe('useRasterAnalysis queryRasterPoint', () => {
    it('keeps the value of the pixel for the panel', async () => {
        const { raster, dataset } = setup();
        const result = await raster.queryRasterPoint(12, 7);
        expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 12, 7, { nodata: undefined });
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
        // The centre of the view (500 m, 250 m), in longitude and latitude: the server finds the pixel
        await vi.waitFor(() => expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(1));
        const [path, lon, lat] = dataset.getRasterPointValueAt.mock.calls[0];
        expect(path).toBe(PATH);
        expect(lon).toBeCloseTo(0.0044915764205976, 9);
        expect(lat).toBeCloseTo(0.0022457882097268, 9);
        expect(dataset.getRasterPointValue).not.toHaveBeenCalled();
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
        // (100 m, 50 m) and then (900 m, 450 m), in longitude and latitude
        await vi.waitFor(() => expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(1));
        expect(dataset.getRasterPointValueAt.mock.calls[0][1]).toBeCloseTo(0.0008983152841195, 9);
        expect(dataset.getRasterPointValueAt.mock.calls[0][2]).toBeCloseTo(0.0004491576420624, 9);
        map.getView().setCenter([900, 450]);
        key('Enter');
        await vi.waitFor(() => expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(2));
        expect(dataset.getRasterPointValueAt.mock.calls[1][1]).toBeCloseTo(0.0080848375570757, 9);
        expect(dataset.getRasterPointValueAt.mock.calls[1][2]).toBeCloseTo(0.0040424187751903, 9);
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
    it('Space places the first corner, Enter the opposite one: the statistics of the window in between', async () => {
        const { map, raster, dataset } = setup();
        raster.toggleRasterAreaDrawing();
        map.getView().setCenter([100, 300]);
        key(' ');
        map.getView().setCenter([205, 405]);
        key('Enter');
        // The corners (100 m, 300 m) and (205 m, 405 m) in longitude and latitude
        await vi.waitFor(() => expect(dataset.getRasterAreaStatsOfWindow).toHaveBeenCalledTimes(1));
        const [path, bbox] = dataset.getRasterAreaStatsOfWindow.mock.calls[0];
        expect(path).toBe(PATH);
        expect(bbox[0]).toBeCloseTo(0.0008983152841195, 9);
        expect(bbox[1]).toBeCloseTo(0.0026949458513694, 9);
        expect(bbox[2]).toBeCloseTo(0.0018415463324450, 9);
        expect(bbox[3]).toBeCloseTo(0.0036381768982489, 9);
        expect(raster.rasterAreaDrawing.value).toBe(false);
    });

    it('Esc after the first corner leaves no rectangle and asks nothing', () => {
        const { map, raster, dataset } = setup();
        raster.toggleRasterAreaDrawing();
        key(' ');
        key('Escape');
        expect(raster.rasterAreaDrawing.value).toBe(false);
        expect(dataset.getRasterAreaStatsOfWindow).not.toHaveBeenCalled();
        expect(drawOf(map)).toBeUndefined();
    });
});

describe('useRasterAnalysis queryRasterPointAt', () => {
    // The map is in Web Mercator: (505 m, 255 m) is longitude 0.0045364921848036, latitude 0.0022907039739066
    it('asks the value at the map coordinate in longitude and latitude, never a pixel, and keeps the answer', async () => {
        const { raster, dataset } = setup();
        const result = await raster.queryRasterPointAt([505, 255]);
        expect(dataset.getRasterPointValue).not.toHaveBeenCalled();
        expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(1);
        const [path, lon, lat, options] = dataset.getRasterPointValueAt.mock.calls[0];
        expect(path).toBe(PATH);
        expect(lon).toBeCloseTo(0.0045364921848036, 9);
        expect(lat).toBeCloseTo(0.0022907039739066, 9);
        expect(options).toEqual({ nodata: undefined });
        expect(raster.rasterSpotInfo.value).toEqual(result);
    });

    it('sends the NoData value of the layer', async () => {
        const { raster, dataset } = setup({ vizParams: { [PATH]: { nodata: 0 } } });
        await raster.queryRasterPointAt([505, 255]);
        expect(dataset.getRasterPointValueAt.mock.calls[0][3]).toEqual({ nodata: 0 });
    });

    it('Inspect on a click inside the raster asks the server; beside the raster it does not ask', async () => {
        const { map, raster, dataset } = setup();
        raster.toggleRasterInspect();
        // A click ends the point of the drawing session (FR-RAS-30), as OpenLayers does
        const click = coordinate => drawOf(map).dispatchEvent(new DrawEvent('drawend', new Feature(new Point(coordinate))));
        click([505, 255]);
        await vi.waitFor(() => expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(1));
        click([5000, 255]);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(dataset.getRasterPointValueAt).toHaveBeenCalledTimes(1);
    });
});

describe('useRasterAnalysis queryRasterPoint (an R-JPEG: pixels of its raw thermal grid)', () => {
    it('keeps the value of the pixel for the panel', async () => {
        const { raster, dataset } = setup();
        const result = await raster.queryRasterPoint(12, 7);
        expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 12, 7, { nodata: undefined });
        expect(raster.rasterSpotInfo.value).toEqual(result);
    });

    it('sends the NoData value of the layer with the pixel', async () => {
        const { raster, dataset } = setup({ vizParams: { [PATH]: { nodata: -9999 } } });
        await raster.queryRasterPoint(12, 7);
        expect(dataset.getRasterPointValue).toHaveBeenCalledWith(PATH, 12, 7, { nodata: -9999 });
    });
});

describe('useRasterAnalysis profile', () => {
    it('sends the NoData value of the layer with the line', async () => {
        const { raster, dataset } = setup({ vizParams: { [PATH]: { nodata: 0 } } });
        await raster.queryRasterProfile([[0, 0], [1, 1]], 32);
        expect(dataset.getRasterProfile).toHaveBeenCalledWith(PATH, { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, 32, { nodata: 0 });
    });
});

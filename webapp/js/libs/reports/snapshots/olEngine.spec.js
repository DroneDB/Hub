/**
 * The OpenLayers side of a snapshot: the layers a plan makes (basemap with crossOrigin 'anonymous', the cover view's
 * rasters with their opacity and parameters, the items), where the view looks, how the canvases of a map are put on one,
 * and that the map is drawn until rendercomplete (with a timeout and an abort) and gone afterwards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maps = [];
vi.mock('ol/Map', () => ({
    default: class FakeMap {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.target = options.target;
            this.disposed = false;
            maps.push(this);
        }
        updateSize() {}
        on(type, fn) { (this.handlers[type] ||= []).push(fn); }
        un(type, fn) { this.handlers[type] = (this.handlers[type] || []).filter(f => f !== fn); }
        render() { FakeMap.onRender?.(this); }
        fire(type) { [...(this.handlers[type] || [])].forEach(fn => fn({})); }
        getViewport() { return { querySelectorAll: () => [] }; }
        setTarget(target) { this.target = target; }
        dispose() { this.disposed = true; }
    }
}));

import OlMap from 'ol/Map';
import ddb from 'ddb';
import { buildLayers, viewTarget, canvasMatrix, drawWithOpenLayers, compositeCanvases } from './olEngine';

const square = { type: 'Polygon', coordinates: [[[10, 45], [10.001, 45], [10.001, 45.001], [10, 45.001], [10, 45]]] };
const raster = (name, opacity, vizParams = null) => ({
    file: { path: `ddb://hub.example.com/o/d/${name}`, entry: { path: name, hash: 'h', type: ddb.entry.type.GEORASTER, polygon_geom: square, properties: {} } },
    opacity, vizParams
});
const plan = (extra = {}) => ({
    width: 400, height: 250, frame: [10, 45, 10.001, 45.001], view: null,
    rasters: [raster('bottom.tif', 1), raster('top.tif', 0.5, { formula: 'NDVI', colormap: 'rdylgn' })],
    basemap: { name: 'osm' },
    items: [{ id: 'a', ref: '1', colour: '#000', geometry: { type: 'Point', coordinates: [10, 45] } }],
    itemId: null, ...extra
});

describe('buildLayers', () => {
    it('stacks the basemap, the rasters bottom first, then the items', () => {
        const layers = buildLayers(plan());
        expect(layers.all).toHaveLength(1 + 2 + 1);
        expect(layers.all[0]).toBe(layers.basemap);
        expect(layers.all.slice(1, 3)).toEqual(layers.rasters);
        expect(layers.all[3]).toBe(layers.items[0]);
        expect(layers.rasters.map(l => l.file.path.split('/').pop())).toEqual(['bottom.tif', 'top.tif']);
    });

    it('draws each raster with the opacity and the visualisation parameters of the cover view, at 1x', () => {
        const { rasters } = buildLayers(plan());
        expect(rasters.map(l => l.getOpacity())).toEqual([1, 0.5]);
        expect(rasters[0].getSource().vizParams).toBeNull();
        expect(rasters[1].getSource().vizParams).toEqual({ formula: 'NDVI', colormap: 'rdylgn' });
        expect(rasters.every(l => l.getSource().getTilePixelRatio(1) === 1)).toBe(true);
    });

    it('gets the basemap from the factory with crossOrigin anonymous', () => {
        const { basemap } = buildLayers(plan());
        expect(basemap.getSource().getUrls()[0]).toContain('openstreetmap');
        expect(basemap.getSource().crossOrigin).toBe('anonymous');
    });

    it('has no basemap layer without one in the plan', () => {
        const layers = buildLayers(plan({ basemap: null }));
        expect(layers.basemap).toBeNull();
        expect(layers.all).toHaveLength(3);
    });

    it('draws the other items at 40 % under the item of an item snapshot', () => {
        const layers = buildLayers(plan({ itemId: 'a' }));
        expect(layers.items.map(l => l.getOpacity())).toEqual([0.4, 1]);
    });
});

describe('viewTarget', () => {
    it('looks at the frame of the plan', () => {
        const { extent } = viewTarget(plan());
        expect(extent[0]).toBeCloseTo(1113194.9, 0);
    });

    it('looks at the position of the cover view when there is no frame', () => {
        expect(viewTarget(plan({ frame: null, view: { center: [1, 2], zoom: 7 } }))).toEqual({ center: [1, 2], zoom: 7, rotation: 0 });
    });

    it('looks at the layers when there is neither, and at the world when there is nothing', () => {
        const layers = viewTarget(plan({ frame: null }));
        expect(layers.extent[2]).toBeGreaterThan(layers.extent[0]);
        expect(layers.extent[2] - layers.extent[0]).toBeLessThan(1000);
        const world = viewTarget(plan({ frame: null, rasters: [] }));
        expect(world.extent[2] - world.extent[0]).toBeGreaterThan(30000000);
    });
});

describe('canvasMatrix', () => {
    it('reads the transform OpenLayers gave the canvas, else scales it to its style size', () => {
        expect(canvasMatrix({ style: { transform: 'matrix(0.5, 0, 0, 0.5, 10, 20)' }, width: 100, height: 100 })).toEqual([0.5, 0, 0, 0.5, 10, 20]);
        expect(canvasMatrix({ style: { transform: '', width: '50px', height: '25px' }, width: 100, height: 100 })).toEqual([0.5, 0, 0, 0.25, 0, 0]);
    });
});

describe('compositeCanvases', () => {
    it('draws the canvases of a map in order, each with the opacity of its layer', () => {
        const drawn = [];
        const ctx = { fillRect() {}, setTransform: (...m) => drawn.push(['matrix', ...m]), drawImage: c => drawn.push(['draw', c.id, ctx.globalAlpha]) };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
        const layerCanvas = (id, opacity) => ({ id, width: 10, height: 10, style: { transform: 'matrix(1, 0, 0, 1, 0, 0)', opacity: '' }, parentNode: { style: { opacity } } });
        const viewport = { querySelectorAll: () => [layerCanvas('basemap', ''), layerCanvas('top', '0.4'), { id: 'empty', width: 0, style: {}, parentNode: { style: {} } }] };
        const out = compositeCanvases(viewport, 40, 25);
        expect(out.width).toBe(40);
        expect(out.height).toBe(25);
        expect(drawn.filter(d => d[0] === 'draw')).toEqual([['draw', 'basemap', 1], ['draw', 'top', 0.4]]);
        vi.restoreAllMocks();
    });
});

describe('drawWithOpenLayers', () => {
    beforeEach(() => {
        maps.length = 0;
        const ctx = { fillRect() {}, setTransform() {}, drawImage() {} };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    });
    afterEach(() => {
        OlMap.onRender = undefined;
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('waits for rendercomplete, hands back a canvas of the size of the snapshot and takes the map away', async () => {
        OlMap.onRender = map => setTimeout(() => map.fire('rendercomplete'), 5);
        const drawn = await drawWithOpenLayers(plan(), {});
        const [map] = maps;
        expect(drawn.canvas.width).toBe(400);
        expect(drawn.canvas.height).toBe(250);
        expect(drawn.basemapFailed).toBe(false);
        expect(drawn.attribution).toContain('OpenStreetMap');
        // The map is offscreen at the size of the snapshot, has no controls, and is gone with its div
        expect(map.options.pixelRatio).toBe(1);
        expect(map.options.controls).toEqual([]);
        expect(map.disposed).toBe(true);
        expect(document.body.contains(map.options.target)).toBe(false);
        expect(map.options.target.style.width).toBe('400px');
        drawn.dispose();
        expect(drawn.canvas.width).toBe(0);
    });

    it('says the basemap failed when a tile of it did not load', async () => {
        OlMap.onRender = map => {
            const basemap = map.options.layers[0].getSource();
            basemap.dispatchEvent('tileloaderror');
            setTimeout(() => map.fire('rendercomplete'), 1);
        };
        expect((await drawWithOpenLayers(plan(), {})).basemapFailed).toBe(true);
    });

    it('does not draw for an aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(drawWithOpenLayers(plan(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(maps).toHaveLength(0);
    });

    it('rejects when the signal aborts while it draws, and still takes the map away', async () => {
        const controller = new AbortController();
        OlMap.onRender = () => setTimeout(() => controller.abort(), 1);
        await expect(drawWithOpenLayers(plan(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(maps[0].disposed).toBe(true);
    });

    it('gives up after the timeout', async () => {
        await expect(drawWithOpenLayers(plan(), { timeoutMs: 20 })).rejects.toThrow('did not finish drawing');
        expect(maps[0].disposed).toBe(true);
    });
});

import { describe, it, expect, vi } from 'vitest';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import { get as getProjection } from 'ol/proj';
import TileState from 'ol/TileState';
import { createXYZ } from 'ol/tilegrid';
import ddb from 'ddb';
import { ViewZoomCap, rasterLayerPath, createRasterTileLayer, POINT_CLOUD_EXTENT_PAD } from './rasterLayers';
import { OL_DEFAULT_MAX_ZOOM, SOURCE_MIN_ZOOM } from './rasterZoom';
import { mercatorExtent } from './fileLayers';

function fakeMap({ busy = false } = {}) {
    const handlers = [];
    const view = {
        busy,
        setMaxZoom: vi.fn(),
        getAnimating: () => view.busy,
        getInteracting: () => false,
        once: (type, fn) => { handlers.push(fn); return { type, fn }; },
        fireMoveEnd: () => handlers.splice(0).forEach(fn => fn())
    };
    return { view, map: { getView: () => view } };
}

const raster = native => {
    const l = new TileLayer();
    l.set('rasterNativeZoom', native);
    return l;
};
const flush = () => new Promise(r => queueMicrotask(r));

describe('ViewZoomCap', () => {
    it('applies one cap per burst of layer changes', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        const cap = new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(18));
        group.getLayers().push(raster(20));
        await flush();
        expect(view.setMaxZoom).toHaveBeenCalledTimes(1);
        expect(view.setMaxZoom.mock.calls[0][0]).toBeGreaterThanOrEqual(20);
        cap.dispose();
    });

    it('never caps below the tile source minimum and resets without rasters', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        const cap = new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(3));
        await flush();
        expect(view.setMaxZoom).toHaveBeenLastCalledWith(SOURCE_MIN_ZOOM);
        group.getLayers().pop();
        await flush();
        expect(view.setMaxZoom).toHaveBeenLastCalledWith(OL_DEFAULT_MAX_ZOOM);
        cap.dispose();
    });

    it('waits for the view to settle', async () => {
        const { map, view } = fakeMap({ busy: true });
        const group = new LayerGroup();
        new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(18));
        await flush();
        expect(view.setMaxZoom).not.toHaveBeenCalled();
        view.busy = false;
        view.fireMoveEnd();
        expect(view.setMaxZoom).toHaveBeenCalledTimes(1);
    });

    it('stops listening after dispose', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        new ViewZoomCap(map, [group]).dispose();
        group.getLayers().push(raster(18));
        await flush();
        expect(view.setMaxZoom).not.toHaveBeenCalled();
    });
});

describe('rasterLayerPath', () => {
    it('is the dataset path of the file a raster tile layer shows, null for another layer', () => {
        const layer = new TileLayer();
        layer.file = { path: 'ddb://h/o/d/odm_dem/dsm.tif', entry: { path: 'odm_dem/dsm.tif' } };
        expect(rasterLayerPath(layer)).toBe('odm_dem/dsm.tif');
        expect(rasterLayerPath(new TileLayer())).toBeNull();
        expect(rasterLayerPath(null)).toBeNull();
    });
});

describe('createRasterTileLayer', () => {
    const webMercator = getProjection('EPSG:3857');
    // The footprint libddb gives a cloud of one point (five times the same corner), and a square of about 110 m
    const onePoint = { type: 'Polygon', coordinates: [[[10, 45], [10, 45], [10, 45], [10, 45], [10, 45]]] };
    const square = { type: 'Polygon', coordinates: [[[10, 45], [10.001, 45], [10.001, 45.001], [10, 45.001], [10, 45]]] };
    const layerOf = (type, polygon) => createRasterTileLayer(
        { path: 'ddb://hub.example.com/o/d/f', entry: { path: 'f', hash: 'h', type, polygon_geom: polygon, properties: {} } },
        mercatorExtent(polygon));
    const standard = createXYZ({ extent: webMercator.getExtent(), tileSize: 256, maxZoom: 22 });
    // The tile of the standard XYZ grid at zoom z that holds `coordinate`, and its state in the layer's source
    const tileAt = (layer, coordinate, z, dx = 0) => {
        const [, x, y] = standard.getTileCoordForCoordAndZ(coordinate, z);
        return layer.getSource().getTile(z, x + dx, y, 1, webMercator).getState();
    };

    it('asks for the tile of a cloud of one point, at every zoom, and for none of its neighbours', () => {
        const layer = layerOf(ddb.entry.type.POINTCLOUD, onePoint);
        const point = mercatorExtent(onePoint).slice(0, 2);
        for (const z of [SOURCE_MIN_ZOOM, 18, 22]) {
            expect(tileAt(layer, point, z)).not.toBe(TileState.EMPTY);
            expect(tileAt(layer, point, z, 1)).toBe(TileState.EMPTY);
            expect(tileAt(layer, point, z, -1)).toBe(TileState.EMPTY);
        }
    });

    it('addresses the tiles of a point cloud on the standard XYZ grid', () => {
        const grid = layerOf(ddb.entry.type.POINTCLOUD, square).getSource().getTileGrid();
        expect(grid.getResolutions()).toEqual(standard.getResolutions().slice(0, grid.getResolutions().length));
        expect(grid.getOrigin(SOURCE_MIN_ZOOM)).toEqual(standard.getOrigin(SOURCE_MIN_ZOOM));
        expect(grid.getMinZoom()).toBe(SOURCE_MIN_ZOOM);
    });

    it('draws a point cloud past its footprint (the discs on its edge), a raster only on its footprint', () => {
        const footprint = mercatorExtent(square);
        const cloud = layerOf(ddb.entry.type.POINTCLOUD, square).getExtent();
        cloud.forEach((v, i) => expect(v).toBeCloseTo(footprint[i] + (i < 2 ? -1 : 1) * POINT_CLOUD_EXTENT_PAD, 6));
        const raster = layerOf(ddb.entry.type.GEORASTER, square);
        expect(raster.getExtent()).toEqual(footprint);
        // A raster keeps the standard grid of the source
        expect(raster.getSource().getTileGrid().getExtent()).toEqual(webMercator.getExtent());
    });
});

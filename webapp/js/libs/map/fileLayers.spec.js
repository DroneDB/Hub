import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { FileLayers, mercatorExtent } from './fileLayers';
import { POINT_CLOUD_EXTENT_PAD } from './rasterLayers';
import { INITIAL_RESOLUTION, SOURCE_MIN_ZOOM } from './rasterZoom';

const square = { type: 'Polygon', coordinates: [[[10, 45], [10.001, 45], [10.001, 45.001], [10, 45.001], [10, 45]]] };
const raster = (path, hash = 'h') => ({
    path: `ddb://hub.example.com/o/d/${path}`,
    entry: { path, hash, type: ddb.entry.type.GEORASTER, polygon_geom: square, properties: {} }
});
const build = (fl, files) => fl.build(files, { shotStyle: 'shot' });
const rasterLayers = fl => fl.rasters.getLayers().getArray();

describe('FileLayers rasters', () => {
    it('keeps the layer (and its loaded tiles) of a raster that stays on show', () => {
        const fl = new FileLayers();
        build(fl, [raster('a.tif'), raster('b.tif')]);
        const [a, b] = rasterLayers(fl);
        const aSource = a.getSource();
        build(fl, [raster('b.tif'), raster('a.tif'), raster('c.tif')]);
        const [b2, a2, c] = rasterLayers(fl);
        expect(a2).toBe(a);
        expect(b2).toBe(b);
        expect(a2.getSource()).toBe(aSource);
        expect(c.file.entry.path).toBe('c.tif');
    });

    it('builds a new layer when the file content changed', () => {
        const fl = new FileLayers();
        build(fl, [raster('a.tif', 'h1')]);
        const [a] = rasterLayers(fl);
        build(fl, [raster('a.tif', 'h2')]);
        expect(rasterLayers(fl)[0]).not.toBe(a);
    });

    it('does not touch the group when nothing changed', () => {
        const fl = new FileLayers();
        build(fl, [raster('a.tif')]);
        let changes = 0;
        fl.rasters.getLayers().on('remove', () => changes++);
        build(fl, [raster('a.tif')]);
        expect(changes).toBe(0);
    });

    it('keeps a slot for a placeholder file, in file order', () => {
        const fl = new FileLayers();
        build(fl, [raster('a.tif'), { path: 'x', entry: null, placeholder: { path: 'gone.tif', kind: 'missing', text: 'Missing' } }, raster('b.tif')]);
        expect(fl.rasterSlots.map(s => (s.olLayer ? s.file.entry.path : s.file.placeholder.path))).toEqual(['a.tif', 'gone.tif', 'b.tif']);
        expect(rasterLayers(fl)).toHaveLength(2);
    });
});

describe('FileLayers point clouds', () => {
    // The footprint libddb gives a cloud of one point: five times the same corner
    const onePoint = { type: 'Polygon', coordinates: [[[10, 45], [10, 45], [10, 45], [10, 45], [10, 45]]] };
    const cloud = (path, polygon) => ({
        path: `ddb://hub.example.com/o/d/${path}`,
        entry: { path, hash: path, type: ddb.entry.type.POINTCLOUD, polygon_geom: polygon, properties: {} }
    });
    // A point at the edge of the footprint is drawn up to 3 px past it, in the pixels of the coarsest (z14, 256 px) tiles
    const reachAtCoarsestTiles = 3 * INITIAL_RESOLUTION / 2 ** SOURCE_MIN_ZOOM;

    it('draws a cloud of one point: its layer extent has an area around the point', () => {
        const fl = new FileLayers();
        build(fl, [cloud('one.laz', onePoint)]);
        const [layer] = rasterLayers(fl);
        const [x, y] = mercatorExtent(onePoint);
        const [minX, minY, maxX, maxY] = layer.getExtent();
        expect(maxX - minX).toBeGreaterThan(0);
        expect(maxY - minY).toBeGreaterThan(0);
        expect(minX).toBeLessThanOrEqual(x - reachAtCoarsestTiles);
        expect(maxX).toBeGreaterThanOrEqual(x + reachAtCoarsestTiles);
        expect(minY).toBeLessThanOrEqual(y - reachAtCoarsestTiles);
        expect(maxY).toBeGreaterThanOrEqual(y + reachAtCoarsestTiles);
    });

    it('keeps the discs on the edge of a cloud, and no more: the footprint plus the disc reach of the coarsest tiles', () => {
        const fl = new FileLayers();
        build(fl, [cloud('c.laz', square)]);
        const footprint = mercatorExtent(square);
        const extent = rasterLayers(fl)[0].getExtent();
        expect(POINT_CLOUD_EXTENT_PAD).toBeCloseTo(reachAtCoarsestTiles, 6);
        expect(POINT_CLOUD_EXTENT_PAD).toBeLessThan(30);
        extent.forEach((v, i) => expect(v).toBeCloseTo(footprint[i] + (i < 2 ? -1 : 1) * POINT_CLOUD_EXTENT_PAD, 6));
    });

    it('lets a click on the drawn discs select the cloud, and fits the map to its footprint (a point: no size)', () => {
        const fl = new FileLayers();
        build(fl, [cloud('one.laz', onePoint)]);
        const layerExtent = rasterLayers(fl)[0].getExtent();
        expect(fl.extentFeatures.getFeatures()[0].getGeometry().getExtent()).toEqual(layerExtent);
        // The fit of a map stops at a set scale for an extent with no size (MapCore's fileFitOptions)
        const [x, y] = mercatorExtent(onePoint);
        expect(fl.extent()).toEqual([x, y, x, y]);
    });

    it('clips a georaster to its footprint, as before', () => {
        const fl = new FileLayers();
        build(fl, [raster('a.tif')]);
        expect(rasterLayers(fl)[0].getExtent()).toEqual(mercatorExtent(square));
    });
});

describe('mercatorExtent', () => {
    it('frames a polygon that reaches the South Pole on the world, not on hundreds of world heights south', () => {
        const world = { type: 'Polygon', coordinates: [[[-180, -90], [180, -90], [180, 83.6], [-180, 83.6], [-180, -90]]] };
        const [minX, minY, maxX, maxY] = mercatorExtent(world);
        const half = 20037508.342789244;
        expect([minX, minY, maxX, maxY].every(Number.isFinite)).toBe(true);
        expect(minY).toBeGreaterThanOrEqual(-half - 1);
        expect(maxY).toBeLessThanOrEqual(half + 1);
        expect(maxX - minX).toBeCloseTo(2 * half, 0);
    });
});

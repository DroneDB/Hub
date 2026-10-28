import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { FileLayers } from './fileLayers';

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

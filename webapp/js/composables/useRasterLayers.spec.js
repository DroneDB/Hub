import { describe, it, expect, beforeEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import ddb from 'ddb';
import { useRasterLayers } from './useRasterLayers';

const entry = path => ({ path, type: ddb.entry.type.GEORASTER, properties: {} });

function setup({ split = false, perRow = false } = {}) {
    const group = shallowRef(new LayerGroup());
    const splitMode = { value: split };
    const rasters = effectScope().run(() => useRasterLayers({
        group, vectorLayers: shallowRef([]), splitMode: () => splitMode.value, perRow: () => perRow
    }));
    return { rasters, group, splitMode };
}

// Slots in file order, the way the file layers build them: the group holds their layers in that order
function slotsOf(group, ...paths) {
    const slots = paths.map(path => ({ file: { entry: entry(path) }, olLayer: layerOf(path) }));
    group.value.getLayers().clear();
    slots.forEach(s => group.value.getLayers().push(s.olLayer));
    return slots;
}

const layers = new Map();
function layerOf(path) {
    if (!layers.has(path)) {
        const layer = new TileLayer();
        layer.set('rasterPath', path);
        // The path the rows are matched to the layers by
        layer.file = { entry: entry(path) };
        layers.set(path, layer);
    }
    return layers.get(path);
}
const order = group => group.value.getLayers().getArray().map(l => l.get('rasterPath'));
const paths = rasters => rasters.rasterLayerList.value.map(r => r.path);

describe('useRasterLayers', () => {
    beforeEach(() => layers.clear());

    it('lists the slots top first, with names that tell same-named files apart', () => {
        const { rasters } = setup();
        const a = new TileLayer();
        const b = new TileLayer();
        rasters.syncRasterLayers([
            { file: { entry: entry('2024/ortho.tif') }, olLayer: a },
            { file: { entry: entry('2025/ortho.tif') }, olLayer: b }
        ]);
        expect(rasters.rasterLayerList.value.map(r => r.name)).toEqual(['2025/ortho.tif', '2024/ortho.tif']);
    });

    it('keeps a row for a placeholder slot', () => {
        const { rasters } = setup();
        rasters.syncRasterLayers([
            { file: { entry: entry('a.tif') }, olLayer: new TileLayer() },
            { file: { entry: null, placeholder: { path: 'gone/b.tif', kind: 'missing', text: 'Missing: gone/b.tif' } }, olLayer: null }
        ]);
        const [top] = rasters.rasterLayerList.value;
        expect(top).toMatchObject({ path: 'gone/b.tif', olLayer: null, plantHealthCapable: false, placeholder: { kind: 'missing' } });
    });

    it('reorders the drawn layers and skips placeholders in the map', () => {
        const { rasters, group } = setup();
        const a = new TileLayer();
        rasters.syncRasterLayers([
            { file: { entry: entry('a.tif') }, olLayer: a },
            { file: { entry: null, placeholder: { path: 'b.tif', kind: 'missing', text: '' } }, olLayer: null }
        ]);
        rasters.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
        expect(rasters.rasterLayerList.value.map(r => r.path)).toEqual(['a.tif', 'b.tif']);
        expect(group.value.getLayers().getArray()).toEqual([a]);
    });

    describe('visibility', () => {
        it('starts shown, and a rebuild keeps what the user hid and the opacity of each layer', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            expect(rasters.rasterLayerList.value.map(r => r.visible)).toEqual([true, true]);

            rasters.toggleRasterLayerVisible('b.tif');
            rasters.rasterLayerList.value = rasters.rasterLayerList.value.map(r => (r.path === 'b.tif' ? { ...r, opacity: 0.4 } : r));
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'));

            const rows = Object.fromEntries(rasters.rasterLayerList.value.map(r => [r.path, r]));
            expect(rows['b.tif']).toMatchObject({ visible: false, opacity: 0.4 });
            expect(rows['a.tif'].visible).toBe(true);
            expect(rows['c.tif']).toMatchObject({ visible: true, opacity: 1 });
        });

        it('hides the OpenLayers layer of a hidden row and leaves its opacity value', async () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            rasters.rasterLayerList.value = rasters.rasterLayerList.value.map(r => (r.path === 'b.tif' ? { ...r, opacity: 0.6 } : r));
            rasters.updateRastersOpacity();

            rasters.toggleRasterLayerVisible('b.tif');
            rasters.updateRastersOpacity();

            expect(layerOf('b.tif').getVisible()).toBe(false);
            expect(layerOf('a.tif').getVisible()).toBe(true);
            expect(rasters.rasterLayerList.value.find(r => r.path === 'b.tif').opacity).toBe(0.6);

            rasters.toggleRasterLayerVisible('b.tif');
            rasters.updateRastersOpacity();
            expect(layerOf('b.tif').getVisible()).toBe(true);
            expect(layerOf('b.tif').getOpacity()).toBe(0.6);
        });

        it('shows every layer in split compare and applies the rows again when it ends', () => {
            const { rasters, group, splitMode } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            rasters.toggleRasterLayerVisible('b.tif');
            rasters.updateRastersOpacity();
            expect(layerOf('b.tif').getVisible()).toBe(false);

            splitMode.value = true;
            rasters.updateRastersOpacity();
            expect(layerOf('b.tif').getVisible()).toBe(true);
            expect(layerOf('b.tif').getOpacity()).toBe(1);
            expect(rasters.rasterLayerList.value.find(r => r.path === 'b.tif').visible).toBe(false);

            splitMode.value = false;
            rasters.updateRastersOpacity();
            expect(layerOf('b.tif').getVisible()).toBe(false);
        });

        it('shows the only layer of the map even when its row was hidden before the others went', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            rasters.toggleRasterLayerVisible('b.tif');
            rasters.syncRasterLayers(slotsOf(group, 'b.tif'));
            rasters.updateRastersOpacity();
            expect(layerOf('b.tif').getVisible()).toBe(true);
        });
    });

    describe('a lone raster', () => {
        it('shows whatever its row says on the dataset map: the global opacity is its only control', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif'));
            rasters.rasterOpacity.value = 0.7;
            rasters.rasterLayerList.value = [{ ...rasters.rasterLayerList.value[0], opacity: 0.2, visible: false }];
            rasters.updateRastersOpacity();
            expect(layerOf('a.tif').getVisible()).toBe(true);
            expect(layerOf('a.tif').getOpacity()).toBe(0.7);
        });

        it('has its own opacity and eye in a view, where its row is in the panel', () => {
            const { rasters, group } = setup({ perRow: true });
            rasters.syncRasterLayers(slotsOf(group, 'a.tif'));
            rasters.rasterOpacity.value = 0.7;
            rasters.rasterLayerList.value = [{ ...rasters.rasterLayerList.value[0], opacity: 0.2 }];
            rasters.updateRastersOpacity();
            expect(layerOf('a.tif').getOpacity()).toBe(0.2);

            rasters.toggleRasterLayerVisible('a.tif');
            rasters.updateRastersOpacity();
            expect(layerOf('a.tif').getVisible()).toBe(false);
            rasters.toggleRasterLayerVisible('a.tif');
            rasters.updateRastersOpacity();
            expect(layerOf('a.tif').getVisible()).toBe(true);
        });
    });

    describe('order across rebuilds', () => {
        it('puts the rows in the order of the files when the order is not kept', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            rasters.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
            expect(paths(rasters)).toEqual(['a.tif', 'b.tif']);

            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'));
            expect(paths(rasters)).toEqual(['b.tif', 'a.tif']);
            expect(order(group)).toEqual(['a.tif', 'b.tif']);
        });

        it('keeps the user order of the rows that stay and puts new rows on top', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif'), { keepOrder: true });
            expect(paths(rasters)).toEqual(['b.tif', 'a.tif']);
            rasters.handleRasterLayerReorder({ fromIndex: 0, toIndex: 1 });
            expect(paths(rasters)).toEqual(['a.tif', 'b.tif']);

            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'), { keepOrder: true });

            expect(paths(rasters)).toEqual(['c.tif', 'a.tif', 'b.tif']);
            // OL draws the last on top: the collection is the list reversed
            expect(order(group)).toEqual(['b.tif', 'a.tif', 'c.tif']);
        });

        it('keeps the order when the list is built again from the same files', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'), { keepOrder: true });
            rasters.handleRasterLayerReorder({ fromIndex: 2, toIndex: 0 });
            const userOrder = paths(rasters);

            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'), { keepOrder: true });

            expect(paths(rasters)).toEqual(userOrder);
            expect(order(group)).toEqual([...userOrder].reverse());
        });

        it('puts several new rows on top in file order, the last file highest', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif'), { keepOrder: true });
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'), { keepOrder: true });
            expect(paths(rasters)).toEqual(['c.tif', 'b.tif', 'a.tif']);
        });

        it('drops a row that left and keeps the order of the others', () => {
            const { rasters, group } = setup();
            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'b.tif', 'c.tif'), { keepOrder: true });
            rasters.handleRasterLayerReorder({ fromIndex: 0, toIndex: 2 });
            expect(paths(rasters)).toEqual(['b.tif', 'a.tif', 'c.tif']);

            rasters.syncRasterLayers(slotsOf(group, 'a.tif', 'c.tif'), { keepOrder: true });
            expect(paths(rasters)).toEqual(['a.tif', 'c.tif']);
            expect(order(group)).toEqual(['c.tif', 'a.tif']);
        });
    });
});

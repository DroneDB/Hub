import { describe, it, expect } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import ddb from 'ddb';
import { useRasterLayers } from './useRasterLayers';

const entry = path => ({ path, type: ddb.entry.type.GEORASTER, properties: {} });

function setup() {
    const group = shallowRef(new LayerGroup());
    const rasters = effectScope().run(() => useRasterLayers({ group, vectorLayers: shallowRef([]), splitMode: () => false }));
    return { rasters, group };
}

describe('useRasterLayers', () => {
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
});

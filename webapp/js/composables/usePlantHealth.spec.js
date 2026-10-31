import { describe, it, expect } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import { createRasterSource } from '@/libs/map/rasterLayers';
import { usePlantHealth } from './usePlantHealth';

const layerFor = path => {
    const layer = new TileLayer({ source: createRasterSource({ url: `ddb://h/o/d/${path}`, native: 20, retina: false }) });
    layer.file = { path: `ddb://h/o/d/${path}`, entry: { path, hash: 'h' } };
    layer.set('rasterNativeZoom', 20);
    return layer;
};

describe('usePlantHealth refreshRasterLayers', () => {
    it('re-sources only the layers whose parameters changed', () => {
        const a = layerFor('a.tif');
        const b = layerFor('b.tif');
        const group = shallowRef(new LayerGroup({ layers: [a, b] }));
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: group, entry: () => null }));
        const bSource = b.getSource();

        ph.vizParamsByPath.value = { 'a.tif': { formula: 'NDVI' } };
        ph.refreshRasterLayers();
        expect(a.getSource().vizParams).toEqual({ formula: 'NDVI' });
        expect(b.getSource()).toBe(bSource);

        const aSource = a.getSource();
        ph.refreshRasterLayers();
        expect(a.getSource()).toBe(aSource);

        ph.vizParamsByPath.value = {};
        ph.refreshRasterLayers();
        expect(a.getSource().vizParams).toBeNull();
        expect(b.getSource()).toBe(bSource);
    });
});

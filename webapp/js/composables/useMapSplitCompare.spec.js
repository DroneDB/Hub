import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref, shallowRef, nextTick } from 'vue';
import { Tile as TileLayer } from 'ol/layer';
import { useMapSplitCompare } from './useMapSplitCompare';

function setup(n) {
    const layers = Array.from({ length: n }, (_, i) => ({ name: `r${i}`, olLayer: new TileLayer() }));
    const rasterLayers = ref(layers);
    const map = shallowRef({ render: vi.fn(), getSize: () => [100, 50] });
    const onChange = vi.fn();
    const scope = effectScope();
    const split = scope.run(() => useMapSplitCompare({ map, rasterLayers, onChange }));
    const clipped = () => layers.filter(l => l.olLayer.hasListener('prerender')).length;
    return { split, rasterLayers, layers, scope, onChange, clipped };
}

describe('useMapSplitCompare', () => {
    it('needs two rasters', () => {
        const { split, clipped } = setup(1);
        expect(split.canCompare.value).toBe(false);
        split.enterSplitMode();
        expect(split.splitMode.value).toBe(false);
        expect(clipped()).toBe(0);
    });

    it('clips every raster to an equal band and unclips on exit', () => {
        const { split, clipped, onChange } = setup(3);
        split.toggleSplit();
        expect(split.splitMode.value).toBe(true);
        expect(split.splitPositions.value).toEqual([1 / 3, 2 / 3]);
        expect(split.splitBands.value).toEqual(['r0', 'r1', 'r2']);
        expect(clipped()).toBe(3);
        split.toggleSplit();
        expect(clipped()).toBe(0);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('leaves the mode when rasters drop below two', async () => {
        const { split, rasterLayers, layers, clipped } = setup(2);
        split.enterSplitMode();
        rasterLayers.value = [layers[0]];
        await nextTick();
        expect(split.splitMode.value).toBe(false);
        expect(clipped()).toBe(0);
    });

    it('removes the clips with the owner', () => {
        const { split, scope, clipped } = setup(2);
        split.enterSplitMode();
        scope.stop();
        expect(clipped()).toBe(0);
    });
});

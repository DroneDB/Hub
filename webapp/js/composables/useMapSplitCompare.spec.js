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
        expect(split.splitBands.value.map(b => b.name)).toEqual(['r0', 'r1', 'r2']);
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

    it('clips the layers of a rebuilt file list while the mode is on', async () => {
        const { split, rasterLayers, layers } = setup(2);
        split.enterSplitMode();
        // The file list is rebuilt: one layer stays, a new one comes in
        const added = { name: 'new', olLayer: new TileLayer() };
        rasterLayers.value = [layers[0], added];
        await nextTick();
        expect(added.olLayer.hasListener('prerender')).toBe(true);
        expect(layers[1].olLayer.hasListener('prerender')).toBe(false);
    });

    it('gives equal bands when a rebuilt list has another number of rasters', async () => {
        const { split, rasterLayers, layers } = setup(2);
        split.enterSplitMode();
        split.onSplitPositionsChange([0.3]);
        const third = { name: 'r2', olLayer: new TileLayer() };
        rasterLayers.value = [...layers, third];
        await nextTick();
        expect(split.splitPositions.value).toEqual([1 / 3, 2 / 3]);
        expect(third.olLayer.hasListener('prerender')).toBe(true);
    });

    it('keeps the band widths when the rasters are reordered', async () => {
        const { split, rasterLayers, layers } = setup(2);
        split.enterSplitMode();
        split.onSplitPositionsChange([0.3]);
        rasterLayers.value = [layers[1], layers[0]];
        await nextTick();
        expect(split.splitPositions.value).toEqual([0.3]);
        expect(layers.every(l => l.olLayer.hasListener('prerender'))).toBe(true);
    });

    it('keeps an empty band for a placeholder row', () => {
        const { split, rasterLayers, layers } = setup(2);
        rasterLayers.value = [layers[0], { name: 'missing', olLayer: null, placeholder: { text: 'Missing' } }, layers[1]];
        split.enterSplitMode();
        expect(split.splitPositions.value).toEqual([1 / 3, 2 / 3]);
        expect(split.splitBands.value[1].placeholder).toEqual({ text: 'Missing' });
        expect(layers.every(l => l.olLayer.hasListener('prerender'))).toBe(true);
    });

    it('sets the mode and the dividers at once', () => {
        const { split } = setup(3);
        split.setSplit(true, [0.2, 0.9]);
        expect(split.splitMode.value).toBe(true);
        expect(split.splitPositions.value).toEqual([0.2, 0.9]);
        split.setSplit(true, [0.4, 0.6]);
        expect(split.splitPositions.value).toEqual([0.4, 0.6]);
        split.setSplit(false, []);
        expect(split.splitMode.value).toBe(false);
    });
});

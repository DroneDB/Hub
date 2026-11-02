/**
 * The state a comparison map reports: the layers, their opacity and styling, the split, the view
 * and the basemap. What only the screen shows (a hidden row) is not part of it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, ref, shallowRef, nextTick } from 'vue';
import { Tile as TileLayer, Group } from 'ol/layer';
import { useRasterLayers } from './useRasterLayers';
import { useMapComparison } from './useMapComparison';
import { encodeState } from '@/libs/compare/compareState';

const PATHS = ['a/dsm.tif', 'a/ortho.tif'];
const state = () => ({
    v: 1,
    layers: PATHS.map(path => ({ path, hash: `h-${path}`, opacity: 1, vizParams: null })),
    split: { enabled: false, positions: [] },
    view: { center: [10, 20], zoom: 5, rotation: 0 },
    display: { basemap: null }
});

let scope;
let emit;
let rasters;
let target;

function start() {
    target = state();
    emit = vi.fn();
    const group = shallowRef(new Group());
    scope = effectScope();
    scope.run(() => {
        rasters = useRasterLayers({ group, vectorLayers: shallowRef([]), splitMode: () => false });
        useMapComparison({
            comparison: () => target,
            emit,
            map: shallowRef(null),
            rasterLayerList: rasters.rasterLayerList,
            rasterOpacity: rasters.rasterOpacity,
            splitMode: ref(false),
            splitPositions: ref([]),
            setSplit: vi.fn(),
            vizParamsByPath: ref({}),
            refreshRasterLayers: vi.fn(),
            selectedBasemap: ref('')
        });
    });
    // The slots are bottom first, the state top first
    rasters.syncRasterLayers([...PATHS].reverse().map(path => {
        const file = { path: `ddb://x/${path}`, entry: { path } };
        const olLayer = new TileLayer();
        olLayer.file = file;
        return { file, olLayer };
    }));
}

afterEach(() => scope?.stop());

describe('the state of a comparison map', () => {
    it('is unchanged by hiding a row: nothing is reported', async () => {
        start();
        await nextTick();
        emit.mockClear();
        rasters.toggleRasterLayerVisible(PATHS[0]);
        await nextTick();
        expect(rasters.rasterLayerList.value.find(r => r.path === PATHS[0]).visible).toBe(false);
        expect(emit).not.toHaveBeenCalled();
    });

    it('reports a change of opacity without any visibility, hidden rows included', async () => {
        start();
        await nextTick();
        rasters.toggleRasterLayerVisible(PATHS[0]);
        await nextTick();
        emit.mockClear();
        rasters.rasterLayerList.value = rasters.rasterLayerList.value.map(r => (r.path === PATHS[1] ? { ...r, opacity: 0.4 } : r));
        await nextTick();
        expect(emit).toHaveBeenCalledTimes(1);
        const [event, reported] = emit.mock.calls[0];
        expect(event).toBe('update:comparison');
        expect(reported.layers.find(l => l.path === PATHS[1]).opacity).toBe(0.4);
        reported.layers.forEach(l => expect(Object.keys(l).sort()).toEqual(['hash', 'opacity', 'path', 'vizParams']));
        expect(JSON.stringify(reported)).not.toContain('visible');
        // The address of the comparison is built from this state: it holds the opacity change and nothing else
        const expected = state();
        expected.layers.find(l => l.path === PATHS[1]).opacity = 0.4;
        expect(encodeState(reported)).toBe(encodeState(expected));
    });
});

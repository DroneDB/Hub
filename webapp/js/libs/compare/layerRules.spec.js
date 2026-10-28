import { describe, it, expect } from 'vitest';
import { stateFromPaths } from './compareState';
import { addLayer, removeLayer, moveLayer, replaceLayer } from './layerRules';

describe('layer rules', () => {
    it('turns the split on with the second layer', () => {
        const s = addLayer(stateFromPaths(['a.tif']), { path: 'b.tif', hash: 'h' });
        expect(s.layers.map(l => l.path)).toEqual(['a.tif', 'b.tif']);
        expect(s.layers[1].hash).toBe('h');
        expect(s.split).toEqual({ enabled: true, positions: [0.5] });
    });

    it('resets the bands when a layer comes or goes with split on', () => {
        const s = stateFromPaths(['a.tif', 'b.tif', 'c.tif']);
        s.split.positions = [0.2, 0.9];
        expect(removeLayer(s, 1).split).toEqual({ enabled: true, positions: [0.5] });
        expect(addLayer(s, { path: 'd.tif' }).split.positions).toEqual([0.25, 0.5, 0.75]);
    });

    it('turns the split off when one layer is left', () => {
        const s = removeLayer(stateFromPaths(['a.tif', 'b.tif']), 0);
        expect(s.layers.map(l => l.path)).toEqual(['b.tif']);
        expect(s.split).toEqual({ enabled: false, positions: [] });
    });

    it('leaves the split off', () => {
        const s = stateFromPaths(['a.tif', 'b.tif', 'c.tif']);
        s.split = { enabled: false, positions: [] };
        expect(addLayer(s, { path: 'd.tif' }).split).toEqual({ enabled: false, positions: [] });
        expect(removeLayer(s, 0).split).toEqual({ enabled: false, positions: [] });
    });

    it('never removes the last layer', () => {
        const s = stateFromPaths(['a.tif']);
        expect(removeLayer(s, 0)).toBe(s);
    });

    it('keeps the band widths on a reorder', () => {
        const s = stateFromPaths(['a.tif', 'b.tif']);
        s.split.positions = [0.3];
        const moved = moveLayer(s, 1, 0);
        expect(moved.layers.map(l => l.path)).toEqual(['b.tif', 'a.tif']);
        expect(moved.split.positions).toEqual([0.3]);
        expect(s.layers.map(l => l.path)).toEqual(['a.tif', 'b.tif']);
    });

    it('replaces a layer in place, keeping its opacity and dropping its style', () => {
        const s = stateFromPaths(['a.tif', 'b.tif']);
        s.split.positions = [0.3];
        s.layers[1].opacity = 0.5;
        s.layers[1].vizParams = { formula: 'NDVI' };
        const r = replaceLayer(s, 1, { path: 'c.tif', hash: 'h2' });
        expect(r.layers[1]).toEqual({ path: 'c.tif', hash: 'h2', opacity: 0.5, vizParams: null });
        expect(r.split.positions).toEqual([0.3]);
    });
});

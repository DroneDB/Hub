import { describe, it, expect } from 'vitest';
import { defaultState, newLayer, MAX_LAYERS, validateState } from './viewState';
import { addLayer, removeLayer, moveLayer, replaceLayer, startSplit } from './layerRules';

const dsm = { path: 'dsm.tif', hash: 'h-dsm' };

/** A view of georaster files, the first one the base, split off, or on with equal bands. */
function view(paths, { split = false, baseIsGeoraster = true } = {}) {
    const s = defaultState(baseIsGeoraster ? { path: paths[0], hash: `h-${paths[0]}` } : { path: 'sites.gpkg', hash: 'h-g' }, { baseIsGeoraster });
    s.layers = paths.map(p => newLayer(p, { hash: `h-${p}` }));
    return split ? startSplit(s) : s;
}
const paths = s => s.layers.map(l => l.path);

describe('addLayer', () => {
    it('puts the new layer on top and keeps the split off', () => {
        const s = addLayer(view(['dsm.tif']), { path: 'ortho.tif', hash: 'h' });
        expect(paths(s)).toEqual(['ortho.tif', 'dsm.tif']);
        expect(s.layers[0].hash).toBe('h');
        expect(s.split).toEqual({ enabled: false, positions: [] });
        expect(s.base).toEqual({ path: 'dsm.tif', hash: 'h-dsm.tif' });
    });

    it('resets the bands to equal widths when the split is on', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif'], { split: true });
        s.split.positions = [0.2, 0.9];
        expect(addLayer(s, { path: 'd.tif' }).split).toEqual({ enabled: true, positions: [0.25, 0.5, 0.75] });
    });

    it('adds the first layer to a view whose base is not a georaster', () => {
        const s = addLayer(view([], { baseIsGeoraster: false }), { path: 'a.tif' });
        expect(paths(s)).toEqual(['a.tif']);
        expect(s.split.enabled).toBe(false);
    });

    it('refuses a file that is already a layer and a seventh layer', () => {
        const s = view(['a.tif', 'b.tif']);
        expect(addLayer(s, { path: 'b.tif' })).toBe(s);
        const full = view(Array.from({ length: MAX_LAYERS }, (_, i) => `f${i}.tif`));
        expect(addLayer(full, { path: 'extra.tif' })).toBe(full);
    });

    it('leaves the input as it was', () => {
        const s = view(['a.tif']);
        addLayer(s, { path: 'b.tif' });
        expect(paths(s)).toEqual(['a.tif']);
    });
});

describe('removeLayer', () => {
    it('resets the bands to equal widths with the split on', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif'], { split: true });
        s.split.positions = [0.2, 0.9];
        expect(removeLayer(s, 1).split).toEqual({ enabled: true, positions: [0.5] });
    });

    it('turns the split off and shows the layer when one is left', () => {
        const s = view(['a.tif', 'b.tif'], { split: true });
        s.layers[1].visible = false;
        const r = removeLayer(s, 0);
        expect(paths(r)).toEqual(['b.tif']);
        expect(r.layers[0].visible).toBe(true);
        expect(r.split).toEqual({ enabled: false, positions: [] });
    });

    it('leaves the split off', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif']);
        expect(removeLayer(s, 0).split).toEqual({ enabled: false, positions: [] });
    });

    it('keeps a hidden layer hidden while several remain', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif']);
        s.layers[1].visible = false;
        expect(removeLayer(s, 0).layers[0].visible).toBe(false);
    });

    it('never removes the last layer or a layer that is not there', () => {
        const one = view(['a.tif']);
        expect(removeLayer(one, 0)).toBe(one);
        const two = view(['a.tif', 'b.tif']);
        expect(removeLayer(two, 2)).toBe(two);
        expect(removeLayer(two, -1)).toBe(two);
    });

    it('keeps the base when another layer goes', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif']);
        expect(removeLayer(s, 2).base).toEqual({ path: 'a.tif', hash: 'h-a.tif' });
        expect(removeLayer(s, 1).base).toEqual(s.base);
    });

    it('makes the first remaining layer the base when the base goes', () => {
        const s = view(['ortho.tif', 'dsm.tif', 'dtm.tif']);
        s.base = { path: 'dsm.tif', hash: 'h-dsm.tif' };
        const r = removeLayer(s, 1);
        expect(paths(r)).toEqual(['ortho.tif', 'dtm.tif']);
        expect(r.base).toEqual({ path: 'ortho.tif', hash: 'h-ortho.tif' });
        const first = removeLayer(view(['a.tif', 'b.tif']), 0);
        expect(first.base).toEqual({ path: 'b.tif', hash: 'h-b.tif' });
    });

    it('leaves a base that is not a georaster alone', () => {
        const s = view(['a.tif', 'b.tif'], { baseIsGeoraster: false });
        expect(removeLayer(s, 0).base).toEqual(s.base);
    });

    it('drops the elevation model that went with the layer, and only then', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif']);
        s.analysis.target = 'b.tif';
        expect(removeLayer(s, 1).analysis.target).toBeNull();
        expect(removeLayer(s, 0).analysis.target).toBe('b.tif');
    });

    it('gives a valid state', () => {
        const s = view(['a.tif', 'b.tif', 'c.tif'], { split: true });
        expect(validateState(removeLayer(s, 0)).error).toBeNull();
        expect(validateState(removeLayer(removeLayer(s, 0), 0)).error).toBeNull();
    });
});

describe('moveLayer', () => {
    it('keeps the band widths and the input', () => {
        const s = view(['a.tif', 'b.tif'], { split: true });
        s.split.positions = [0.3];
        const moved = moveLayer(s, 1, 0);
        expect(paths(moved)).toEqual(['b.tif', 'a.tif']);
        expect(moved.split.positions).toEqual([0.3]);
        expect(paths(s)).toEqual(['a.tif', 'b.tif']);
    });

    it('ignores moves that go nowhere', () => {
        const s = view(['a.tif', 'b.tif']);
        expect(moveLayer(s, 0, 0)).toBe(s);
        expect(moveLayer(s, 0, 2)).toBe(s);
        expect(moveLayer(s, -1, 0)).toBe(s);
    });

    it('does not change the base file', () => {
        const s = view(['a.tif', 'b.tif']);
        expect(moveLayer(s, 0, 1).base).toEqual(s.base);
    });
});

describe('replaceLayer', () => {
    it('replaces a layer in place, keeping its opacity and visibility and dropping its style', () => {
        const s = view(['a.tif', 'b.tif'], { split: true });
        s.split.positions = [0.3];
        s.layers[1].opacity = 0.5;
        s.layers[1].visible = false;
        s.layers[1].vizParams = { formula: 'NDVI' };
        const r = replaceLayer(s, 1, { path: 'c.tif', hash: 'h2' });
        expect(r.layers[1]).toEqual({ path: 'c.tif', hash: 'h2', opacity: 0.5, visible: false, vizParams: null });
        expect(r.split.positions).toEqual([0.3]);
        expect(r.base).toEqual(s.base);
    });

    it('makes the new file the base when the base is replaced', () => {
        const s = view(['a.tif', 'b.tif']);
        const r = replaceLayer(s, 0, { path: 'c.tif', hash: 'h2' });
        expect(r.base).toEqual({ path: 'c.tif', hash: 'h2' });
    });

    it('drops the elevation model of the replaced layer unless the same file is picked again', () => {
        const s = view(['a.tif', 'b.tif']);
        s.analysis.target = 'b.tif';
        expect(replaceLayer(s, 1, { path: 'c.tif' }).analysis.target).toBeNull();
        expect(replaceLayer(s, 1, { path: 'b.tif', hash: 'new' }).analysis.target).toBe('b.tif');
        expect(replaceLayer(s, 0, { path: 'c.tif' }).analysis.target).toBe('b.tif');
    });

    it('refuses a file that is another layer and a layer that is not there', () => {
        const s = view(['a.tif', 'b.tif']);
        expect(replaceLayer(s, 0, { path: 'b.tif' })).toBe(s);
        expect(replaceLayer(s, 5, { path: 'c.tif' })).toBe(s);
    });
});

describe('startSplit', () => {
    it('turns the split on with equal bands from two layers', () => {
        expect(startSplit(view(['a.tif', 'b.tif', 'c.tif'])).split).toEqual({ enabled: true, positions: [1 / 3, 2 / 3] });
    });

    it('does nothing below two layers', () => {
        const s = view(['a.tif']);
        expect(startSplit(s)).toBe(s);
        expect(startSplit(view([], { baseIsGeoraster: false })).split.enabled).toBe(false);
    });

    it('is how a view picked from "Compare to" ends up split after the first pick', () => {
        const picked = startSplit(addLayer(defaultState(dsm, { baseIsGeoraster: true }), { path: 'ortho.tif' }));
        expect(paths(picked)).toEqual(['ortho.tif', 'dsm.tif']);
        expect(picked.split).toEqual({ enabled: true, positions: [0.5] });
    });
});

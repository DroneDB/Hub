import { describe, it, expect } from 'vitest';
import {
    isSafeLayerPath, equalPositions, newLayer, defaultState, buildEntryState, validateState, workingState,
    sameView, samePosition, MAX_LAYERS, VIEW_VERSION
} from './viewState';

const base = { path: 'odm_dem/dsm.tif', hash: 'h-dsm' };

/** A valid view of a georaster base with an orthophoto on top. */
function twoLayers() {
    const s = defaultState(base, { baseIsGeoraster: true });
    s.layers = [newLayer('odm_orthophoto/o.tif', { hash: 'h-o', opacity: 0.8 }), ...s.layers];
    return s;
}

describe('isSafeLayerPath', () => {
    it('accepts dataset-relative paths', () => {
        expect(isSafeLayerPath('a/b c/ortho.tif')).toBe(true);
        expect(isSafeLayerPath('ortho.tif')).toBe(true);
    });

    it('rejects paths that could leave the dataset', () => {
        for (const p of ['/etc/passwd', '../other/x.tif', 'a/../../x.tif', 'ddb://host/org/ds/x.tif', 'a\\b.tif', 'a//b.tif', '', null]) {
            expect(isSafeLayerPath(p)).toBe(false);
        }
    });
});

describe('equalPositions', () => {
    it('divides the map into n equal bands', () => {
        expect(equalPositions(3)).toEqual([1 / 3, 2 / 3]);
        expect(equalPositions(1)).toEqual([]);
    });
});

describe('newLayer', () => {
    it('is opaque, visible and unstyled by default', () => {
        expect(newLayer('a.tif')).toEqual({ path: 'a.tif', hash: '', opacity: 1, visible: true, vizParams: null });
    });
});

describe('defaultState', () => {
    it('shows a georaster base as its only layer', () => {
        expect(defaultState(base, { baseIsGeoraster: true })).toEqual({
            v: VIEW_VERSION,
            base,
            layers: [{ path: base.path, hash: 'h-dsm', opacity: 1, visible: true, vizParams: null }],
            split: { enabled: false, positions: [] },
            view: null,
            display: { basemap: null },
            analysis: { target: null }
        });
    });

    it('has no layer when the base is not a georaster', () => {
        const s = defaultState({ path: 'sites.gpkg', hash: 'h' }, { baseIsGeoraster: false });
        expect(s.layers).toEqual([]);
        expect(s.base).toEqual({ path: 'sites.gpkg', hash: 'h' });
    });

    it('does not share the base object with its caller', () => {
        const b = { ...base };
        const s = defaultState(b, { baseIsGeoraster: true });
        b.path = 'changed';
        expect(s.base.path).toBe(base.path);
    });
});

describe('buildEntryState', () => {
    it('lists the base first, then the added files in order, split on with equal bands', () => {
        const s = buildEntryState(base, ['b/x.tif', 'c/y.tif'], { baseIsGeoraster: true });
        expect(s.layers.map(l => l.path)).toEqual([base.path, 'b/x.tif', 'c/y.tif']);
        expect(s.layers[0].hash).toBe('h-dsm');
        expect(s.split).toEqual({ enabled: true, positions: equalPositions(3) });
        expect(validateState(s).error).toBeNull();
    });

    it('leaves the split off for one layer', () => {
        expect(buildEntryState(base, [], { baseIsGeoraster: true }).split).toEqual({ enabled: false, positions: [] });
        expect(buildEntryState(base, [base.path], { baseIsGeoraster: true }).layers).toHaveLength(1);
    });

    it('leaves out paths that are unsafe, repeated, not text or over the limit', () => {
        const many = Array.from({ length: 10 }, (_, i) => `f${i}.tif`);
        const s = buildEntryState(base, ['../x.tif', 'a.tif', 'a.tif', 42, null, '/abs.tif', ...many], { baseIsGeoraster: true });
        expect(s.layers.map(l => l.path)).toEqual([base.path, 'a.tif', 'f0.tif', 'f1.tif', 'f2.tif', 'f3.tif']);
        expect(s.layers).toHaveLength(MAX_LAYERS);
    });

    it('starts a base that is not a georaster with the added files only', () => {
        const vector = { path: 'sites.gpkg', hash: 'h' };
        const s = buildEntryState(vector, ['sites.gpkg', 'a.tif', 'b.tif'], { baseIsGeoraster: false });
        expect(s.layers.map(l => l.path)).toEqual(['a.tif', 'b.tif']);
        expect(s.split.enabled).toBe(true);
        expect(validateState(s).error).toBeNull();
    });

    it('gives one added file to a vector base without a split', () => {
        const s = buildEntryState({ path: 'sites.gpkg', hash: 'h' }, ['a.tif'], { baseIsGeoraster: false });
        expect(s.layers).toHaveLength(1);
        expect(s.split.enabled).toBe(false);
    });
});

describe('validateState', () => {
    it('accepts the default states and a state with several layers', () => {
        expect(validateState(defaultState(base, { baseIsGeoraster: true })).error).toBeNull();
        expect(validateState(defaultState(base, { baseIsGeoraster: false })).error).toBeNull();
        expect(validateState(twoLayers())).toEqual({ error: null, newerVersion: false });
    });

    it('accepts a split with increasing dividers, a position, a basemap and an elevation model', () => {
        const s = twoLayers();
        s.split = { enabled: true, positions: [0.3] };
        s.view = { center: [1.5, 2.5], zoom: 17, rotation: 0.1 };
        s.display.basemap = 'satellite';
        s.analysis.target = base.path;
        expect(validateState(s).error).toBeNull();
    });

    it('rejects broken states', () => {
        const cases = [
            s => { s.base = null; },
            s => { s.base.path = '../x.tif'; },
            s => { s.base.hash = 3; },
            s => { s.layers = null; },
            s => { s.layers = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => ({ ...s.layers[0], path: `f${i}.tif` })); },
            s => { s.layers[1].path = s.layers[0].path; },
            s => { s.layers[0].path = '../x.tif'; },
            s => { s.layers[0].hash = null; },
            s => { s.layers[0].opacity = 2; },
            s => { s.layers[0].opacity = '1'; },
            s => { delete s.layers[0].visible; },
            s => { s.layers[0].vizParams = 'NDVI'; },
            s => { s.split.enabled = true; s.split.positions = [0.5, 0.7]; },
            s => { s.split.enabled = true; s.split.positions = [1]; },
            s => { s.split.enabled = true; s.split.positions = [0]; },
            s => { s.split.positions = [0.5]; },
            s => { s.split = null; },
            s => { s.view = { center: [0], zoom: 1, rotation: 0 }; },
            s => { s.view = undefined; },
            s => { s.display = {}; },
            s => { s.analysis = null; },
            s => { s.analysis.target = 'other.tif'; },
            s => { s.v = 0; }
        ];
        for (const mutate of cases) {
            const s = twoLayers();
            mutate(s);
            expect(validateState(s).error, mutate.toString()).not.toBeNull();
        }
        expect(validateState(null).error).not.toBeNull();
        expect(validateState([]).error).not.toBeNull();
    });

    it('rejects a split on a single layer and dividers that are not increasing', () => {
        const one = defaultState(base, { baseIsGeoraster: true });
        one.split = { enabled: true, positions: [] };
        expect(validateState(one).error).not.toBeNull();
        const three = twoLayers();
        three.layers.push(newLayer('c.tif'));
        three.split = { enabled: true, positions: [0.7, 0.3] };
        expect(validateState(three).error).not.toBeNull();
    });

    it('does not accept an elevation model when there are no layers', () => {
        const s = defaultState({ path: 'sites.gpkg', hash: '' }, { baseIsGeoraster: false });
        s.analysis.target = 'a.tif';
        expect(validateState(s).error).not.toBeNull();
    });

    it('flags a later version without judging it', () => {
        expect(validateState({ v: VIEW_VERSION + 1, anything: true })).toEqual({ error: null, newerVersion: true });
    });
});

describe('workingState', () => {
    it('keeps the working fields and drops identity, name and audit fields', () => {
        const item = { ...twoLayers(), uid: 'v_1', name: 'n', createdBy: 'a', updatedAt: 'x', extra: 1 };
        expect(Object.keys(workingState(item)).sort()).toEqual(['analysis', 'base', 'display', 'layers', 'split', 'v', 'view']);
    });
});

describe('sameView', () => {
    it('ignores the map position, the audit fields and tiny number noise', () => {
        const a = twoLayers();
        const b = { ...twoLayers(), view: { center: [1, 2], zoom: 3, rotation: 0 }, name: 'x', updatedAt: 'now' };
        b.layers[0].opacity = 0.8000001;
        expect(sameView(a, b)).toBe(true);
    });

    it('sees a change of a layer setting, the order, the visibility, the split and the elevation model', () => {
        const changes = [
            s => { s.layers[0].opacity = 0.6; },
            s => { s.layers[0].visible = false; },
            s => { s.layers[0].vizParams = { preset: 'ndvi' }; },
            s => { s.layers.reverse(); },
            s => { s.split = { enabled: true, positions: [0.5] }; },
            s => { s.analysis.target = base.path; },
            s => { s.base = { path: 'odm_orthophoto/o.tif', hash: 'h-o' }; }
        ];
        for (const change of changes) {
            const b = twoLayers();
            change(b);
            expect(sameView(twoLayers(), b), change.toString()).toBe(false);
        }
    });

    it('treats a state without a basemap as matching any basemap', () => {
        const b = twoLayers();
        b.display.basemap = 'satellite';
        expect(sameView(twoLayers(), b)).toBe(true);
        const c = twoLayers();
        c.display.basemap = 'osm';
        expect(sameView(c, b)).toBe(false);
        expect(sameView(c, { ...c, display: { basemap: 'osm' } })).toBe(true);
    });
});

describe('samePosition', () => {
    it('compares positions to 3 decimals, and a position with none', () => {
        const a = { center: [10.0001, 20], zoom: 5, rotation: 0 };
        expect(samePosition(a, { center: [10.0002, 20], zoom: 5, rotation: 0 })).toBe(true);
        expect(samePosition(a, { center: [10.1, 20], zoom: 5, rotation: 0 })).toBe(false);
        expect(samePosition(null, null)).toBe(true);
        expect(samePosition(a, null)).toBe(false);
    });
});

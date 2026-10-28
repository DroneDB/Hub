import { describe, it, expect } from 'vitest';
import { b64urlEncode } from '@/libs/base64';
import {
    isSafeLayerPath, stateFromPaths, validateState, encodeState, parseCompareQuery, compareQuery,
    sameComparison, sameState, MAX_LAYERS, MAX_STATE_PARAM, STATE_VERSION
} from './compareState';

const two = () => stateFromPaths(['2024/ortho.tif', '2025/ortho.tif']);

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

describe('stateFromPaths', () => {
    it('splits two layers or more into equal bands', () => {
        expect(two().split).toEqual({ enabled: true, positions: [0.5] });
        expect(stateFromPaths(['a.tif']).split).toEqual({ enabled: false, positions: [] });
    });
});

describe('validateState', () => {
    it('accepts a default state', () => {
        expect(validateState(two()).error).toBeNull();
    });

    it('rejects broken states', () => {
        const cases = [
            s => { s.layers = []; },
            s => { s.layers = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => ({ ...s.layers[0], path: `f${i}.tif` })); },
            s => { s.layers[1].path = s.layers[0].path; },
            s => { s.layers[0].path = '../x.tif'; },
            s => { s.layers[0].opacity = 2; },
            s => { s.layers[0].vizParams = 'NDVI'; },
            s => { s.split.positions = [0.5, 0.7]; },
            s => { s.split.positions = [1]; },
            s => { s.split = { enabled: false, positions: [0.5] }; },
            s => { s.view = { center: [0], zoom: 1, rotation: 0 }; },
            s => { s.display = {}; },
            s => { s.v = 0; }
        ];
        for (const mutate of cases) {
            const s = two();
            mutate(s);
            expect(validateState(s).error).not.toBeNull();
        }
    });

    it('requires increasing dividers', () => {
        const s = stateFromPaths(['a.tif', 'b.tif', 'c.tif']);
        s.split.positions = [0.7, 0.3];
        expect(validateState(s).error).not.toBeNull();
    });

    it('flags a later version without judging it', () => {
        expect(validateState({ v: STATE_VERSION + 1, anything: true })).toEqual({ error: null, newerVersion: true });
    });
});

describe('parseCompareQuery', () => {
    it('reads layer paths in order', () => {
        const r = parseCompareQuery({ p: [b64urlEncode('x/ä.tif'), b64urlEncode('y.tif')], pick: '1' });
        expect(r.error).toBeNull();
        expect(r.state.layers.map(l => l.path)).toEqual(['x/ä.tif', 'y.tif']);
        expect(r.pick).toBe(true);
    });

    it('takes the working state over the saved one and the paths', () => {
        const s = two();
        s.layers[0].opacity = 0.4;
        const r = parseCompareQuery({ s: encodeState(s), c: 'c_abc', p: b64urlEncode('z.tif') });
        expect(r.state.layers[0].opacity).toBe(0.4);
        expect(r.uid).toBe('c_abc');
    });

    it('leaves a saved comparison to be resolved', () => {
        expect(parseCompareQuery({ c: 'c_abc', p: b64urlEncode('z.tif') })).toEqual({ error: null, state: null, uid: 'c_abc', pick: false });
    });

    it('refuses what it cannot trust', () => {
        expect(parseCompareQuery({}).error).toBeTruthy();
        expect(parseCompareQuery({ s: '!!!' }).error).toBeTruthy();
        expect(parseCompareQuery({ s: b64urlEncode('{not json') }).error).toBeTruthy();
        expect(parseCompareQuery({ s: b64urlEncode(JSON.stringify({ v: 1, layers: [] })) }).error).toBeTruthy();
        expect(parseCompareQuery({ s: b64urlEncode(JSON.stringify({ v: 9 })) }).error).toMatch(/newer version/);
        expect(parseCompareQuery({ p: b64urlEncode('../secret.tif') }).error).toBeTruthy();
        expect(parseCompareQuery({ p: Array.from({ length: MAX_LAYERS + 1 }, (_, i) => b64urlEncode(`${i}.tif`)) }).error).toBeTruthy();
    });

    it('round-trips through compareQuery', () => {
        const s = two();
        s.view = { center: [1.5, 2.5], zoom: 17, rotation: 0.1 };
        const { query } = compareQuery({ state: s });
        expect(parseCompareQuery(query).state).toEqual(s);
    });
});

describe('compareQuery', () => {
    it('is the uid alone for a saved comparison without changes', () => {
        expect(compareQuery({ state: two(), uid: 'c_1', clean: true })).toEqual({ query: { c: 'c_1' }, tooLong: false });
        expect(Object.keys(compareQuery({ state: two(), uid: 'c_1' }).query)).toEqual(['c', 's']);
    });

    it('drops a state too long for a link', () => {
        const s = two();
        s.layers[0].vizParams = { formula: 'x'.repeat(MAX_STATE_PARAM) };
        expect(compareQuery({ state: s })).toEqual({ query: {}, tooLong: true });
        expect(compareQuery({ state: s, uid: 'c_1' })).toEqual({ query: { c: 'c_1' }, tooLong: true });
    });
});

describe('sameComparison', () => {
    it('ignores the view and the audit fields, and tiny number noise', () => {
        const a = two();
        const b = { ...two(), view: { center: [1, 2], zoom: 3, rotation: 0 }, name: 'x', updatedAt: 'now' };
        b.split.positions = [0.5000001];
        expect(sameComparison(a, b)).toBe(true);
        expect(sameState(a, b)).toBe(false);
    });

    it('matches any basemap when one side has none', () => {
        const b = two();
        b.display.basemap = 'satellite';
        expect(sameComparison(two(), b)).toBe(true);
        const c = two();
        c.display.basemap = 'osm';
        expect(sameComparison(c, b)).toBe(false);
    });

    it('sees other changes', () => {
        const b = two();
        b.layers[1].opacity = 0.6;
        expect(sameComparison(two(), b)).toBe(false);
    });
});

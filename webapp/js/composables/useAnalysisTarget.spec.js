/**
 * The raster the analysis tools work on: chosen when a tool opens (the topmost candidate), kept
 * while it is on the map, replaced when it leaves, switched by the user without a question, and
 * never opened in split compare. It has nothing to do with the measurements of the map.
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import ddb from 'ddb';
import { useAnalysisTarget } from './useAnalysisTarget';

const T = ddb.entry.type;
const candidate = (path, type = T.GEORASTER) => {
    const entry = { path, type };
    return { path, label: path.split('/').pop(), entry, file: { path: `ddb://x/${path}`, entry } };
};
const DSM = 'odm_dem/dsm.tif';
const DTM = 'odm_dem/dtm.tif';
const ORTHO = 'odm_orthophoto/odm_orthophoto.tif';

/** A map with these rows (top first), with a log of what the target did to the panels. */
function map({ rows = [DTM, DSM], splitMode = ref(false) } = {}) {
    const list = ref(rows.map(r => (typeof r === 'string' ? candidate(r) : r)));
    const log = [];
    const state = { kind: null };
    const target = useAnalysisTarget({
        candidates: () => list.value,
        splitMode: () => splitMode.value,
        panels: {
            openKind: () => state.kind,
            open: (kind, file) => { state.kind = kind; log.push(`open ${kind} ${file.entry.path}`); },
            // As the panels do: closing a panel that is not open does nothing
            close: kind => { if (state.kind !== kind) return; state.kind = null; log.push(`close ${kind}`); }
        }
    });
    return { target, list, log, state, splitMode };
}

function opened(options, kind = 'stockpile') {
    const m = map(options);
    m.target.requestOpen(kind);
    m.log.length = 0;
    return m;
}

describe('the analysis target on the first open', () => {
    it('is the topmost candidate (a DTM above its DSM)', () => {
        const m = map();
        expect(m.target.requestOpen('stockpile')).toBe(true);
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toEqual([`open stockpile ${DTM}`]);
    });

    it('is none until a tool opens, but the tools show as soon as there is a candidate', () => {
        const m = map();
        expect(m.target.targetPath.value).toBeNull();
        expect(m.target.toolbarEntry.value).toEqual({ path: DTM, type: T.GEORASTER });
        expect(map({ rows: [] }).target.toolbarEntry.value).toBeNull();
    });

    it('opens nothing without a candidate', () => {
        const m = map({ rows: [] });
        expect(m.target.requestOpen('stockpile')).toBe(false);
        expect(m.log).toEqual([]);
    });

    it('lists the candidates top first, as the layer panel does', () => {
        expect(map().target.candidates.value.map(c => c.path)).toEqual([DTM, DSM]);
    });

    it('does not open in split compare', () => {
        const m = map({ splitMode: ref(true) });
        expect(m.target.requestOpen('stockpile')).toBe(false);
        expect(m.target.targetPath.value).toBeNull();
        expect(m.log).toEqual([]);
    });

    it('opens the other tool for the same target, and the button closes its own panel', () => {
        const m = opened();
        m.target.requestToggle('rasterAnalysis');
        expect(m.log).toEqual([`open rasterAnalysis ${DTM}`]);
        m.log.length = 0;
        m.target.requestToggle('rasterAnalysis');
        expect(m.log).toEqual(['close rasterAnalysis']);
        expect(m.state.kind).toBeNull();
    });
});

describe('the analysis target while the map changes', () => {
    it('stays when the layers are reordered', () => {
        const m = opened();
        m.list.value = [m.list.value[1], m.list.value[0]];
        m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toEqual([]);
    });

    it('stays, and nothing reopens, when the layers are rebuilt with the target still there', () => {
        const m = opened();
        m.list.value = [candidate(DTM), candidate(DSM)];
        m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toEqual([]);
    });

    it('is chosen again when it leaves, and the open panel opens for the new one', () => {
        const m = opened();
        m.list.value = [candidate(DSM)];
        m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual(['close stockpile', `open stockpile ${DSM}`]);
    });

    it('is cleared when no candidate is left, and the panel closes', () => {
        const m = opened({}, 'rasterAnalysis');
        m.list.value = [];
        m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBeNull();
        expect(m.target.toolbarEntry.value).toBeNull();
        expect(m.log).toEqual(['close rasterAnalysis']);
    });

    it('does nothing before the first open', () => {
        const m = map();
        m.list.value = [];
        m.target.onCandidatesChanged();
        expect(m.log).toEqual([]);
    });

    it('closes the open tool when split compare turns on', async () => {
        const m = opened();
        m.splitMode.value = true;
        await nextTick();
        expect(m.log).toEqual(['close stockpile']);
        expect(m.state.kind).toBeNull();
    });
});

describe('switching the analysis target', () => {
    it('switches without a question, whatever the map holds: the target, then the panel for it', () => {
        const m = opened();
        expect(m.target.requestSwitch(DSM)).toBe(true);
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual(['close stockpile', `open stockpile ${DSM}`]);
    });

    it('keeps the kind of panel that is open', () => {
        const m = opened({}, 'rasterAnalysis');
        m.target.requestSwitch(DSM);
        expect(m.log).toEqual(['close rasterAnalysis', `open rasterAnalysis ${DSM}`]);
    });

    it('switches without opening a panel when none is open', () => {
        const m = opened();
        m.target.requestToggle('stockpile');
        m.log.length = 0;
        m.target.requestSwitch(DSM);
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual([]);
    });

    it('ignores a path that is not a candidate and the target itself', () => {
        const m = opened();
        expect(m.target.requestSwitch('elsewhere.tif')).toBe(false);
        expect(m.target.requestSwitch(DTM)).toBe(false);
        expect(m.log).toEqual([]);
    });

    it('switches to a thermal photo drawn as a raster too', () => {
        const thermal = candidate('flight/thermal.tif', T.GEOIMAGE);
        const m = opened({ rows: [thermal, DSM] });
        expect(m.target.requestSwitch(DSM)).toBe(true);
        expect(m.target.requestSwitch(thermal.path)).toBe(true);
        expect(m.target.targetEntry.value).toEqual(thermal.entry);
    });

    it('does not reopen a panel in split compare, though the target changes', async () => {
        const m = opened();
        m.splitMode.value = true;
        await nextTick();
        m.log.length = 0;
        expect(m.target.requestSwitch(DSM)).toBe(true);
        expect(m.state.kind).toBeNull();
        expect(m.log).toEqual([]);
    });
});

describe('the default target', () => {
    it('is the topmost candidate, and none without candidates', () => {
        expect(map().target.defaultTarget()).toBe(DTM);
        expect(map({ rows: [ORTHO, DSM] }).target.defaultTarget()).toBe(ORTHO);
        expect(map({ rows: [] }).target.defaultTarget()).toBeNull();
    });

    it('does not follow the target the user chose (it is what a tool would pick)', () => {
        const m = opened();
        m.target.requestSwitch(DSM);
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.target.defaultTarget()).toBe(DTM);
    });

    it('is chosen by a tool button', () => {
        const m = map({ rows: [DTM, DSM] });
        m.target.requestOpen('stockpile');
        expect(m.target.targetPath.value).toBe(m.target.defaultTarget());
    });
});

describe('restoring a saved target', () => {
    it('sets the target without opening a panel', () => {
        const m = map();
        expect(m.target.restoreTarget(DSM)).toBe(true);
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.state.kind).toBeNull();
        expect(m.log).toEqual([]);
    });

    it('is refused for a path that is not a candidate', () => {
        const m = map();
        expect(m.target.restoreTarget('elsewhere.tif')).toBe(false);
        expect(m.target.targetPath.value).toBeNull();
    });

    it('is true when the target is that path already', () => {
        const m = opened();
        expect(m.target.restoreTarget(DTM)).toBe(true);
        expect(m.log).toEqual([]);
    });

    it('opens the panel that is open again for the new raster', () => {
        const m = opened();
        expect(m.target.restoreTarget(DSM)).toBe(true);
        expect(m.log).toEqual(['close stockpile', `open stockpile ${DSM}`]);
    });

    it('does not open a panel in split compare', async () => {
        const m = opened();
        m.splitMode.value = true;
        await nextTick();
        m.log.length = 0;
        m.target.restoreTarget(DSM);
        expect(m.log).toEqual([]);
    });
});

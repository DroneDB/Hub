/**
 * The raster the analysis tools work on: chosen when a tool opens, kept while it is on the map,
 * replaced when it leaves, switched by the user with a question when that drops measurements;
 * the latest request opens its panel, once the measurements are in, and never in split compare.
 */
import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import ddb from 'ddb';
import { useAnalysisTarget, measurementsFollow } from './useAnalysisTarget';

const T = ddb.entry.type;
const candidate = (path, type = T.GEORASTER) => {
    const entry = { path, type };
    return { path, label: path.split('/').pop(), entry, file: { path: `ddb://x/${path}`, entry } };
};
const DSM = 'odm_dem/dsm.tif';
const DTM = 'odm_dem/dtm.tif';
const ORTHO = 'odm_orthophoto/odm_orthophoto.tif';

/**
 * A map whose measurements belong to `own` while no target decides it, with a log of what the
 * target did to the measurements and the panels.
 */
function map({ rows = [DTM, DSM], own = DSM, dirty = false, answer = true, splitMode = ref(false) } = {}) {
    const list = ref(rows.map(r => (typeof r === 'string' ? candidate(r) : r)));
    const log = [];
    const state = { dirty, kind: null };
    const ask = vi.fn(async () => answer);
    const loads = [];
    const host = { target: null };
    /** @param {any} entry */
    const pathFor = entry => (entry && measurementsFollow(entry) ? entry.path : own);
    const target = useAnalysisTarget({
        candidates: () => list.value,
        // As the measurements feature answers: the target when it is a georaster, else the default
        measurementsPath: () => pathFor(host.target.targetEntry.value),
        measurementsPathFor: pathFor,
        isDirty: () => state.dirty,
        confirmDiscard: ask,
        reloadMeasurements: () => {
            log.push('load');
            return new Promise(resolve => loads.push(resolve));
        },
        splitMode: () => splitMode.value,
        panels: {
            openKind: () => state.kind,
            open: (kind, file) => { state.kind = kind; log.push(`open ${kind} ${file.entry.path}`); },
            // As the panels do: closing a panel that is not open does nothing
            close: kind => { if (state.kind !== kind) return; state.kind = null; log.push(`close ${kind}`); }
        }
    });
    host.target = target;
    // The measurements finish loading as soon as the test lets them
    const settle = async () => {
        for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 0));
            while (loads.length) loads.shift()();
        }
    };
    return { target, list, log, state, ask, settle, splitMode };
}

async function opened(options, kind = 'stockpile') {
    const m = map(options);
    const done = m.target.requestOpen(kind);
    await m.settle();
    await done;
    m.log.length = 0;
    return m;
}

describe('the analysis target on the first open', () => {
    it('is the raster the measurements belong to, not the one on top (a DTM above its DSM)', async () => {
        const m = map();
        const done = m.target.requestOpen('stockpile');
        await m.settle();
        expect(await done).toBe(true);
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual(['load', `open stockpile ${DSM}`]);
    });

    it('is the topmost candidate when the measurements raster is not one (an orthophoto listed first)', async () => {
        const m = map({ rows: [DTM, DSM], own: ORTHO });
        m.target.requestOpen('rasterAnalysis');
        await m.settle();
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toContain(`open rasterAnalysis ${DTM}`);
    });

    it('is none until a tool opens, but the tools show as soon as there is a candidate', () => {
        const m = map();
        expect(m.target.targetPath.value).toBeNull();
        expect(m.target.toolbarEntry.value).toEqual({ path: DSM, type: T.GEORASTER });
        expect(map({ rows: [] }).target.toolbarEntry.value).toBeNull();
    });

    it('opens nothing without a candidate', async () => {
        const m = map({ rows: [] });
        expect(await m.target.requestOpen('stockpile')).toBe(false);
        expect(m.log).toEqual([]);
    });

    it('lists the candidates top first, as the layer panel does', () => {
        expect(map().target.candidates.value.map(c => c.path)).toEqual([DTM, DSM]);
    });

    it('asks first when the measurements move to the target and have unsaved changes; Cancel opens nothing and sets no target', async () => {
        const m = map({ rows: [DSM], own: ORTHO, dirty: true, answer: false });
        expect(await m.target.requestOpen('stockpile')).toBe(false);
        expect(m.ask).toHaveBeenCalledWith('odm_orthophoto.tif');
        expect(m.target.targetPath.value).toBeNull();
        expect(m.log).toEqual([]);
    });

    it('moves the measurements after Discard', async () => {
        const m = map({ rows: [DSM], own: ORTHO, dirty: true, answer: true });
        const done = m.target.requestOpen('stockpile');
        await m.settle();
        expect(await done).toBe(true);
        expect(m.target.targetPath.value).toBe(DSM);
    });

    it('does not ask when the measurements stay where they are, whatever is unsaved', async () => {
        const m = map({ dirty: true });
        m.target.requestOpen('stockpile');
        await m.settle();
        expect(m.ask).not.toHaveBeenCalled();
        expect(m.target.targetPath.value).toBe(DSM);
    });

    it('does not open in split compare', async () => {
        const m = map({ splitMode: ref(true) });
        expect(await m.target.requestOpen('stockpile')).toBe(false);
        expect(m.log).toEqual([]);
    });

    it('does not open once split compare turned on while the measurements loaded', async () => {
        const m = map();
        const done = m.target.requestOpen('stockpile');
        await nextTick();
        m.splitMode.value = true;
        await m.settle();
        expect(await done).toBe(false);
        expect(m.state.kind).toBeNull();
        expect(m.log).toEqual(['load']);
    });

    it('gives way to the other tool asked for while the measurements load: it opens, once, after them', async () => {
        const m = map();
        const first = m.target.requestToggle('stockpile');
        await nextTick();
        const second = m.target.requestToggle('rasterAnalysis');
        await nextTick();
        expect(m.log).toEqual(['load']);
        await m.settle();
        await Promise.all([first, second]);
        expect(m.log).toEqual(['load', `open rasterAnalysis ${DSM}`]);
        expect(m.state.kind).toBe('rasterAnalysis');
    });
});

describe('the analysis target while the map changes', () => {
    it('stays when the layers are reordered', async () => {
        const m = await opened();
        m.list.value = [m.list.value[1], m.list.value[0]];
        await m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual([]);
    });

    it('stays, and nothing reloads or reopens, when the layers are rebuilt with the target still there', async () => {
        const m = await opened();
        m.list.value = [candidate(DTM), candidate(DSM)];
        await m.target.onCandidatesChanged();
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual([]);
    });

    it('is chosen again when it leaves, and the open panel opens for the new one without asking', async () => {
        const m = await opened({ dirty: true });
        m.list.value = [candidate(DTM)];
        const done = m.target.onCandidatesChanged();
        await m.settle();
        await done;
        expect(m.ask).not.toHaveBeenCalled();
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toEqual(['close stockpile', 'load', `open stockpile ${DTM}`]);
    });

    it('is cleared when no candidate is left, and the panel closes', async () => {
        const m = await opened({}, 'rasterAnalysis');
        m.list.value = [];
        const done = m.target.onCandidatesChanged();
        await m.settle();
        await done;
        expect(m.target.targetPath.value).toBeNull();
        expect(m.target.toolbarEntry.value).toBeNull();
        expect(m.log).toEqual(['close rasterAnalysis', 'load']);
    });

    it('does nothing before the first open', async () => {
        const m = map();
        m.list.value = [];
        await m.target.onCandidatesChanged();
        expect(m.log).toEqual([]);
    });

    it('does not reopen a panel when split compare turns on during a switch', async () => {
        const m = await opened();
        const done = m.target.requestSwitch(DTM);
        await nextTick();
        m.splitMode.value = true;
        await m.settle();
        expect(await done).toBe(false);
        expect(m.state.kind).toBeNull();
        expect(m.log).toEqual(['close stockpile', 'load']);
    });

    it('closes the open tool when split compare turns on', async () => {
        const m = await opened();
        m.splitMode.value = true;
        await nextTick();
        expect(m.log).toEqual(['close stockpile']);
        expect(m.state.kind).toBeNull();
    });
});

describe('switching the analysis target', () => {
    it('asks first when the measurements have unsaved changes, and Cancel keeps the target and the changes', async () => {
        const m = await opened({ dirty: true, answer: false });
        expect(await m.target.requestSwitch(DTM)).toBe(false);
        expect(m.ask).toHaveBeenCalledWith('dsm.tif');
        expect(m.target.targetPath.value).toBe(DSM);
        expect(m.log).toEqual([]);
    });

    it('switches after Discard: the target, the measurements of its file, then the panel', async () => {
        const m = await opened({ dirty: true, answer: true });
        const done = m.target.requestSwitch(DTM);
        await m.settle();
        expect(await done).toBe(true);
        expect(m.target.targetPath.value).toBe(DTM);
        expect(m.log).toEqual(['close stockpile', 'load', `open stockpile ${DTM}`]);
    });

    it('switches without a question when nothing is unsaved', async () => {
        const m = await opened();
        const done = m.target.requestSwitch(DTM);
        await m.settle();
        await done;
        expect(m.ask).not.toHaveBeenCalled();
        expect(m.target.targetPath.value).toBe(DTM);
    });

    it('keeps the kind of panel that is open', async () => {
        const m = await opened({}, 'rasterAnalysis');
        const done = m.target.requestSwitch(DTM);
        await m.settle();
        await done;
        expect(m.log).toEqual(['close rasterAnalysis', 'load', `open rasterAnalysis ${DTM}`]);
    });

    it('does not open the panel before the measurements of the new file are in', async () => {
        // The saved pile is drawn from the measurements; a panel opened first draws it a second time
        const m = await opened();
        const done = m.target.requestSwitch(DTM);
        await nextTick();
        expect(m.log).toEqual(['close stockpile', 'load']);
        await m.settle();
        await done;
        expect(m.log).toEqual(['close stockpile', 'load', `open stockpile ${DTM}`]);
    });

    it('ignores a path that is not a candidate and the target itself', async () => {
        const m = await opened();
        expect(await m.target.requestSwitch('elsewhere.tif')).toBe(false);
        expect(await m.target.requestSwitch(DSM)).toBe(false);
        expect(m.log).toEqual([]);
    });

    it('a change that is overtaken while its measurements load does not open its panel', async () => {
        const m = await opened();
        m.list.value = [candidate(DTM), candidate(DSM), candidate('odm_dem/other.tif')];
        const first = m.target.requestSwitch(DTM);
        await nextTick();
        const second = m.target.requestSwitch('odm_dem/other.tif');
        await m.settle();
        await Promise.all([first, second]);
        expect(m.log.filter(l => l.startsWith('open'))).toEqual(['open stockpile odm_dem/other.tif']);
    });

    it('the button closes its own panel, and opens the other one for the same target', async () => {
        const m = await opened();
        await m.target.requestToggle('stockpile');
        expect(m.state.kind).toBeNull();
        m.log.length = 0;
        await m.target.requestToggle('rasterAnalysis');
        expect(m.log).toEqual([`open rasterAnalysis ${DSM}`]);
    });
});

describe('switching where the measurements stay in their file', () => {
    const thermal = candidate('flight/thermal.tif', T.GEOIMAGE);

    it('does not ask, and switches, to a thermal photo while the measurements stay with the DSM', async () => {
        const m = await opened({ rows: [thermal, DSM], own: DSM, dirty: true });
        expect(m.target.targetPath.value).toBe(DSM);
        const done = m.target.requestSwitch(thermal.path);
        await m.settle();
        expect(await done).toBe(true);
        expect(m.ask).not.toHaveBeenCalled();
        expect(m.target.targetPath.value).toBe(thermal.path);
    });

    it('does not ask from the thermal photo back to the raster the measurements are of', async () => {
        const m = await opened({ rows: [thermal], own: DSM, dirty: true }, 'rasterAnalysis');
        m.list.value = [thermal, candidate(DSM)];
        const done = m.target.requestSwitch(DSM);
        await m.settle();
        expect(await done).toBe(true);
        expect(m.ask).not.toHaveBeenCalled();
    });

    it('asks when the thermal photo takes them back from the DSM to the file of the folder', async () => {
        const m = await opened({ rows: [DSM, thermal], own: ORTHO });
        expect(m.target.targetPath.value).toBe(DSM);
        m.state.dirty = true;
        m.ask.mockImplementation(async () => false);
        expect(await m.target.requestSwitch(thermal.path)).toBe(false);
        expect(m.ask).toHaveBeenCalledWith('dsm.tif');
        expect(m.target.targetPath.value).toBe(DSM);
    });
});

describe('a target that is not a georaster', () => {
    it('does not move the measurements, and so does not ask about them (a thermal photo drawn as a raster)', async () => {
        const thermal = candidate('flight/thermal.tif', T.GEOIMAGE);
        const m = map({ rows: [thermal], own: 'flight/measurements.geojson', dirty: true });
        expect(measurementsFollow(thermal.entry)).toBe(false);
        m.target.requestOpen('rasterAnalysis');
        await m.settle();
        expect(m.ask).not.toHaveBeenCalled();
        expect(m.target.targetPath.value).toBe('flight/thermal.tif');
        expect(m.target.targetEntry.value).toEqual(thermal.entry);
    });
});

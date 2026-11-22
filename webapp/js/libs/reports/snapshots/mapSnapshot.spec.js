/**
 * The map snapshot renderer with a fake engine and canvas: the plan it asks for (the frame of the block, the layers of the
 * cover view, the items), the overlays it draws, the basemap that is drawn again without it when the provider does not
 * allow export (a tile that did not load, or a canvas the browser calls tainted), and the abort.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/libs/reports/snapshots/coverLayers', () => ({ resolveCoverLayers: vi.fn(async (dataset, layers) => layers.map(l => ({ file: { path: `ddb://x/${l.path}`, entry: {} }, opacity: l.opacity, vizParams: l.vizParams })).reverse()) }));

import { resolveCoverLayers } from '@/libs/reports/snapshots/coverLayers';
import { renderMapSnapshot, BASEMAP_NOT_SHOWN, SNAPSHOT_SIZE } from './mapSnapshot';

/** A canvas that records what is drawn on it; with `taint` it refuses to be encoded, as a canvas with a foreign tile does. */
function fakeCanvas({ taint = false } = {}) {
    const calls = [];
    const ctx = {
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 6 }),
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        fillText: (...args) => calls.push(['fillText', ...args])
    };
    return {
        calls,
        getContext: () => ctx,
        toBlob(callback) {
            if (taint) throw new DOMException('The canvas has been tainted', 'SecurityError');
            callback(new Blob(['image']));
        }
    };
}

/** An engine whose canvas is tainted, or whose basemap tile failed, only when the plan has a basemap. */
function fakeEngine({ taintedWithBasemap = false, tileFailsWithBasemap = false, attribution = '© OpenStreetMap' } = {}) {
    const plans = [];
    const disposed = [];
    return {
        plans, disposed,
        draw: vi.fn(async plan => {
            plans.push(plan);
            const canvas = fakeCanvas({ taint: taintedWithBasemap && !!plan.basemap });
            return { canvas, basemapFailed: tileFailsWithBasemap && !!plan.basemap, attribution: plan.basemap ? attribution : '', dispose: () => disposed.push(canvas) };
        })
    };
}

const block = (extra = {}) => ({
    type: 'mapSnapshot', kind: 'overview', itemId: null, ref: null,
    items: [{ id: 'a', ref: '1', geometry: { type: 'Point', coordinates: [11, 45] }, colour: '#000' }, { id: 'b', ref: '12', geometry: { type: 'Point', coordinates: [11.1, 45] }, colour: '#000' }],
    extent: [11, 45, 11.1, 45], frame: [10.9, 44.9, 11.2, 45.1],
    layers: [{ path: 'top.tif', hash: 'h', opacity: 0.5, vizParams: { formula: 'NDVI' } }, { path: 'bottom.tif', hash: 'h2', opacity: 1, vizParams: null }],
    basemap: 'osm', view: { center: [0, 0], zoom: 3 }, coverDeleted: false, legend: [], alt: 'Overview map', note: null, ...extra
});
const dataset = {};

beforeEach(() => vi.clearAllMocks());

describe('renderMapSnapshot', () => {
    it('draws the frame of the block, with the layers of the cover view bottom first and their opacity and parameters, and the basemap', async () => {
        const engine = fakeEngine();
        const result = await renderMapSnapshot(block(), { dataset, engine });
        const [plan] = engine.plans;
        expect(plan.frame).toEqual([10.9, 44.9, 11.2, 45.1]);
        expect(plan.width).toBe(SNAPSHOT_SIZE.width);
        expect(plan.height).toBe(SNAPSHOT_SIZE.height);
        expect(plan.basemap).toEqual({ name: 'osm' });
        expect(plan.rasters.map(r => [r.file.path, r.opacity, r.vizParams])).toEqual([['ddb://x/bottom.tif', 1, null], ['ddb://x/top.tif', 0.5, { formula: 'NDVI' }]]);
        expect(result.note).toBeNull();
        expect(result.image).toBeInstanceOf(Blob);
        expect(result).toMatchObject({ width: 1600, height: 1000 });
    });

    it('uses the size it is given', async () => {
        const engine = fakeEngine();
        const result = await renderMapSnapshot(block(), { dataset, engine, width: 800, height: 500 });
        expect(engine.plans[0]).toMatchObject({ width: 800, height: 500 });
        expect(result).toMatchObject({ width: 800, height: 500 });
    });

    it('frames an item snapshot on its item, which is drawn at full strength over the others', async () => {
        const engine = fakeEngine();
        await renderMapSnapshot(block({ kind: 'item', itemId: 'b', frame: [11.09, 44.99, 11.11, 45.01] }), { dataset, engine });
        expect(engine.plans[0]).toMatchObject({ itemId: 'b', frame: [11.09, 44.99, 11.11, 45.01] });
        expect(engine.plans[0].items.map(i => i.ref)).toEqual(['1', '12']);
    });

    it('frames an overview with no frame on the position of the cover view', async () => {
        const engine = fakeEngine();
        await renderMapSnapshot(block({ frame: null }), { dataset, engine });
        expect(engine.plans[0]).toMatchObject({ frame: null, view: { center: [0, 0], zoom: 3 }, itemId: null });
    });

    it('never draws an item that has no geometry', async () => {
        const engine = fakeEngine();
        await renderMapSnapshot(block({ items: [{ id: 'n', ref: '9', geometry: null, colour: '#000' }, block().items[0]] }), { dataset, engine });
        expect(engine.plans[0].items.map(i => i.id)).toEqual(['a']);
    });

    it('draws the items on the basemap only when the cover view was deleted: no layers are asked for', async () => {
        const engine = fakeEngine();
        await renderMapSnapshot(block({ coverDeleted: true, layers: [] }), { dataset, engine });
        expect(resolveCoverLayers).toHaveBeenCalledWith(dataset, []);
        expect(engine.plans[0].rasters).toEqual([]);
        expect(engine.plans[0].basemap).not.toBeNull();
    });

    it('draws the attribution of the basemap and the legend of the block on the image', async () => {
        const engine = fakeEngine({ attribution: '© OpenStreetMap' });
        await renderMapSnapshot(block({ legend: [{ id: 'c', name: 'Crack', colour: '#ff0000' }] }), { dataset, engine });
        const texts = engine.disposed[0].calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).toContain('© OpenStreetMap');
        expect(texts).toContain('Crack');
    });

    it('releases the canvas it drew', async () => {
        const engine = fakeEngine();
        await renderMapSnapshot(block(), { dataset, engine });
        expect(engine.disposed).toHaveLength(1);
    });
});

describe('a basemap the provider does not allow to export', () => {
    it('is drawn again without the basemap when the canvas is tainted, with the note', async () => {
        const engine = fakeEngine({ taintedWithBasemap: true });
        const result = await renderMapSnapshot(block(), { dataset, engine });
        expect(engine.plans.map(p => !!p.basemap)).toEqual([true, false]);
        expect(result.note).toBe('Basemap not shown: provider does not allow export');
        expect(result.note).toBe(BASEMAP_NOT_SHOWN);
        expect(result.image).toBeInstanceOf(Blob);
        // The layers and the items are drawn again as they were; every canvas is released
        expect(engine.plans[1].rasters).toEqual(engine.plans[0].rasters);
        expect(engine.plans[1].items).toEqual(engine.plans[0].items);
        expect(engine.disposed).toHaveLength(2);
    });

    it('is drawn again without the basemap when a tile of it did not load, and has no attribution then', async () => {
        const engine = fakeEngine({ tileFailsWithBasemap: true });
        const result = await renderMapSnapshot(block(), { dataset, engine });
        expect(engine.plans.map(p => !!p.basemap)).toEqual([true, false]);
        expect(result.note).toBe(BASEMAP_NOT_SHOWN);
        const texts = engine.disposed[1].calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).not.toContain('© OpenStreetMap');
    });

    it('does not hide another failure: a canvas that cannot be encoded without a basemap rejects', async () => {
        const engine = { draw: vi.fn(async () => ({ canvas: fakeCanvas({ taint: true }), basemapFailed: false, attribution: '', dispose() {} })) };
        await expect(renderMapSnapshot(block(), { dataset, engine })).rejects.toMatchObject({ name: 'SecurityError' });
        expect(engine.draw).toHaveBeenCalledTimes(2);
    });

    it('does not draw again for an error of the engine', async () => {
        const engine = { draw: vi.fn(async () => { throw new Error('The map did not finish drawing'); }) };
        await expect(renderMapSnapshot(block(), { dataset, engine })).rejects.toThrow('did not finish');
        expect(engine.draw).toHaveBeenCalledTimes(1);
    });
});

describe('aborting', () => {
    it('rejects at once for a signal that is aborted, without asking for anything', async () => {
        const engine = fakeEngine();
        const controller = new AbortController();
        controller.abort();
        await expect(renderMapSnapshot(block(), { dataset, engine, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(engine.draw).not.toHaveBeenCalled();
    });

    it('does not draw again without the basemap once aborted', async () => {
        const controller = new AbortController();
        const engine = fakeEngine({ taintedWithBasemap: true });
        const draw = engine.draw;
        engine.draw = vi.fn(async (plan, options) => { const r = await draw(plan, options); controller.abort(); return r; });
        await expect(renderMapSnapshot(block(), { dataset, engine, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(engine.draw).toHaveBeenCalledTimes(1);
    });
});

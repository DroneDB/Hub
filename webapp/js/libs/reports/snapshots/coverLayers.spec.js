/**
 * The layers of a snapshot: the map's own rule decides which of the cover view's layers can be drawn, the order is bottom
 * first, and what a file is now is asked once per path for a minute.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/libs/map/georasterLayers', () => ({ resolveLayer: vi.fn() }));

import { resolveLayer } from '@/libs/map/georasterLayers';
import { resolveCoverLayers, RESOLVED_TTL_MS } from './coverLayers';

const polygon = { type: 'Polygon', coordinates: [] };
const dataset = () => ({ remoteUri: path => `ddb://h/o/d/${path}` });

beforeEach(() => {
    resolveLayer.mockReset();
    resolveLayer.mockImplementation(async (ds, path) => (path === 'gone.tif'
        ? { status: 'missing', entry: null, reason: 'Missing' }
        : { status: 'ok', entry: { path, polygon_geom: polygon }, reason: '' }));
});

describe('resolveCoverLayers', () => {
    it('gives the drawable layers bottom first with their opacity and parameters, as ddb addresses', async () => {
        const ds = dataset();
        const layers = await resolveCoverLayers(ds, [
            { path: 'top.tif', opacity: 0.5, vizParams: { formula: 'NDVI' } },
            { path: 'bottom.tif' }
        ]);
        expect(layers.map(l => [l.file.path, l.opacity, l.vizParams])).toEqual([['ddb://h/o/d/bottom.tif', 1, null], ['ddb://h/o/d/top.tif', 0.5, { formula: 'NDVI' }]]);
        expect(layers[0].file.entry.path).toBe('bottom.tif');
    });

    it('leaves out a layer the map could not draw (missing, not built, not a georaster) and draws the rest', async () => {
        const ds = dataset();
        resolveLayer.mockImplementation(async (d, path) => (path === 'a.tif' ? { status: 'unavailable', entry: { path }, reason: 'Building' } : path === 'gone.tif' ? { status: 'missing', entry: null, reason: 'Missing' } : { status: 'ok', entry: { path, polygon_geom: polygon }, reason: '' }));
        const layers = await resolveCoverLayers(ds, [{ path: 'a.tif' }, { path: 'gone.tif' }, { path: 'b.tif' }]);
        expect(layers.map(l => l.file.entry.path)).toEqual(['b.tif']);
    });

    it('asks once per path for a minute, for every snapshot of a page, and again after it', async () => {
        const ds = dataset();
        let now = 1000;
        await resolveCoverLayers(ds, [{ path: 'a.tif' }], { now: () => now });
        await resolveCoverLayers(ds, [{ path: 'a.tif' }], { now: () => now + 10 });
        expect(resolveLayer).toHaveBeenCalledTimes(1);
        now += RESOLVED_TTL_MS + 1;
        await resolveCoverLayers(ds, [{ path: 'a.tif' }], { now: () => now });
        expect(resolveLayer).toHaveBeenCalledTimes(2);
    });

    it('does not share what it knows between datasets', async () => {
        await resolveCoverLayers(dataset(), [{ path: 'a.tif' }]);
        await resolveCoverLayers(dataset(), [{ path: 'a.tif' }]);
        expect(resolveLayer).toHaveBeenCalledTimes(2);
    });

    it('has no layers for none', async () => {
        expect(await resolveCoverLayers(dataset(), [])).toEqual([]);
    });
});

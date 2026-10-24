/**
 * FileAvailabilityChecker: whether an entry can be opened in a viewer comes from the artifacts
 * the entry lists (libddb's build manifest through Registry), never from a probe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';

const buildManager = vi.hoisted(() => ({ getBuildState: vi.fn() }));
const taskMonitor = vi.hoisted(() => ({ getTasks: vi.fn() }));
vi.mock('@/libs/build/buildManager', () => ({ default: buildManager }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: taskMonitor }));

const { default: checker } = await import('./fileAvailabilityChecker');
const T = ddb.entry.type;

const COG = { role: 'raster.cog', url: 'http://localhost:5000/orgs/o/ds/d/build/h/cog/cog.tif', mediaType: 'image/tiff' };
const TILES = { role: 'model.3dtiles', url: '/orgs/o/ds/d/build/m/3dtiles/tileset.json', mediaType: 'application/json' };
const raster = (extra = {}) => ({ path: 'ortho.tif', hash: 'h', type: T.GEORASTER, ...extra });
const model = (extra = {}) => ({ path: 'house.obj', hash: 'm', type: T.MODEL, ...extra });

/** A dataset whose listing answers `current`, and that fails the test on any probe. */
function datasetListing(current) {
    return {
        listOne: vi.fn(async () => current),
        registry: { headRequest: vi.fn(() => { throw new Error('no probing'); }) },
        Entry: vi.fn(() => { throw new Error('no entry objects needed'); })
    };
}

beforeEach(() => {
    buildManager.getBuildState.mockReset().mockReturnValue(null);
    taskMonitor.getTasks.mockReset().mockReturnValue([]);
});

describe('unified viewer gate', () => {
    it('is ready when the entry lists the artifact its type needs: no request', async () => {
        const dataset = datasetListing(null);
        const result = await checker.check(dataset, raster({ artifacts: [COG] }), 'unified');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('lists the entry again when its snapshot has no artifact: a build may have finished since the listing', async () => {
        const dataset = datasetListing(model({ artifacts: [TILES] }));
        const result = await checker.check(dataset, model(), 'unified');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
    });

    it('says the output is missing when the fresh listing has none either', async () => {
        const dataset = datasetListing(model());
        const result = await checker.check(dataset, model(), 'unified');
        expect(result).toMatchObject({ available: false, status: 'not-found' });
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
    });

    it('trusts an entry the viewer just listed: no second listing', async () => {
        const dataset = datasetListing(model({ artifacts: [TILES] }));
        const result = await checker.check(dataset, model(), 'unified', { current: true });
        expect(result).toMatchObject({ available: false, status: 'not-found' });
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('a model that has only the Nexus output is not ready for the unified viewer', async () => {
        const nxz = { role: 'model.nexus', url: '/orgs/o/ds/d/build/m/nxs/model.nxz' };
        const result = await checker.check(datasetListing(model({ artifacts: [nxz] })), model({ artifacts: [nxz] }), 'unified', { current: true });
        expect(result.available).toBe(false);
    });

    it('a failed listing is an error, not a missing artifact', async () => {
        const dataset = datasetListing(null);
        dataset.listOne.mockRejectedValue(new Error('network down'));
        await expect(checker.check(dataset, model(), 'unified')).rejects.toThrow('network down');
    });
});

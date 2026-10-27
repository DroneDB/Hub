/**
 * FileAvailabilityChecker: whether an entry can be opened in a viewer comes from the artifacts
 * the entry lists (libddb's build manifest through Registry), never from a probe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';

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

describe('model viewer gate: either multiresolution model opens it', () => {
    const BM3D = { role: 'model.bm3d', url: '/orgs/o/ds/d/build/m/bm3d/model.bm3d' };
    const NXZ = { role: 'model.nexus', url: '/orgs/o/ds/d/build/m/nxs/model.nxz' };

    it.each([['bm3d', BM3D], ['Nexus', NXZ]])('is ready with the %s model listed: no request', async (_, artifact) => {
        const dataset = datasetListing(null);
        const result = await checker.check(dataset, model({ artifacts: [artifact] }), 'model');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('is not ready with only the 3D Tiles listed: the build of the model is awaited', async () => {
        const result = await checker.check(datasetListing(model({ artifacts: [TILES] })), model({ artifacts: [TILES] }), 'model', { current: true });
        expect(result).toMatchObject({ available: false, status: 'queued' });
    });

    it('lists the entry again when its snapshot has no model: a build may have finished since', async () => {
        const dataset = datasetListing(model({ artifacts: [BM3D] }));
        const result = await checker.check(dataset, model(), 'model');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
    });
});

describe('buildable file: the artifacts decide, the job explains', () => {
    const job = currentState => ({ path: 'ortho.tif', currentState });

    it('is ready when the entry lists the artifact, whatever the job history says', async () => {
        buildManager.getBuildState.mockReturnValue(job('Failed'));
        const dataset = datasetListing(null);
        const result = await checker.check(dataset, raster({ artifacts: [COG] }), 'map');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('is not ready because a job succeeded: no output listed means not built (a job that succeeded says nothing about the output)', async () => {
        buildManager.getBuildState.mockReturnValue(job('Succeeded'));
        const dataset = datasetListing(raster());
        const result = await checker.check(dataset, raster(), 'map');
        expect(result).toMatchObject({ available: false, status: 'queued' });
        expect(result.actions).toContain('start-build');
    });

    it('says the build is on hold when the job succeeded but the server reports missing dependencies', async () => {
        buildManager.getBuildState.mockReturnValue(job('Succeeded'));
        const dataset = datasetListing(raster({ buildStatus: 'pending', buildMissingDependencies: ['ortho.tfw'] }));
        const result = await checker.check(dataset, raster(), 'map');
        expect(result).toMatchObject({ available: false, status: 'blocked' });
        expect(result.message).toContain('ortho.tfw');
    });

    it('finds a build that finished after the explorer listed the entry, with one listing and no job', async () => {
        const dataset = datasetListing(raster({ artifacts: [COG] }));
        const result = await checker.check(dataset, raster({ buildStatus: 'queued' }), 'map');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
    });

    it('shows progress from a running job without asking the server about the entry', async () => {
        buildManager.getBuildState.mockReturnValue(job('Processing'));
        const dataset = datasetListing(null);
        const result = await checker.check(dataset, raster(), 'map');
        expect(result).toMatchObject({ available: false, status: 'building', actions: ['cancel', 'wait-and-open'] });
        expect(result.buildState).toEqual(job('Processing'));
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('a running job of the task monitor counts even when the build cache holds an ended one', async () => {
        buildManager.getBuildState.mockReturnValue(job('Succeeded'));
        taskMonitor.getTasks.mockReturnValue([{ toolId: 'build', path: 'ortho.tif', state: 'Enqueued' }]);
        const result = await checker.check(datasetListing(null), raster(), 'map');
        expect(result.status).toBe('building');
    });

    it('opens an entry that lists its output while a background rebuild of it only waits', async () => {
        taskMonitor.getTasks.mockReturnValue([{ toolId: 'build', path: 'ortho.tif', state: 'Enqueued', background: true }]);
        const result = await checker.check(datasetListing(null), raster({ artifacts: [COG] }), 'map', { current: true });
        expect(result).toMatchObject({ available: true, status: 'ready' });
    });

    it('shows the progress of a background rebuild once it processes', async () => {
        taskMonitor.getTasks.mockReturnValue([{ toolId: 'build', path: 'ortho.tif', state: 'Processing', background: true }]);
        const result = await checker.check(datasetListing(null), raster({ artifacts: [COG] }), 'map', { current: true });
        expect(result.status).toBe('building');
    });

    it('shows the failure of the job', async () => {
        buildManager.getBuildState.mockReturnValue(job('Failed'));
        const result = await checker.check(datasetListing(raster({ buildStatus: 'failed' })), raster({ buildStatus: 'failed' }), 'map');
        expect(result).toMatchObject({ available: false, status: 'failed', buildState: job('Failed') });
        expect(result.actions).toContain('details');
    });

    it('shows a failed build the server reports when this page has no job for it', async () => {
        const dataset = datasetListing(raster({ buildStatus: 'failed' }));
        const result = await checker.check(dataset, raster({ buildStatus: 'failed' }), 'map');
        expect(result).toMatchObject({ available: false, status: 'failed' });
    });

    it('shows a build the server sees running that this page has no job for (started elsewhere)', async () => {
        const dataset = datasetListing(raster({ buildStatus: 'building' }));
        const result = await checker.check(dataset, raster({ buildStatus: 'building' }), 'map');
        expect(result).toMatchObject({ available: false, status: 'building' });
    });

    it('reports a job state it does not know as an invalid state', async () => {
        buildManager.getBuildState.mockReturnValue(job('Deleted'));
        const result = await checker.check(datasetListing(raster()), raster(), 'map');
        expect(result.status).toBe('unknown');
    });

    it('a view without a required artifact is ready when the build is complete', async () => {
        const ready = await checker.check(datasetListing(null), model({ artifacts: [TILES] }), 'map');
        expect(ready.available).toBe(true);
        const notReady = await checker.check(datasetListing(model({ buildStatus: 'queued' })), model(), 'map');
        expect(notReady.status).toBe('queued');
    });

    it('never probes: the registry client is not asked for a file', async () => {
        const dataset = datasetListing(raster());
        await checker.check(dataset, raster(), 'map');
        expect(dataset.registry.headRequest).not.toHaveBeenCalled();
    });
});

describe('which types need a build (the server decides)', () => {
    const served = (buildableIds) => ({
        entryTypes: [3, 4, 14, 16].map(id => ({ id, name: String(id), buildable: buildableIds.includes(id), thumbnail: 'none', sidecarExtensions: [], roles: [] }))
    });

    it('opens a type the server does not build without looking at any build', async () => {
        reg.features.values = served([14]);
        const dataset = datasetListing(null);
        const result = await checker.check(dataset, raster(), 'map');
        expect(result).toMatchObject({ available: true, status: 'ready' });
        expect(dataset.listOne).not.toHaveBeenCalled();
        reg.features.clear();
    });

    it('asks for the build of a type the server builds and the Hub never listed', async () => {
        reg.features.values = served([14, 16]);
        const tiles = { path: 'city.3tz', hash: 't', type: T.TILES3D };
        const result = await checker.check(datasetListing(tiles), tiles, 'unified', { current: true });
        expect(result).toMatchObject({ available: false, status: 'not-found' });
        reg.features.clear();
    });
});

/**
 * useDatasetListing keeps the build fields of its items current: an entry is the snapshot of the
 * listing that gave it, and a build that ends afterwards (artifacts, build status) is not in it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope } from 'vue';

const handlers = vi.hoisted(() => ({ buildStateChanged: [] }));
vi.mock('@/libs/build/buildManager', () => ({
    default: {
        on: vi.fn((event, fn) => handlers[event].push(fn)),
        off: vi.fn((event, fn) => { handlers[event] = handlers[event].filter(f => f !== fn); }),
        onFilesAdded: vi.fn()
    }
}));
vi.mock('@/libs/eventBus', () => ({ default: { emit: vi.fn() } }));

const { useDatasetListing } = await import('./useDatasetListing');
const { itemFor } = await import('@/libs/dataset/explorerItems');

const COG = { role: 'raster.cog', url: '/orgs/o/ds/d/build/h/cog/cog.tif' };
const entry = { path: 'ortho.tif', hash: 'h', type: 4, buildStatus: 'queued' };

function setup(listed) {
    const dataset = { remoteUri: p => `ddb://x/o/d/${p}`, listOne: vi.fn(async () => listed) };
    const scope = effectScope();
    const listing = scope.run(() => useDatasetListing(dataset));
    listing.put([itemFor(dataset, { ...entry })]);
    return { dataset, listing, scope };
}
const emit = data => handlers.buildStateChanged.forEach(fn => fn(data));
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { handlers.buildStateChanged.length = 0; });

describe('build refresh', () => {
    it('reads the entry again when its build job ends and copies the build fields onto the item', async () => {
        const { dataset, listing } = setup({ ...entry, buildStatus: undefined, artifacts: [COG] });
        emit({ dataset, filePath: 'ortho.tif', newState: 'Succeeded' });
        await flush();
        const held = listing.files.value[0].entry;
        expect(held.artifacts).toEqual([COG]);
        expect('buildStatus' in held).toBe(false);
        expect(dataset.listOne).toHaveBeenCalledWith('ortho.tif');
    });

    it('also follows a failed build (the entry says failed)', async () => {
        const { dataset, listing } = setup({ ...entry, buildStatus: 'failed' });
        emit({ dataset, filePath: 'ortho.tif', newState: 'Failed' });
        await flush();
        expect(listing.files.value[0].entry.buildStatus).toBe('failed');
    });

    it('does nothing for a job that is still running, another dataset or a file not on show', async () => {
        const { dataset, listing } = setup({ ...entry });
        emit({ dataset, filePath: 'ortho.tif', newState: 'Processing' });
        emit({ dataset: {}, filePath: 'ortho.tif', newState: 'Succeeded' });
        emit({ dataset, filePath: 'other/x.tif', newState: 'Succeeded' });
        await flush();
        expect(dataset.listOne).not.toHaveBeenCalled();
        expect(listing.files.value[0].entry.buildStatus).toBe('queued');
    });

    it('asks once for a state change that arrives twice', async () => {
        const { dataset } = setup({ ...entry, artifacts: [COG] });
        emit({ dataset, filePath: 'ortho.tif', newState: 'Succeeded' });
        emit({ dataset, filePath: 'ortho.tif', newState: 'Succeeded' });
        await flush();
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
    });

    it('keeps the item when the entry cannot be read, and says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { dataset, listing } = setup({});
        dataset.listOne.mockRejectedValue(new Error('offline'));
        emit({ dataset, filePath: 'ortho.tif', newState: 'Succeeded' });
        await flush();
        expect(listing.files.value[0].entry.buildStatus).toBe('queued');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('stops listening with its scope', () => {
        const { scope } = setup({});
        expect(handlers.buildStateChanged).toHaveLength(1);
        scope.stop();
        expect(handlers.buildStateChanged).toHaveLength(0);
    });
});

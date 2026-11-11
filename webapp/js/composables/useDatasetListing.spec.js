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

describe('addEntry', () => {
    it('shows a new file of the folder and tells the tree', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup({ path: 'measurements.geojson', type: 2, size: 10 });
        await listing.addEntry('measurements.geojson');
        expect(listing.files.value.map(f => f.entry.path)).toEqual(['measurements.geojson', 'ortho.tif']);
        expect(emitter.emit).toHaveBeenCalledWith('addItems', [expect.objectContaining({ label: 'measurements.geojson' })]);
    });

    it('replaces the item of a rewritten file, which stays selected', async () => {
        const { listing } = setup({ ...entry, size: 99 });
        listing.files.value[0].selected = true;
        await listing.addEntry('ortho.tif');
        expect(listing.files.value).toHaveLength(1);
        expect(listing.files.value[0].entry.size).toBe(99);
        expect(listing.files.value[0].selected).toBe(true);
    });
});

describe('the tree hears of entries outside the folder on show (FR-EXP-36)', () => {
    const readme = { path: 'README.md', type: 8, size: 1 };

    it('addEntry of a root path while a subfolder is on show emits addItems and leaves the list alone', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup(readme);
        listing.currentPath.value = 'sub';
        await listing.addEntry('README.md');
        expect(emitter.emit).toHaveBeenCalledTimes(1);
        expect(emitter.emit).toHaveBeenCalledWith('addItems', [expect.objectContaining({ label: 'README.md' })]);
        expect(listing.files.value.map(f => f.entry.path)).toEqual(['ortho.tif']);
    });

    it('uploaded gives the tree the entries of other folders, grouped by folder, and the list its own', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup(readme);
        listing.currentPath.value = 'sub';
        listing.uploaded([readme, { path: 'sub/a.jpg', type: 3 }, { path: 'other/b.jpg', type: 3 }, { path: 'other/c.jpg', type: 3 }]);
        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').map(c => c[1].map(i => i.entry.path));
        expect(sent).toEqual([['sub/a.jpg'], ['README.md'], ['other/b.jpg', 'other/c.jpg']]);
        expect(listing.files.value.map(f => f.entry.path).sort()).toEqual(['ortho.tif', 'sub/a.jpg']);
    });

    it('uploaded to the root, with the root on show, tells the tree once', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup(readme);
        listing.uploaded([readme]);
        expect(emitter.emit).toHaveBeenCalledTimes(1);
    });

    it('uploads with nested paths at the root: the tree hears of each entry by its own folder, the list of the top folder', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup(readme);
        listing.uploaded([{ path: 'a/b/c.jpg', type: 3 }, { path: 'a/b/d.jpg', type: 3 }, { path: 'a/e.jpg', type: 3 }, { path: 'top.jpg', type: 3 }]);
        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').map(c => c[1].map(i => i.entry.path));
        expect(sent).toEqual([['a', 'top.jpg'], ['a/b/c.jpg', 'a/b/d.jpg'], ['a/e.jpg']]);
        expect(listing.files.value.map(f => f.entry.path).sort()).toEqual(['a', 'ortho.tif', 'top.jpg']);
    });

    it('uploads into a folder that the list already has still reach the tree, and the list keeps that folder once', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const { dataset, listing } = setup(readme);
        listing.put([itemFor(dataset, { path: 'a', type: 1, size: 0 })]);
        emitter.emit.mockClear();
        listing.uploaded([{ path: 'a/b/c.jpg', type: 3 }]);
        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').map(c => c[1].map(i => i.entry.path));
        expect(sent).toEqual([['a/b/c.jpg']]);
        expect(listing.files.value.map(f => f.entry.path).sort()).toEqual(['a', 'ortho.tif']);
    });
});

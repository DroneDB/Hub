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
    const dataset = { org: 'o', ds: 'd', remoteUri: p => `ddb://x/o/d/${p}`, listOne: vi.fn(async () => listed) };
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

    // The task monitor tells of builds with the dataset object that acquired it last (the header's background archive)
    it('follows the builds of its dataset whichever object of it the event carries', async () => {
        const { listing, dataset } = setup({ ...entry, buildStatus: undefined, artifacts: [COG] });
        emit({ dataset: { org: 'o', ds: 'd' }, filePath: 'ortho.tif', newState: 'Succeeded' });
        await flush();
        expect(dataset.listOne).toHaveBeenCalledWith('ortho.tif');
        expect(listing.files.value[0].entry.artifacts).toEqual([COG]);
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
        emit({ dataset: { org: 'o', ds: 'another' }, filePath: 'ortho.tif', newState: 'Succeeded' });
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

    // The first photo of an annotation creates `annotations/` beside the measurement file
    it('a file written into a folder the list does not have shows that folder in the list and the tree, as an upload does', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const { listing } = setup({ path: 'site/annotations/m1-1.jpg', type: 3, size: 5 });
        listing.currentPath.value = 'site';
        listing.files.value = [];
        emitter.emit.mockClear();
        await listing.addEntry('site/annotations/m1-1.jpg');
        expect(listing.files.value.map(f => f.entry.path)).toEqual(['site/annotations']);
        expect(listing.files.value[0].entry.type).toBe(1);
        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').map(c => c[1].map(i => i.entry.path));
        expect(sent).toEqual([['site/annotations'], ['site/annotations/m1-1.jpg']]);
    });

    it('a file written into a folder the list has leaves that folder as it is (once, not replaced)', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        const { dataset, listing } = setup({ path: 'annotations/m1-2.jpg', type: 3, size: 5 });
        listing.put([itemFor(dataset, { path: 'annotations', type: 1, size: 7, mtime: 1 })]);
        const folder = listing.files.value[0];
        folder.selected = true;
        emitter.emit.mockClear();
        await listing.addEntry('annotations/m1-2.jpg');
        expect(listing.files.value.map(f => f.entry.path)).toEqual(['annotations', 'ortho.tif']);
        expect(listing.files.value[0]).toBe(folder);
        expect(folder.entry).toMatchObject({ size: 7, mtime: 1 });
        expect(folder.selected).toBe(true);
        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').map(c => c[1].map(i => i.entry.path));
        expect(sent).toEqual([['annotations/m1-2.jpg']]);
    });
});

describe('the tree hears of entries outside the folder on show', () => {
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

describe('the folder on show leaves the dataset path it had (deleted, renamed or moved from the tree)', () => {
    const opened = emitter => emitter.emit.mock.calls.filter(c => c[0] === 'folderOpened').map(c => c[1]);

    async function showing(folder) {
        const emitter = (await import('@/libs/eventBus')).default;
        const { listing } = setup(entry);
        listing.currentPath.value = folder;
        emitter.emit.mockClear();
        return { emitter, listing };
    }

    it('opens the folder that held it, after the tree heard of the removal', async () => {
        const { emitter, listing } = await showing('a/b');
        listing.removed(['a/b']);
        expect(emitter.emit.mock.calls).toEqual([['deleteEntries', { dataset: { org: 'o', ds: 'd' }, paths: ['a/b'] }], ['folderOpened', ['a']]]);
    });

    it('opens the root for a folder of the root, as the root crumb of the path does', async () => {
        const { default: pathutils } = await import('@/libs/ddb/pathutils');
        const { emitter, listing } = await showing('out');
        listing.removed(['out']);
        expect(opened(emitter)).toEqual([pathutils.getTree('/')]);
        expect(opened(emitter)[0].at(-1)).toBe('/');
    });

    it('opens the folder that held the outermost removed folder when the one on show was inside it', async () => {
        const { emitter, listing } = await showing('a/b/c');
        listing.removed(['a/b/c', 'a/b', 'x.jpg']);
        expect(opened(emitter)).toEqual([['a']]);
    });

    it('stays where it is when what was removed is in the folder, next to it, or a folder whose name only starts the same', async () => {
        const { emitter, listing } = await showing('a/b');
        listing.removed(['a/b/photo.jpg', 'a/c', 'a/bc', 'a/b2']);
        expect(opened(emitter)).toEqual([]);
        expect(emitter.emit).toHaveBeenCalledWith('deleteEntries', { dataset: { org: 'o', ds: 'd' }, paths: ['a/b/photo.jpg', 'a/c', 'a/bc', 'a/b2'] });
    });

    it('stays at the root, which nothing removes', async () => {
        for (const root of [null, '']) {
            const { emitter, listing } = await showing(root);
            listing.removed(['a', 'b.jpg']);
            expect(opened(emitter)).toEqual([]);
            expect(listing.files.value.map(f => f.entry.path)).toEqual(['ortho.tif']);
        }
    });

    it('says nothing when nothing was removed', async () => {
        const { emitter, listing } = await showing('a');
        listing.removed([]);
        expect(emitter.emit).not.toHaveBeenCalled();
    });
});

describe('the list showed only what was removed (items picked in the tree are listed without the rest of their folder)', () => {
    const opened = emitter => emitter.emit.mock.calls.filter(c => c[0] === 'folderOpened').map(c => c[1]);

    // A file of `folder` picked in the tree: the list shows it alone
    async function picked(folder, path) {
        const emitter = (await import('@/libs/eventBus')).default;
        const { dataset, listing } = setup(entry);
        listing.currentPath.value = folder;
        listing.files.value = [itemFor(dataset, { ...entry, path })];
        emitter.emit.mockClear();
        return { emitter, listing, dataset };
    }

    it('opens the folder on show, which may hold other files, after the tree heard of the removal', async () => {
        const { emitter, listing } = await picked('out', 'out/ortho.tif');
        listing.removed(['out/ortho.tif']);
        expect(listing.files.value).toEqual([]);
        expect(emitter.emit.mock.calls).toEqual([['deleteEntries', { dataset: { org: 'o', ds: 'd' }, paths: ['out/ortho.tif'] }], ['folderOpened', ['out']]]);
    });

    it('opens the root for a file of the root', async () => {
        const { default: pathutils } = await import('@/libs/ddb/pathutils');
        for (const root of [null, '']) {
            const { emitter, listing } = await picked(root, 'ortho.tif');
            listing.removed(['ortho.tif']);
            expect(opened(emitter)).toEqual([pathutils.getTree('/')]);
        }
    });

    it('keeps showing a picked file that is renamed: it comes to its new path before it leaves the old one', async () => {
        const { emitter, listing, dataset } = await picked('out', 'out/ortho.tif');
        listing.added([itemFor(dataset, { ...entry, path: 'out/ortho-2026.tif' })]);
        listing.removed(['out/ortho.tif']);
        expect(listing.files.value.map(f => f.entry.path)).toEqual(['out/ortho-2026.tif']);
        expect(opened(emitter)).toEqual([]);
    });

    it('opens nothing while the list still shows something, or showed nothing', async () => {
        const { emitter, listing, dataset } = await picked('out', 'out/ortho.tif');
        listing.put([itemFor(dataset, { ...entry, path: 'out/dsm.tif' })]);
        emitter.emit.mockClear();
        listing.removed(['out/ortho.tif']);
        expect(opened(emitter)).toEqual([]);

        // An empty list that loses nothing: a file of another folder
        listing.removed(['out/dsm.tif']);
        emitter.emit.mockClear();
        listing.removed(['elsewhere/x.tif']);
        expect(opened(emitter)).toEqual([]);
    });
});

describe('a file uploaded again under the name of a file on show', () => {
    it('replaces the item: the new size, date and hash show, and the selection stays', async () => {
        const { listing } = setup({});
        listing.files.value[0].selected = true;
        listing.uploaded([{ ...entry, size: 99, hash: 'h2', buildStatus: undefined }]);

        expect(listing.files.value).toHaveLength(1);
        expect(listing.files.value[0].entry).toMatchObject({ size: 99, hash: 'h2' });
        expect(listing.files.value[0].selected).toBe(true);
    });

    it('has its build followed again, though no item is new', async () => {
        const { default: BuildManager } = await import('@/libs/build/buildManager');
        BuildManager.onFilesAdded.mockClear();
        const { listing } = setup({});
        const again = { ...entry, hash: 'h2' };
        listing.uploaded([again]);

        expect(BuildManager.onFilesAdded).toHaveBeenCalledWith(expect.anything(), [again]);
    });

    it('tells the tree of the new entry, not the old one', async () => {
        const emitter = (await import('@/libs/eventBus')).default;
        emitter.emit.mockClear();
        const { listing } = setup({});
        listing.uploaded([{ ...entry, hash: 'h2' }]);

        const sent = emitter.emit.mock.calls.filter(c => c[0] === 'addItems').flatMap(c => c[1]);
        expect(sent.map(i => i.entry.hash)).toEqual(['h2']);
    });
});

describe('reload answers late', () => {
    const deferred = () => {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        return { promise, resolve };
    };
    const listed = (...paths) => paths.map(path => ({ path, type: 3, size: 1 }));

    it('puts nothing of the old folder under the folder opened since', async () => {
        const { dataset, listing } = setup({});
        const slow = deferred();
        dataset.list = vi.fn(() => slow.promise);
        listing.currentPath.value = 'old';
        const pending = listing.reload();
        listing.currentPath.value = 'new';
        listing.files.value = [];
        slow.resolve(listed('old/a.jpg'));
        await pending;

        expect(listing.files.value).toEqual([]);
    });

    it('lets the newest reload give the list, whichever answers first', async () => {
        const { dataset, listing } = setup({});
        const first = deferred();
        const second = deferred();
        dataset.list = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const a = listing.reload();
        const b = listing.reload();
        second.resolve(listed('new.jpg'));
        await b;
        first.resolve(listed('stale.jpg'));
        await a;

        expect(listing.files.value.map(f => f.entry.path)).toEqual(['new.jpg']);
    });
});

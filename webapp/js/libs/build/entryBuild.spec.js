import { describe, it, expect, vi } from 'vitest';
import { currentEntry } from './entryBuild';

const COG = { role: 'raster.cog', url: '/orgs/o/ds/d/build/h/cog/cog.tif', mediaType: 'image/tiff' };

describe('currentEntry', () => {
    const stale = { path: 'a/ortho.tif', hash: 'h' };
    const fresh = { path: 'a/ortho.tif', hash: 'h', artifacts: [COG] };

    it('keeps a snapshot that already answers: no request', async () => {
        const dataset = { listOne: vi.fn() };
        expect(await currentEntry(dataset, fresh, e => !!e.artifacts)).toBe(fresh);
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('lists the entry again, once, when the snapshot does not answer (the build finished after the listing)', async () => {
        const dataset = { listOne: vi.fn(async () => fresh) };
        expect(await currentEntry(dataset, stale, e => !!e.artifacts)).toBe(fresh);
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
        expect(dataset.listOne).toHaveBeenCalledWith('a/ortho.tif');
    });

    it('does not hide a failed listing', async () => {
        const dataset = { listOne: vi.fn(async () => { throw new Error('Cannot find: a/ortho.tif'); }) };
        await expect(currentEntry(dataset, stale, () => false)).rejects.toThrow('Cannot find');
    });
});

/**
 * The search for files to pick: by part of the name over the whole dataset, of some entry types (the images by
 * default), merged and sorted by path, at most PICK_LIMIT.
 */
import { describe, it, expect, vi } from 'vitest';
import { findEntries, PICK_LIMIT } from './findEntries';

const dataset = (search = vi.fn(async () => [])) => ({ search });

describe('findEntries', () => {
    it('searches the whole dataset for pictures by default and merges the types, sorted by path', async () => {
        const ds = dataset(vi.fn(async (_q, { type }) => (type === 3 ? [{ path: 'b.jpg' }] : [{ path: 'a.jpg' }, { path: 'c.png' }])));
        const found = await findEntries(ds, ' roof ');
        expect(found.map(e => e.path)).toEqual(['a.jpg', 'b.jpg', 'c.png']);
        expect(ds.search).toHaveBeenCalledWith('*roof*', expect.objectContaining({ recursive: true, type: 3 }));
        expect(ds.search).toHaveBeenCalledWith('*roof*', expect.objectContaining({ recursive: true, type: 6 }));
        expect(ds.search).toHaveBeenCalledTimes(2);
    });

    it('searches the types it is given', async () => {
        const ds = dataset();
        await findEntries(ds, '', { types: [4] });
        expect(ds.search).toHaveBeenCalledTimes(1);
        expect(ds.search).toHaveBeenCalledWith('**', expect.objectContaining({ type: 4 }));
    });

    it('returns at most the limit', async () => {
        const many = Array.from({ length: PICK_LIMIT + 20 }, (_, i) => ({ path: `p${String(i).padStart(3, '0')}.jpg` }));
        expect(await findEntries(dataset(vi.fn(async () => many)), '', { types: [6] })).toHaveLength(PICK_LIMIT);
    });
});

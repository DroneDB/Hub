import { describe, it, expect, vi } from 'vitest';
import { stateFromPaths } from './compareState';
import {
    savedComparisons, comparisonsUsing, saveNew, updateSaved, deleteSaved, savedChange, saveProblem, MAX_NAME_LENGTH
} from './comparisonStore';

const saved = (uid, name, extra = {}) => ({ ...stateFromPaths(['a/o.tif', 'b/o.tif']), uid, name, updatedAt: '2026-01-01T00:00:00.000Z', ...extra });

/** A dataset whose meta list `comparisons` behaves like the server's (ids, mtime in seconds). */
function fakeDataset(items = []) {
    let seq = 100;
    const ds = {
        items: items.map(i => ({ ...i })),
        calls: [],
        info: vi.fn(async () => [{ properties: { meta: { comparisons: ds.items.map(i => ({ ...i, data: JSON.stringify(i.data) })) } } }]),
        metaAdd: vi.fn(async (key, data) => {
            ds.calls.push(['add', data.uid]);
            const item = { id: `m${++seq}`, mtime: 2000, data };
            ds.items.push(item);
            return item;
        }),
        metaRemove: vi.fn(async id => {
            ds.calls.push(['remove', id]);
            ds.items = ds.items.filter(i => i.id !== id);
            return { count: 1 };
        })
    };
    return ds;
}

describe('savedComparisons', () => {
    it('keeps valid items, one per uid, sorted by name', () => {
        const root = { properties: { meta: { comparisons: [
            { id: 'm1', mtime: 10, data: saved('c_b', 'beta') },
            { id: 'm2', mtime: 10, data: saved('c_a', 'Alpha') },
            { id: 'm3', mtime: 10, data: { uid: 'c_x', name: 'broken', v: 1, layers: [] } },
            { id: 'm4', mtime: 10, data: '{not json' },
            { id: 'm5', mtime: 10, data: saved('c_n', '') }
        ] } } };
        expect(savedComparisons(root).map(c => c.name)).toEqual(['Alpha', 'beta']);
        expect(savedComparisons(null)).toEqual([]);
    });

    it('lists an item of a later version by its name', () => {
        const root = { properties: { meta: { comparisons: [{ id: 'm1', mtime: 1, data: { v: 2, uid: 'c_n', name: 'Next' } }] } } };
        expect(savedComparisons(root)).toMatchObject([{ uid: 'c_n', name: 'Next', newerVersion: true }]);
    });

    it('takes the latest of duplicate items: mtime, then updatedAt, then id', () => {
        const at = (id, mtime, updatedAt, name) => ({ id, mtime, data: saved('c_1', name, { updatedAt }) });
        const pick = items => savedComparisons({ properties: { meta: { comparisons: items } } })[0].name;
        expect(pick([at('m1', 5, 'z', 'old'), at('m2', 6, 'a', 'new')])).toBe('new');
        expect(pick([at('m1', 5, '2026-01-02', 'new'), at('m2', 5, '2026-01-01', 'old')])).toBe('new');
        expect(pick([at('m2', 5, 'x', 'new'), at('m1', 5, 'x', 'old')])).toBe('new');
    });
});

describe('comparisonsUsing', () => {
    it('finds the comparisons that show a file', () => {
        const list = savedComparisons({ properties: { meta: { comparisons: [{ id: 'm1', mtime: 1, data: saved('c_1', 'S1') }] } } });
        expect(comparisonsUsing(list, 'a/o.tif').map(c => c.name)).toEqual(['S1']);
        expect(comparisonsUsing(list, 'c/o.tif')).toEqual([]);
    });
});

describe('saving', () => {
    it('saves a new comparison with a fresh uid and audit fields', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('c_1', 'S1') }]);
        const r = await saveNew(ds, stateFromPaths(['x.tif']), { name: '  S2 ', user: 'u', now: new Date('2026-10-28T10:00:00Z') });
        expect(r.uid).not.toBe('c_1');
        expect(r.data).toMatchObject({ name: 'S2', createdBy: 'u', updatedBy: 'u', createdAt: '2026-10-28T10:00:00.000Z' });
        expect(ds.metaAdd).toHaveBeenCalledWith('comparisons', r.data);
    });

    it('updates by adding first, then removing every other item of the uid', async () => {
        const ds = fakeDataset([
            { id: 'm1', mtime: 1, data: saved('c_1', 'S1', { createdBy: 'a', createdAt: 'then' }) },
            { id: 'm2', mtime: 0, data: saved('c_1', 'S1 dup') },
            { id: 'm3', mtime: 1, data: saved('c_2', 'Other') }
        ]);
        const state = stateFromPaths(['x.tif']);
        const r = await updateSaved(ds, 'c_1', { state, user: 'b' });
        expect(ds.calls[0]).toEqual(['add', 'c_1']);
        expect(ds.calls.slice(1).map(c => c[1]).sort()).toEqual(['m1', 'm2']);
        expect(r.data).toMatchObject({ uid: 'c_1', createdBy: 'a', createdAt: 'then', updatedBy: 'b', layers: state.layers });
        expect(ds.items.map(i => i.data.uid).sort()).toEqual(['c_1', 'c_2']);
    });

    it('keeps the old item when the add fails', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('c_1', 'S1') }]);
        ds.metaAdd.mockRejectedValueOnce(new Error('403'));
        await expect(updateSaved(ds, 'c_1', { state: stateFromPaths(['x.tif']), user: 'b' })).rejects.toThrow('403');
        expect(ds.metaRemove).not.toHaveBeenCalled();
        expect(ds.items).toHaveLength(1);
    });

    it('renames without changing the comparison', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('c_1', 'S1') }]);
        const r = await updateSaved(ds, 'c_1', { name: 'S2', user: 'b' });
        expect(r.name).toBe('S2');
        expect(r.data.layers.map(l => l.path)).toEqual(['a/o.tif', 'b/o.tif']);
    });

    it('deletes every item of the uid', async () => {
        const ds = fakeDataset([
            { id: 'm1', mtime: 1, data: saved('c_1', 'S1') },
            { id: 'm2', mtime: 1, data: saved('c_1', 'S1') },
            { id: 'm3', mtime: 1, data: saved('c_2', 'S2') }
        ]);
        await deleteSaved(ds, 'c_1');
        expect(ds.items.map(i => i.id)).toEqual(['m3']);
    });

    it('tells a changed or deleted comparison', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('c_1', 'S1') }]);
        expect(await savedChange(ds, 'c_1', 'm1')).toBeNull();
        await updateSaved(ds, 'c_1', { name: 'S1b', user: 'x' });
        expect(await savedChange(ds, 'c_1', 'm1')).toBe('changed');
        await deleteSaved(ds, 'c_1');
        expect(await savedChange(ds, 'c_1', 'm1')).toBe('deleted');
    });

    it('refuses bad names and oversized comparisons before calling the server', async () => {
        const data = saved('c_1', 'x');
        expect(saveProblem('', data)).toBeTruthy();
        expect(saveProblem('x'.repeat(MAX_NAME_LENGTH + 1), data)).toBeTruthy();
        const big = { ...data, layers: [{ ...data.layers[0], vizParams: { formula: 'x'.repeat(17000) } }] };
        expect(saveProblem('ok', big)).toMatch(/too large/);
        const ds = fakeDataset();
        await expect(saveNew(ds, big, { name: 'ok', user: 'u' })).rejects.toThrow(/too large/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });
});

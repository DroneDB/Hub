import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMetaListStore } from './metaListStore';
import { fakeMetaDataset } from './fakeMetaDataset';

const KEY = 'things';

/** A store of things whose data must be {v: 1, size: number}. */
function thingStore(overrides = {}) {
    return createMetaListStore({
        key: KEY,
        uidPrefix: 't_',
        maxItems: 3,
        maxBytes: 300,
        maxNameLength: 10,
        label: { one: 'thing', many: 'things' },
        validate: data => {
            if (data.v > 1) return { error: null, newerVersion: true };
            return typeof data.size === 'number' ? { error: null, newerVersion: false } : { error: 'no size', newerVersion: false };
        },
        ...overrides
    });
}

const thing = (uid, name, extra = {}) => ({ v: 1, size: 1, uid, name, updatedAt: '2026-01-01T00:00:00.000Z', ...extra });

afterEach(() => vi.restoreAllMocks());

describe('list', () => {
    it('reads the key, keeps one entry per uid and sorts by name', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: thing('t_b', 'beta') },
            { id: 'm2', mtime: 1, data: thing('t_a', 'Alpha') }
        ]);
        const { entries, invalid } = await thingStore().list(ds);
        expect(entries.map(e => e.name)).toEqual(['Alpha', 'beta']);
        expect(entries[0]).toMatchObject({ id: 'm2', uid: 't_a', newerVersion: false, error: null });
        expect(invalid).toEqual([]);
        expect(ds.metaGet).toHaveBeenCalledWith(KEY, '', { cache: true });
    });

    it('reads from the server, not the request cache, when fresh', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        await thingStore().list(ds, { fresh: true });
        expect(ds.metaGet).toHaveBeenCalledWith(KEY, '', { cache: false });
    });

    it('is empty on not found and fails on any other error', async () => {
        expect(await thingStore().list(fakeMetaDataset())).toEqual({ entries: [], invalid: [] });
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        ds.metaGet.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
        await expect(thingStore().list(ds)).rejects.toThrow('boom');
    });

    it('returns the items that are no entry, by meta id and with the reason, without logging', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: thing('t_ok', 'ok') },
            { id: 'm2', mtime: 1, data: '{not json' },
            { id: 'm3', mtime: 1, data: '[1,2]' },
            { id: 'm4', mtime: 1, data: '"text"' },
            { id: 'm5', mtime: 1, data: thing('t_n', '   ') },
            { id: 'm6', mtime: 1, data: thing('', 'no uid') },
            { id: 'm7', mtime: 1, data: thing('t_l', 'x'.repeat(11)) }
        ]);
        const { entries, invalid } = await thingStore().list(ds);
        expect(entries.map(e => e.name)).toEqual(['ok']);
        expect(invalid.map(i => i.id)).toEqual(['m2', 'm3', 'm4', 'm5', 'm6', 'm7']);
        expect(invalid.every(i => typeof i.error === 'string' && i.error)).toBe(true);
        expect(invalid[0].error).toMatch(/not a JSON object/);
        expect(invalid[3].error).toMatch(/no valid name/);
        expect(invalid[4].error).toMatch(/no uid/);
        expect(error).not.toHaveBeenCalled();
    });

    it('lists an entry that fails validation with the reason, and one of a later version flagged', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: thing('t_x', 'broken', { size: 'big' }) },
            { id: 'm2', mtime: 1, data: { v: 2, uid: 't_n', name: 'Next' } }
        ]);
        const { entries } = await thingStore().list(ds);
        expect(entries).toMatchObject([
            { uid: 't_x', error: 'no size', newerVersion: false },
            { uid: 't_n', error: null, newerVersion: true }
        ]);
    });

    it('takes the latest of duplicate items: mtime, then the update time, then id', async () => {
        const at = (id, mtime, updatedAt, name) => ({ id, mtime, data: thing('t_1', name, { updatedAt }) });
        const pick = async items => (await thingStore().list(fakeMetaDataset(items))).entries[0].name;
        expect(await pick([at('m1', 5, 'z', 'old'), at('m2', 6, 'a', 'new')])).toBe('new');
        expect(await pick([at('m1', 5, '2026-01-02', 'new'), at('m2', 5, '2026-01-01', 'old')])).toBe('new');
        expect(await pick([at('m2', 5, 'x', 'new'), at('m1', 5, 'x', 'old')])).toBe('new');
    });

    it('compares the update time under the name the audit setting gives it', async () => {
        const store = thingStore({ audit: { createdBy: null, createdAt: null, updatedBy: null, updatedAt: 'changedAt' } });
        const at = (id, changedAt, name) => ({ id, mtime: 5, data: { v: 1, size: 1, uid: 't_1', name, changedAt } });
        const ds = fakeMetaDataset([at('m1', '2026-01-02', 'new'), at('m2', '2026-01-01', 'old')]);
        expect((await store.list(ds)).entries[0].name).toBe('new');
    });
});

describe('newUid', () => {
    it('is the prefix and 8 base36 characters, and not one that is taken', () => {
        const store = thingStore();
        for (let i = 0; i < 50; i++) expect(store.newUid([])).toMatch(/^t_[0-9a-z]{8}$/);
        const spy = vi.spyOn(crypto, 'getRandomValues')
            .mockImplementationOnce(a => a.fill(0))
            .mockImplementationOnce(a => a.fill(1));
        expect(store.newUid(['t_00000000'])).toBe('t_11111111');
        expect(spy).toHaveBeenCalledTimes(2);
    });
});

describe('saveProblem', () => {
    const store = thingStore({ precheck: data => data.forbidden ? 'Forbidden.' : null });

    it('checks the name, the size in bytes, the precheck and the validation, in that order', () => {
        expect(store.saveProblem('ok', thing('t_1', 'ok'))).toBeNull();
        expect(store.saveProblem('  ', thing('t_1', 'x'))).toBe('The name must be 1 to 10 characters long.');
        expect(store.saveProblem('x'.repeat(11), thing('t_1', 'x'))).toBeTruthy();
        expect(store.saveProblem('x'.repeat(10), thing('t_1', 'x'))).toBeNull();
        // 200 characters of 2 bytes each: under 300 as text, over it as UTF-8
        expect(store.saveProblem('ok', thing('t_1', 'x', { text: 'é'.repeat(200) }))).toBe('This thing is too large to save: it can take at most 300 bytes.');
        expect(store.saveProblem('ok', thing('t_1', 'x', { forbidden: true, size: 'x' }))).toBe('Forbidden.');
        expect(store.saveProblem('ok', thing('t_1', 'x', { size: 'x' }))).toBe('This thing cannot be saved: no size.');
    });

    it('uses the message the caller gives for a large item', () => {
        const custom = thingStore({ tooLarge: 'Too big.' });
        expect(custom.saveProblem('ok', thing('t_1', 'x', { text: 'x'.repeat(400) }))).toBe('Too big.');
    });
});

describe('saveNew', () => {
    it('adds an entry with a fresh uid and the audit fields, after a fresh read', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        const r = await thingStore().saveNew(ds, { v: 1, size: 2, uid: 'stale' }, { name: '  two ', user: 'u', now: new Date('2026-10-28T10:00:00Z') });
        expect(r.uid).toMatch(/^t_[0-9a-z]{8}$/);
        expect(r.data).toMatchObject({
            v: 1, size: 2, name: 'two', createdBy: 'u', updatedBy: 'u',
            createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z'
        });
        expect(ds.metaAdd).toHaveBeenCalledWith(KEY, r.data);
        expect(ds.calls[0]).toEqual(['get', KEY, false]);
        expect(ds.calls[1][0]).toBe('add');
    });

    it('keeps only the audit fields the settings name', async () => {
        const store = thingStore({ audit: { createdBy: 'by', createdAt: 'at', updatedBy: null, updatedAt: 'changedAt' } });
        const r = await store.saveNew(fakeMetaDataset(), { v: 1, size: 1 }, { name: 'n', user: 'u', now: new Date('2026-10-28T10:00:00Z') });
        expect(r.data).toMatchObject({ by: 'u', at: '2026-10-28T10:00:00.000Z', changedAt: '2026-10-28T10:00:00.000Z' });
        expect(r.data).not.toHaveProperty('createdBy');
        expect(r.data).not.toHaveProperty('updatedBy');
        expect(r.data).not.toHaveProperty('updatedAt');
    });

    it('refuses at the cap, counting each uid once and not the items that are no entry, without writing', async () => {
        const items = [1, 2, 3].map(i => ({ id: `m${i}`, mtime: 1, data: thing(`t_${i}`, `n${i}`) }));
        items.push({ id: 'dup', mtime: 2, data: thing('t_1', 'n1 again') }, { id: 'bad', mtime: 1, data: '{x' });
        const full = fakeMetaDataset(items);
        await expect(thingStore().saveNew(full, { v: 1, size: 1 }, { name: 'more', user: 'u' }))
            .rejects.toThrow('This dataset has 3 things. Delete one to save a new thing.');
        expect(full.metaAdd).not.toHaveBeenCalled();
        const almost = fakeMetaDataset(items.slice(0, 2).concat(items[4]));
        await expect(thingStore().saveNew(almost, { v: 1, size: 1 }, { name: 'last', user: 'u' })).resolves.toBeTruthy();
    });

    it('refuses a bad name, a large item and an invalid one before writing, and lets a failed write through', async () => {
        const ds = fakeMetaDataset();
        const store = thingStore();
        await expect(store.saveNew(ds, { v: 1, size: 1 }, { name: ' ', user: 'u' })).rejects.toThrow(/name must be/);
        await expect(store.saveNew(ds, { v: 1, size: 1, text: 'x'.repeat(400) }, { name: 'n', user: 'u' })).rejects.toThrow(/too large/);
        await expect(store.saveNew(ds, { v: 1 }, { name: 'n', user: 'u' })).rejects.toThrow('This thing cannot be saved: no size.');
        expect(ds.metaAdd).not.toHaveBeenCalled();
        ds.metaAdd.mockRejectedValueOnce(new Error('403'));
        await expect(store.saveNew(ds, { v: 1, size: 1 }, { name: 'n', user: 'u' })).rejects.toThrow('403');
    });
});

describe('update', () => {
    it('adds first, then removes every other item of the uid, keeping the creation fields', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: thing('t_1', 'one', { createdBy: 'a', createdAt: 'then' }) },
            { id: 'm2', mtime: 0, data: thing('t_1', 'one dup') },
            { id: 'm3', mtime: 1, data: thing('t_2', 'other') }
        ]);
        const r = await thingStore().update(ds, 't_1', { body: { v: 1, size: 9 }, user: 'b', now: new Date('2026-10-28T10:00:00Z') });
        expect(ds.calls[0]).toEqual(['get', KEY, false]);
        expect(ds.calls[1]).toEqual(['add', 't_1']);
        expect(ds.calls.slice(2).map(c => c[1]).sort()).toEqual(['m1', 'm2']);
        expect(r.data).toMatchObject({ uid: 't_1', name: 'one', size: 9, createdBy: 'a', createdAt: 'then', updatedBy: 'b', updatedAt: '2026-10-28T10:00:00.000Z' });
        expect(ds.items.map(i => i.data.uid).sort()).toEqual(['t_1', 't_2']);
    });

    it('keeps the saved data when it is only renamed', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one', { size: 7 }) }]);
        const r = await thingStore().update(ds, 't_1', { name: ' two ', user: 'b' });
        expect(r).toMatchObject({ name: 'two', data: { size: 7 } });
    });

    it('keeps the old item when the add fails, and logs a failed remove but succeeds', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        ds.metaAdd.mockRejectedValueOnce(new Error('403'));
        await expect(thingStore().update(ds, 't_1', { name: 'two', user: 'b' })).rejects.toThrow('403');
        expect(ds.metaRemove).not.toHaveBeenCalled();

        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        ds.metaRemove.mockRejectedValueOnce(new Error('gone'));
        const r = await thingStore().update(ds, 't_1', { name: 'two', user: 'b' });
        expect(r.name).toBe('two');
        expect(error).toHaveBeenCalledWith('Cannot remove an old thing item:', expect.any(Error));
        expect(ds.items).toHaveLength(2);
        expect((await thingStore().list(ds)).entries.map(e => e.name)).toEqual(['two']);
    });

    it('says the entry was deleted when it is gone, and refuses a bad name or item before writing', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_2', 'other') }]);
        await expect(thingStore().update(ds, 't_1', { name: 'x', user: 'b' })).rejects.toThrow('This thing was deleted.');
        await expect(thingStore().update(fakeMetaDataset(), 't_1', { name: 'x', user: 'b' })).rejects.toThrow('This thing was deleted.');
        await expect(thingStore().update(ds, 't_2', { name: '', user: 'b' })).rejects.toThrow(/name must be/);
        await expect(thingStore().update(ds, 't_2', { body: { v: 1 }, user: 'b' })).rejects.toThrow(/no size/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });
});

describe('remove and removeItem', () => {
    it('removes every item of the uid after a fresh read, and nothing for an entry that is gone', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: thing('t_1', 'one') },
            { id: 'm2', mtime: 1, data: thing('t_1', 'one') },
            { id: 'm3', mtime: 1, data: thing('t_2', 'two') }
        ]);
        await thingStore().remove(ds, 't_1');
        expect(ds.items.map(i => i.id)).toEqual(['m3']);
        expect(ds.calls[0]).toEqual(['get', KEY, false]);
        ds.metaRemove.mockClear();
        await thingStore().remove(ds, 't_9');
        expect(ds.metaRemove).not.toHaveBeenCalled();
    });

    it('removes one item by its meta id, the way out for an item that is no entry', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: '{not json' }, { id: 'm2', mtime: 1, data: thing('t_1', 'one') }]);
        await thingStore().removeItem(ds, 'm1');
        expect(ds.items.map(i => i.id)).toEqual(['m2']);
    });
});

describe('change', () => {
    it('tells a changed or deleted entry from one that is as it was loaded', async () => {
        const store = thingStore();
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        expect(await store.change(ds, 't_1', 'm1')).toBeNull();
        await store.update(ds, 't_1', { name: 'two', user: 'x' });
        expect(await store.change(ds, 't_1', 'm1')).toBe('changed');
        await store.remove(ds, 't_1');
        expect(await store.change(ds, 't_1', 'm1')).toBe('deleted');
    });

    it('reads from the server, not the request cache', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: thing('t_1', 'one') }]);
        await thingStore().change(ds, 't_1', 'm1');
        expect(ds.metaGet).toHaveBeenCalledWith(KEY, '', { cache: false });
    });
});

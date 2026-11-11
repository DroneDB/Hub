import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultState, buildEntryState, MAX_NAME_LENGTH, MAX_VIEWS, VIEW_VERSION } from './viewState';
import {
    VIEWS_KEY, listViews, viewsUsing, saveProblem, newViewUid, saveNewView, updateView, deleteView, viewChange
} from './viewStore';

const base = { path: 'a/o.tif', hash: 'h-a' };
const twoLayers = () => buildEntryState(base, ['b/o.tif'], { baseIsGeoraster: true });
const one = () => defaultState(base, { baseIsGeoraster: true });
const saved = (uid, name, extra = {}) => ({ ...twoLayers(), uid, name, updatedAt: '2026-01-01T00:00:00.000Z', ...extra });

/** A dataset whose meta list `views` behaves like the server's: ids, mtime in seconds, data as JSON text, 404 when empty. */
function fakeDataset(items = []) {
    let seq = 100;
    const ds = {
        items: items.map(i => ({ ...i })),
        calls: [],
        metaGet: vi.fn(async (key, path, options) => {
            ds.calls.push(['get', key, options && options.cache]);
            if (!ds.items.length) throw Object.assign(new Error('No metadata found'), { status: 404 });
            return ds.items.map(i => ({ ...i, data: typeof i.data === 'string' ? i.data : JSON.stringify(i.data) }));
        }),
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

afterEach(() => vi.restoreAllMocks());

describe('listViews', () => {
    it('reads meta/get/views, keeps one item per uid and sorts by name', async () => {
        const ds = fakeDataset([
            { id: 'm1', mtime: 10, data: saved('v_b', 'beta') },
            { id: 'm2', mtime: 10, data: saved('v_a', 'Alpha') }
        ]);
        const views = await listViews(ds);
        expect(views.map(v => v.name)).toEqual(['Alpha', 'beta']);
        expect(views[0]).toMatchObject({ id: 'm2', uid: 'v_a', newerVersion: false, error: null });
        expect(ds.metaGet).toHaveBeenCalledWith(VIEWS_KEY, '', { cache: true });
    });

    it('reads from the server, not the request cache, when asked for a fresh list', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        await listViews(ds, { fresh: true });
        expect(ds.metaGet).toHaveBeenCalledWith(VIEWS_KEY, '', { cache: false });
    });

    it('is empty when the dataset answers not found, and fails on any other error', async () => {
        expect(await listViews(fakeDataset())).toEqual([]);
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        ds.metaGet.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
        await expect(listViews(ds)).rejects.toThrow('boom');
        ds.metaGet.mockRejectedValueOnce(new Error('network'));
        await expect(listViews(ds)).rejects.toThrow('network');
    });

    it('skips, and logs, items that are not a JSON object or have no uid or name', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ds = fakeDataset([
            { id: 'm1', mtime: 10, data: saved('v_ok', 'ok') },
            { id: 'm2', mtime: 10, data: '{not json' },
            { id: 'm3', mtime: 10, data: '[1,2]' },
            { id: 'm4', mtime: 10, data: '"text"' },
            { id: 'm5', mtime: 10, data: saved('v_n', '   ') },
            { id: 'm6', mtime: 10, data: saved('', 'no uid') },
            { id: 'm7', mtime: 10, data: saved('v_l', 'x'.repeat(MAX_NAME_LENGTH + 1)) }
        ]);
        expect((await listViews(ds)).map(v => v.name)).toEqual(['ok']);
        expect(error).toHaveBeenCalledTimes(6);
    });

    it('lists a view that fails validation with the reason, so it can be deleted', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: { ...saved('v_x', 'broken'), layers: [{ path: '../x.tif' }] } }]);
        const [view] = await listViews(ds);
        expect(view).toMatchObject({ uid: 'v_x', name: 'broken', newerVersion: false });
        expect(view.error).toMatch(/layer path/);
    });

    it('sorts names the way people read them: accents, case and numbers', async () => {
        const names = ['Site 10', 'site 2', 'Évora', 'Zurich', 'evora b'];
        const ds = fakeDataset(names.map((name, i) => ({ id: `m${i}`, mtime: 1, data: saved(`v_${i}`, name) })));
        expect((await listViews(ds)).map(v => v.name)).toEqual(['Évora', 'evora b', 'site 2', 'Site 10', 'Zurich']);
    });

    it('lists an item of a later version by its name, flagged', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: { v: VIEW_VERSION + 1, uid: 'v_n', name: 'Next' } }]);
        expect(await listViews(ds)).toMatchObject([{ uid: 'v_n', name: 'Next', newerVersion: true, error: null }]);
    });

    it('takes the latest of duplicate items: mtime, then updatedAt, then id', async () => {
        const at = (id, mtime, updatedAt, name) => ({ id, mtime, data: saved('v_1', name, { updatedAt }) });
        const pick = async items => (await listViews(fakeDataset(items)))[0].name;
        expect(await pick([at('m1', 5, 'z', 'old'), at('m2', 6, 'a', 'new')])).toBe('new');
        expect(await pick([at('m1', 5, '2026-01-02', 'new'), at('m2', 5, '2026-01-01', 'old')])).toBe('new');
        expect(await pick([at('m2', 5, 'x', 'new'), at('m1', 5, 'x', 'old')])).toBe('new');
    });

    it('trims the name it lists', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', '  S1 ') }]);
        expect((await listViews(ds))[0].name).toBe('S1');
    });
});

describe('viewsUsing', () => {
    it('finds the views that show a file as a layer or as the base', async () => {
        const vector = { ...defaultState({ path: 'sites.gpkg', hash: '' }, { baseIsGeoraster: false }), uid: 'v_2', name: 'S2' };
        const ds = fakeDataset([
            { id: 'm1', mtime: 1, data: saved('v_1', 'S1') },
            { id: 'm2', mtime: 1, data: vector },
            { id: 'm3', mtime: 1, data: { v: VIEW_VERSION + 1, uid: 'v_3', name: 'Next' } },
            { id: 'm4', mtime: 1, data: { ...saved('v_4', 'broken'), layers: 'x' } }
        ]);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const views = await listViews(ds);
        expect(viewsUsing(views, 'a/o.tif').map(v => v.name)).toEqual(['S1']);
        expect(viewsUsing(views, 'b/o.tif').map(v => v.name)).toEqual(['S1']);
        expect(viewsUsing(views, 'sites.gpkg').map(v => v.name)).toEqual(['S2']);
        expect(viewsUsing(views, 'c/o.tif')).toEqual([]);
    });
});

describe('saveProblem', () => {
    it('accepts a good view', () => {
        expect(saveProblem('ok', saved('v_1', 'ok'))).toBeNull();
    });

    it('refuses bad names', () => {
        const data = saved('v_1', 'x');
        expect(saveProblem('', data)).toBe(`The name must be 1 to ${MAX_NAME_LENGTH} characters long.`);
        expect(saveProblem('   ', data)).toBeTruthy();
        expect(saveProblem('x'.repeat(MAX_NAME_LENGTH + 1), data)).toBeTruthy();
        expect(saveProblem('x'.repeat(MAX_NAME_LENGTH), data)).toBeNull();
    });

    it('refuses a view over 16 KB of UTF-8 JSON, counting bytes and not characters', () => {
        const data = saved('v_1', 'x');
        const big = text => ({ ...data, layers: [{ ...data.layers[0], vizParams: { formula: text } }, data.layers[1]] });
        const message = 'This view is too large to save. Remove plant health settings or layers and try again.';
        expect(saveProblem('ok', big('x'.repeat(17000)))).toBe(message);
        // 8100 characters of 2 bytes each: under 16 KB as text, over it as UTF-8
        expect(saveProblem('ok', big('é'.repeat(9000)))).toBe(message);
        expect(saveProblem('ok', big('x'.repeat(2000)))).toBeNull();
    });

    it('refuses a layer path that could leave the dataset', () => {
        const data = saved('v_1', 'x');
        data.layers[1].path = '../other/x.tif';
        expect(saveProblem('ok', data)).toBe('A layer path is not valid.');
    });

    it('refuses a state the viewer could not open again', () => {
        const data = saved('v_1', 'x');
        data.analysis.target = 'elsewhere.tif';
        expect(saveProblem('ok', data)).toMatch(/cannot be saved.*elevation model/);
    });
});

describe('newViewUid', () => {
    it('is v_ and 8 base36 characters, and not one that is taken', () => {
        for (let i = 0; i < 50; i++) expect(newViewUid([])).toMatch(/^v_[0-9a-z]{8}$/);
        const spy = vi.spyOn(crypto, 'getRandomValues')
            .mockImplementationOnce(a => a.fill(0))
            .mockImplementationOnce(a => a.fill(1));
        expect(newViewUid(['v_00000000'])).toBe('v_11111111');
        expect(spy).toHaveBeenCalledTimes(2);
    });
});

describe('saving a new view', () => {
    it('adds it to the list views with a fresh uid and audit fields, after a fresh read', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        const state = twoLayers();
        state.view = { center: [1, 2], zoom: 3, rotation: 0 };
        const r = await saveNewView(ds, state, { name: '  S2 ', user: 'u', now: new Date('2026-10-28T10:00:00Z') });
        expect(r.uid).toMatch(/^v_[0-9a-z]{8}$/);
        expect(r.uid).not.toBe('v_1');
        expect(r.data).toMatchObject({
            name: 'S2', createdBy: 'u', updatedBy: 'u', createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z',
            v: VIEW_VERSION, base, layers: state.layers, view: state.view
        });
        expect(ds.metaAdd).toHaveBeenCalledWith(VIEWS_KEY, r.data);
        expect(ds.calls[0]).toEqual(['get', VIEWS_KEY, false]);
        expect(ds.calls[1][0]).toBe('add');
    });

    it('stores the working fields only', async () => {
        const ds = fakeDataset();
        const state = { ...twoLayers(), uid: 'v_old', name: 'old', unrelated: 1 };
        const r = await saveNewView(ds, state, { name: 'S', user: 'u' });
        expect(r.data.uid).not.toBe('v_old');
        expect(r.data).not.toHaveProperty('unrelated');
    });

    it('refuses at 100 saved views, counting each uid once, without calling the server', async () => {
        const items = Array.from({ length: MAX_VIEWS }, (_, i) => ({ id: `m${i}`, mtime: 1, data: saved(`v_${i}`, `S${i}`) }));
        items.push({ id: 'dup', mtime: 2, data: saved('v_0', 'S0 again') });
        const full = fakeDataset(items);
        await expect(saveNewView(full, twoLayers(), { name: 'one more', user: 'u' }))
            .rejects.toThrow('This dataset has 100 saved views. Delete one to save a new view.');
        expect(full.metaAdd).not.toHaveBeenCalled();

        const almost = fakeDataset(items.slice(0, MAX_VIEWS - 1));
        await expect(saveNewView(almost, twoLayers(), { name: 'the last', user: 'u' })).resolves.toBeTruthy();
    });

    it('refuses bad names and oversized views before writing', async () => {
        const big = twoLayers();
        big.layers[0].vizParams = { formula: 'x'.repeat(17000) };
        const ds = fakeDataset();
        await expect(saveNewView(ds, big, { name: 'ok', user: 'u' })).rejects.toThrow(/too large/);
        await expect(saveNewView(ds, twoLayers(), { name: ' ', user: 'u' })).rejects.toThrow(/name must be/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });

    it('lets a failed write through', async () => {
        const ds = fakeDataset();
        ds.metaAdd.mockRejectedValueOnce(new Error('403'));
        await expect(saveNewView(ds, one(), { name: 'S', user: 'u' })).rejects.toThrow('403');
    });
});

describe('updating a view', () => {
    it('adds first, then removes every other item of the uid, after a fresh read', async () => {
        const ds = fakeDataset([
            { id: 'm1', mtime: 1, data: saved('v_1', 'S1', { createdBy: 'a', createdAt: 'then' }) },
            { id: 'm2', mtime: 0, data: saved('v_1', 'S1 dup') },
            { id: 'm3', mtime: 1, data: saved('v_2', 'Other') }
        ]);
        const state = one();
        const r = await updateView(ds, 'v_1', { state, user: 'b', now: new Date('2026-10-28T10:00:00Z') });
        expect(ds.calls[0]).toEqual(['get', VIEWS_KEY, false]);
        expect(ds.calls[1]).toEqual(['add', 'v_1']);
        expect(ds.calls.slice(2).map(c => c[1]).sort()).toEqual(['m1', 'm2']);
        expect(r.data).toMatchObject({
            uid: 'v_1', name: 'S1', createdBy: 'a', createdAt: 'then', updatedBy: 'b', updatedAt: '2026-10-28T10:00:00.000Z', layers: state.layers
        });
        expect(ds.items.map(i => i.data.uid).sort()).toEqual(['v_1', 'v_2']);
    });

    it('keeps the old item when the add fails', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        ds.metaAdd.mockRejectedValueOnce(new Error('403'));
        await expect(updateView(ds, 'v_1', { state: one(), user: 'b' })).rejects.toThrow('403');
        expect(ds.metaRemove).not.toHaveBeenCalled();
        expect(ds.items).toHaveLength(1);
    });

    it('logs a failed remove and still succeeds, leaving a duplicate the latest item hides', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        ds.metaRemove.mockRejectedValueOnce(new Error('gone'));
        const r = await updateView(ds, 'v_1', { name: 'S1b', user: 'b' });
        expect(r.name).toBe('S1b');
        expect(error).toHaveBeenCalled();
        expect(ds.items).toHaveLength(2);
        expect((await listViews(ds)).map(v => v.name)).toEqual(['S1b']);
    });

    it('says the view was deleted when another writer removed it', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_2', 'Other') }]);
        await expect(updateView(ds, 'v_1', { state: one(), user: 'b' })).rejects.toThrow('This view was deleted.');
        expect(ds.metaAdd).not.toHaveBeenCalled();
        await expect(updateView(fakeDataset(), 'v_1', { name: 'x', user: 'b' })).rejects.toThrow('This view was deleted.');
    });

    it('renames without changing the view', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        const r = await updateView(ds, 'v_1', { name: ' S2 ', user: 'b' });
        expect(r.name).toBe('S2');
        expect(r.data.layers.map(l => l.path)).toEqual(['a/o.tif', 'b/o.tif']);
        expect(r.data.split).toEqual(twoLayers().split);
    });

    it('refuses a bad name before writing', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        await expect(updateView(ds, 'v_1', { name: '', user: 'b' })).rejects.toThrow(/name must be/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });
});

describe('deleting a view', () => {
    it('removes every item of the uid after a fresh read', async () => {
        const ds = fakeDataset([
            { id: 'm1', mtime: 1, data: saved('v_1', 'S1') },
            { id: 'm2', mtime: 1, data: saved('v_1', 'S1') },
            { id: 'm3', mtime: 1, data: saved('v_2', 'S2') }
        ]);
        await deleteView(ds, 'v_1');
        expect(ds.items.map(i => i.id)).toEqual(['m3']);
        expect(ds.calls[0]).toEqual(['get', VIEWS_KEY, false]);
    });

    it('does nothing for a view that is gone', async () => {
        const ds = fakeDataset();
        await deleteView(ds, 'v_1');
        expect(ds.metaRemove).not.toHaveBeenCalled();
    });
});

describe('viewChange', () => {
    it('tells a changed or deleted view from one that is as it was loaded', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        expect(await viewChange(ds, 'v_1', 'm1')).toBeNull();
        await updateView(ds, 'v_1', { name: 'S1b', user: 'x' });
        expect(await viewChange(ds, 'v_1', 'm1')).toBe('changed');
        await deleteView(ds, 'v_1');
        expect(await viewChange(ds, 'v_1', 'm1')).toBe('deleted');
    });

    it('reads from the server, not the request cache', async () => {
        const ds = fakeDataset([{ id: 'm1', mtime: 1, data: saved('v_1', 'S1') }]);
        await viewChange(ds, 'v_1', 'm1');
        expect(ds.metaGet).toHaveBeenCalledWith(VIEWS_KEY, '', { cache: false });
    });
});

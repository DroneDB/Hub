import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import ddb from 'ddb';
import { b64urlEncode } from '@/libs/base64';

const dataset = {
    info: vi.fn(),
    listOne: vi.fn(),
    remoteUri: vi.fn(path => `ddb://o/d/${path}`)
};
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { Organization: () => ({ Dataset: () => dataset }), getUsername: () => 'user' }
}));
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: vi.fn().mockResolvedValue({ available: true }) } }));
vi.mock('@/libs/utils', () => ({ setTitle: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ warn: vi.fn(), error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));
vi.mock('@/components/FolderPicker.vue', () => ({ default: { name: 'FolderPicker' } }));

const { useComparison } = await import('./useComparison');

const raster = path => ({ path, type: ddb.entry.type.GEORASTER, hash: `h-${path}` });
const encoded = path => b64urlEncode(path);

let scope;
async function open(search, hash = '', { embed } = {}) {
    window.history.replaceState({ current: '/x' }, '', `/r/o/d/compare${search}${hash}`);
    const query = Object.fromEntries([...new URLSearchParams(search)].reduce((m, [k, v]) => m.set(k, m.has(k) ? [].concat(m.get(k), v) : v), new Map()));
    const dialogs = { open: vi.fn() };
    let cmp;
    scope = effectScope();
    scope.run(() => { cmp = useComparison({ route: { params: { org: 'o', ds: 'd' }, query }, dialogs, embed }); });
    await cmp.loaded;
    return { cmp, dialogs };
}

beforeEach(() => {
    vi.useFakeTimers();
    dataset.info.mockResolvedValue([{ path: '', type: ddb.entry.type.DIRECTORY, properties: {} }]);
    dataset.listOne.mockImplementation(async path => raster(path));
});
afterEach(() => {
    scope?.stop();
    vi.useRealTimers();
});

describe('useComparison url', () => {
    it('drops the opening-only keys at the first write and keeps other keys and the hash', async () => {
        const { cmp } = await open(`?p=${encoded('a.tif')}&p=${encoded('b.tif')}&pick=1&other=1`, '#frag');
        expect(cmp.state.value.layers.map(l => l.path)).toEqual(['a.tif', 'b.tif']);

        const link = cmp.currentLink();
        const url = new URL(link);
        expect(url.searchParams.has('p')).toBe(false);
        expect(url.searchParams.has('pick')).toBe(false);
        expect(url.searchParams.get('other')).toBe('1');
        expect(url.searchParams.get('s')).toBeTruthy();
        expect(url.hash).toBe('#frag');
        expect(window.history.state.current).toBe(`${url.pathname}${url.search}${url.hash}`);
    });

    it('writes the pending update on its own after the delay', async () => {
        await open(`?p=${encoded('a.tif')}&pick=1`);
        await nextTick();
        vi.advanceTimersByTime(600);
        expect(window.location.search).not.toContain('pick=');
        expect(window.location.search).not.toContain('p=');
        expect(window.location.search).toContain('s=');
    });
});

describe('useComparison layers', () => {
    it('lists the files with the top layer first and keeps a missing layer as a placeholder', async () => {
        dataset.listOne.mockImplementation(async path => {
            if (path === 'gone.tif') throw new Error('nf');
            return raster(path);
        });
        const { cmp } = await open(`?p=${encoded('a.tif')}&p=${encoded('gone.tif')}`);
        expect(cmp.files.value.map(f => f.label)).toEqual(['gone.tif', 'a.tif']);
        expect(cmp.files.value[0].placeholder).toEqual({ path: 'gone.tif', kind: 'missing', text: 'Missing: gone.tif' });
        expect(cmp.notices.value).toEqual([{ path: 'gone.tif', kind: 'missing', text: 'Missing: gone.tif' }]);
    });

    it('opens the picker for the folder of the last layer, excluding the layers on show', async () => {
        const { cmp, dialogs } = await open(`?p=${encoded('f/a.tif')}`);
        dialogs.open.mockResolvedValue(null);
        await cmp.pick();
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('FolderPicker');
        expect(props).toMatchObject({ mode: 'file', title: 'Add raster to compare', initialPath: 'f', exclude: ['f/a.tif'] });

        await cmp.pick('f/a.tif');
        expect(dialogs.open.mock.calls[1][1].title).toBe('Pick another raster');
    });

    it('adds the picked georaster', async () => {
        const { cmp, dialogs } = await open(`?p=${encoded('f/a.tif')}`);
        dialogs.open.mockResolvedValue({ path: 'f/b.tif' });
        await cmp.pick();
        expect(cmp.state.value.layers.map(l => l.path)).toEqual(['f/a.tif', 'f/b.tif']);
    });
});

describe('useComparison embedded', () => {
    it('opens the picker the link asks for once the map is on show', async () => {
        const { cmp, dialogs } = await open(`?p=${encoded('a.tif')}&pick=1`);
        dialogs.open.mockResolvedValue(null);
        cmp.pickOnFirstShow();
        await vi.waitFor(() => expect(dialogs.open).toHaveBeenCalledTimes(1));
    });

    it('does not open the picker the link asks for in an embedded view', async () => {
        const { cmp, dialogs } = await open(`?p=${encoded('a.tif')}&pick=1`, '', { embed: true });
        cmp.pickOnFirstShow();
        await cmp.pick();
        await cmp.pick('a.tif');
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('keeps the layers it was given in an embedded view', async () => {
        const { cmp } = await open(`?p=${encoded('a.tif')}&p=${encoded('b.tif')}`, '', { embed: true });
        cmp.remove('a.tif');
        expect(cmp.state.value.layers.map(l => l.path)).toEqual(['a.tif', 'b.tif']);
    });
});

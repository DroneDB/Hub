/**
 * The file context menu: what a user who can only read the dataset gets (a copy to another
 * dataset, no Cut) against a writer (a move, Cut).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import ddb from 'ddb';
import { buildStandardContextMenu } from './contextMenuItems';

vi.mock('@/libs/build/buildManager', () => ({ default: { getBuildState: () => null }, BUILD_STATES: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, buildFile: vi.fn(), isFileBuilt: vi.fn(), isBuildComplete: () => false
}));

const raster = path => ({ path: `ddb://h/org/ds/${path}`, entry: { path, type: ddb.entry.type.GEORASTER } });
const selection = [{ path: 'a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.IMAGE } }];

function menu(canWrite) {
    const emit = vi.fn();
    const items = buildStandardContextMenu({ getSelectedEntries: () => selection, canWrite, dataset: null, emit });
    const all = items.flatMap(i => (i.items ? [i, ...i.items] : [i]));
    const byLabel = label => all.find(i => i.label === label);
    return { emit, all, byLabel, tools: items.find(i => i.label === 'Tools') };
}

const visible = item => !!item && (item.isVisible === undefined || item.isVisible());

describe('the context menu of a dataset the user can only read', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('offers a copy to another dataset instead of a transfer, and the same action opens it', () => {
        const { byLabel, emit } = menu(false);
        expect(byLabel('Transfer')).toBeUndefined();
        const copy = byLabel('Copy to another dataset...');
        expect(visible(copy)).toBe(true);
        expect(copy.icon).toBe('fa-solid fa-copy');
        copy.click();
        expect(emit).toHaveBeenCalledWith('transferSelectedItems');
    });

    it('has no Cut, Paste or Delete', () => {
        const { byLabel } = menu(false);
        expect(visible(byLabel('Cut'))).toBe(false);
        expect(visible(byLabel('Paste'))).toBe(false);
        expect(visible(byLabel('Delete'))).toBe(false);
        expect(visible(byLabel('Copy'))).toBe(true);
    });
});

describe('the context menu of a dataset the user can write', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('offers the transfer, which moves the files, and Cut', () => {
        const { byLabel } = menu(true);
        expect(byLabel('Copy to another dataset...')).toBeUndefined();
        expect(visible(byLabel('Transfer'))).toBe(true);
        expect(byLabel('Transfer').icon).toBe('fa-solid fa-right-left');
        expect(visible(byLabel('Cut'))).toBe(true);
    });
});

describe('the shortcuts the menu names', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('are only the keys the dataset page binds: Ctrl/Cmd+C, +X, +V and Delete', () => {
        const { all } = menu(true);
        const named = Object.fromEntries(all.filter(i => i.accelerator).map(i => [i.label, i.accelerator]));
        expect(named).toEqual({ Copy: 'CmdOrCtrl+C', Cut: 'CmdOrCtrl+X', Paste: 'CmdOrCtrl+V', Delete: 'Delete' });
    });
});

describe('the map entries of the context menu', () => {
    const dataset = { org: 'org', ds: 'ds' };
    const b64 = text => Buffer.from(text).toString('base64');
    const b64url = text => b64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    function mapMenu(paths, ds = dataset) {
        const selected = paths.map(raster);
        const items = buildStandardContextMenu({ getSelectedEntries: () => selected, canWrite: true, dataset: ds, emit: vi.fn() });
        const byLabel = label => items.find(i => i.label === label);
        return { compareTo: byLabel('Compare to...'), compareInMap: byLabel('Compare in Map') };
    }

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(window, 'open').mockReturnValue(null);
    });
    afterEach(() => vi.restoreAllMocks());

    it('"Compare to..." opens the map of the georaster with the file picker, in a new tab', () => {
        const { compareTo, compareInMap } = mapMenu(['flights/ortho.tif']);
        expect(visible(compareTo)).toBe(true);
        expect(visible(compareInMap)).toBe(false);
        compareTo.click();
        expect(window.open).toHaveBeenCalledWith(`/r/org/ds/view/${b64('flights/ortho.tif')}/map?pick=1`, '_blank', 'noopener');
    });

    it('"Compare in Map" opens the first file with the others added in list order, in a new tab', () => {
        const { compareTo, compareInMap } = mapMenu(['b/second.tif', 'a/first.tif', 'c/third.tif']);
        expect(visible(compareTo)).toBe(false);
        expect(visible(compareInMap)).toBe(true);
        compareInMap.click();
        expect(window.open).toHaveBeenCalledWith(
            `/r/org/ds/view/${b64('b/second.tif')}/map?add=${b64url('a/first.tif')}&add=${b64url('c/third.tif')}`,
            '_blank', 'noopener');
    });

    it('"Compare in Map" is offered for 2 to 6 georasters only', () => {
        const paths = n => Array.from({ length: n }, (_, i) => `r${i}.tif`);
        expect(visible(mapMenu(paths(2)).compareInMap)).toBe(true);
        expect(visible(mapMenu(paths(6)).compareInMap)).toBe(true);
        expect(visible(mapMenu(paths(7)).compareInMap)).toBe(false);
    });

    it('offers neither without a dataset', () => {
        const { compareTo, compareInMap } = mapMenu(['a.tif', 'b.tif'], null);
        expect(visible(compareTo)).toBe(false);
        expect(visible(compareInMap)).toBe(false);
    });

    it('offers neither when a file of the selection is not a georaster', () => {
        const selected = [raster('a.tif'), { path: 'ddb://h/org/ds/b.jpg', entry: { path: 'b.jpg', type: ddb.entry.type.IMAGE } }];
        const items = buildStandardContextMenu({ getSelectedEntries: () => selected, canWrite: true, dataset, emit: vi.fn() });
        expect(visible(items.find(i => i.label === 'Compare in Map'))).toBe(false);
    });
});

describe('the Edit entry of the context menu', () => {
    beforeEach(() => setActivePinia(createPinia()));

    function editOf(path) {
        const selected = [{ path: `ddb://h/org/ds/${path}`, entry: { path, type: ddb.entry.type.VECTOR, size: 1024 } }];
        const items = buildStandardContextMenu({ getSelectedEntries: () => selected, canWrite: true, dataset: null, emit: vi.fn() });
        return items.flatMap(i => (i.items ? [i, ...i.items] : [i])).find(i => i.label === 'Edit');
    }

    it('is not offered for a binary vector file (KMZ)', () => {
        expect(visible(editOf('places.kmz'))).toBe(false);
    });

    it('is offered for a text vector file (KML)', () => {
        expect(visible(editOf('places.kml'))).toBe(true);
    });
});

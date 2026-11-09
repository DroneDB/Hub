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

describe('the Open items of the context menu (the viewer table)', () => {
    beforeEach(() => setActivePinia(createPinia()));

    const opens = (type, path) => {
        const selected = [{ path: `ddb://h/org/ds/${path}`, entry: { path, type } }];
        return buildStandardContextMenu({ getSelectedEntries: () => selected, canWrite: true, dataset: null, emit: vi.fn() })
            .filter(i => visible(i) && /^Open\b/.test(i.label || ''));
    };

    it('a PDF has exactly one Open item, with a Font Awesome PDF icon', () => {
        const items = opens(ddb.entry.type.GENERIC, 'docs/report.pdf');
        expect(items.map(i => i.label)).toEqual(['Open']);
        expect(items[0].icon).toBe('fa-regular fa-file-pdf');
    });

    it('3D Tiles have an Open 3D Tiles item at the top level, which opens the 3D viewer', () => {
        const items = opens(ddb.entry.type.TILES3D, 'the-limes-test.3tz');
        expect(items.map(i => i.label)).toEqual(['Open 3D Tiles']);
    });

    it('offers Open Map for every map-viewable type, not for a drawing without geolocation', () => {
        for (const type of [ddb.entry.type.GEORASTER, ddb.entry.type.GEOIMAGE, ddb.entry.type.POINTCLOUD, ddb.entry.type.VECTOR, ddb.entry.type.GEOVIDEO]) {
            expect(opens(type, 'f.x').map(i => i.label)).toContain('Open Map');
        }
        const local = [{ path: 'ddb://h/org/ds/site.dxf', entry: { path: 'site.dxf', type: ddb.entry.type.VECTOR, properties: { georeferenced: false } } }];
        const items = buildStandardContextMenu({ getSelectedEntries: () => local, canWrite: true, dataset: null, emit: vi.fn() });
        expect(items.filter(visible).map(i => i.label)).not.toContain('Open Map');
        expect(items.filter(visible).map(i => i.label)).toContain('Open');
    });

    it('a photo keeps its Open (the lightbox) next to Open Map', () => {
        expect(opens(ddb.entry.type.GEOIMAGE, 'a.jpg').map(i => i.label)).toEqual(['Open', 'Open Map']);
    });
});

describe('the background menu (nothing selected)', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('has the folder actions only: New folder, Upload, Select all, Refresh, and Paste with something to paste', () => {
        const emit = vi.fn();
        const items = buildStandardContextMenu({ getSelectedEntries: () => [], canWrite: true, dataset: null, emit, clipboardEmpty: () => false })
            .filter(i => (i.items ? i.items.some(visible) : visible(i)));
        expect(items.map(i => i.label)).toEqual(['Paste', 'New folder', 'Upload', 'Select all', 'Refresh']);
        items.find(i => i.label === 'Select all').click();
        expect(emit).toHaveBeenCalledWith('selectAll');
    });

    it('offers a reader Select all and Refresh', () => {
        const items = buildStandardContextMenu({ getSelectedEntries: () => [], canWrite: false, dataset: null, emit: vi.fn() })
            .filter(i => (i.items ? i.items.some(visible) : visible(i)));
        expect(items.map(i => i.label)).toEqual(['Select all', 'Refresh']);
    });
});

describe('the folder actions in the menu of a selection', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('offers New folder and Select all, which a full list leaves no empty area to reach', () => {
        const emit = vi.fn();
        const files = [...selection, { path: 'b.jpg', entry: { path: 'b.jpg', type: ddb.entry.type.IMAGE } }];
        const items = buildStandardContextMenu({ getSelectedEntries: () => selection, getFiles: () => files, canWrite: true, dataset: null, emit });
        const labels = items.filter(visible).map(i => i.label);
        expect(labels).toContain('New folder');
        expect(labels).toContain('Select all');
        expect(labels).not.toContain('Upload');
        expect(labels).not.toContain('Refresh');
        items.find(i => i.label === 'New folder').click();
        expect(emit).toHaveBeenCalledWith('createFolder');
    });

    it('leaves New folder out for a reader', () => {
        const items = buildStandardContextMenu({ getSelectedEntries: () => selection, canWrite: false, dataset: null, emit: vi.fn() });
        expect(items.filter(visible).map(i => i.label)).not.toContain('New folder');
    });
});

describe('the order of the context menu', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('goes Open, Edit, Share & download, Organize, the folder, Tools, and ends with Delete, marked as dangerous', () => {
        const { all } = menu(true);
        const top = buildStandardContextMenu({ getSelectedEntries: () => selection, canWrite: true, dataset: null, emit: vi.fn() })
            .filter(i => (i.items ? i.items.some(visible) : visible(i)));
        const groups = top.map(i => i.group).filter((g, i, a) => a[i - 1] !== g);
        expect(groups).toEqual(['open', 'edit', 'share', 'organize', 'folder', 'tools', 'danger']);
        expect(top[top.length - 1]).toMatchObject({ label: 'Delete', danger: true });
        expect(all.filter(i => i.danger).map(i => i.label)).toEqual(['Delete']);
    });
});

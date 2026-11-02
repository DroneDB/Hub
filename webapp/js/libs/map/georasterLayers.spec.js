import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { isGeoraster } from '@/libs/entryTypes';
import FolderPicker from '@/components/FolderPicker.vue';
import { resolveLayer, resolveLayers, toMapFiles, pickGeoraster } from './georasterLayers';

vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: vi.fn() } }));
vi.mock('@/components/FolderPicker.vue', () => ({ default: { name: 'FolderPicker' } }));

const { entry } = ddb;
const raster = path => ({ path, type: entry.type.GEORASTER, hash: `h-${path}` });

function fakeDataset(entries = {}) {
    return {
        listOne: vi.fn(async path => {
            if (!(path in entries)) throw new Error('not found');
            return entries[path];
        }),
        remoteUri: vi.fn(path => `ddb://org/ds/${path}`)
    };
}

beforeEach(() => {
    FileAvailabilityChecker.check.mockReset();
    FileAvailabilityChecker.check.mockResolvedValue({ available: true });
});

describe('resolveLayer', () => {
    it('is ok for a georaster that can be drawn', async () => {
        const ds = fakeDataset({ 'a.tif': raster('a.tif') });
        const r = await resolveLayer(ds, 'a.tif');
        expect(r).toEqual({ status: 'ok', entry: raster('a.tif'), reason: '' });
        expect(FileAvailabilityChecker.check).toHaveBeenCalledWith(ds, raster('a.tif'), 'map');
    });

    it('is missing when the file is not in the dataset', async () => {
        const r = await resolveLayer(fakeDataset(), 'gone.tif');
        expect(r).toEqual({ status: 'missing', entry: null, reason: 'Missing' });
    });

    it('is unavailable for a file that is not a georaster, without asking the checker', async () => {
        const ds = fakeDataset({ 'n.txt': { path: 'n.txt', type: entry.type.GENERIC } });
        const r = await resolveLayer(ds, 'n.txt');
        expect(r.status).toBe('unavailable');
        expect(r.reason).toBe('Not a georaster');
        expect(r.entry.path).toBe('n.txt');
        expect(FileAvailabilityChecker.check).not.toHaveBeenCalled();
    });

    it('is unavailable with the title the checker gives', async () => {
        FileAvailabilityChecker.check.mockResolvedValue({ available: false, title: 'Building' });
        const r = await resolveLayer(fakeDataset({ 'a.tif': raster('a.tif') }), 'a.tif');
        expect(r).toMatchObject({ status: 'unavailable', reason: 'Building' });
    });

    it('is unavailable when the checker fails', async () => {
        FileAvailabilityChecker.check.mockRejectedValue(new Error('boom'));
        const r = await resolveLayer(fakeDataset({ 'a.tif': raster('a.tif') }), 'a.tif');
        expect(r).toMatchObject({ status: 'unavailable', reason: 'boom' });
    });
});

describe('resolveLayers', () => {
    it('continues past a layer that fails', async () => {
        const ds = fakeDataset({ 'a.tif': raster('a.tif'), 'c.tif': raster('c.tif') });
        const out = await resolveLayers(ds, ['a.tif', 'gone.tif', 'c.tif']);
        expect([...out.keys()]).toEqual(['a.tif', 'gone.tif', 'c.tif']);
        expect(out.get('a.tif').status).toBe('ok');
        expect(out.get('gone.tif').status).toBe('missing');
        expect(out.get('c.tif').status).toBe('ok');
    });

    it('resolves only the paths not resolved yet and leaves the given map alone', async () => {
        const ds = fakeDataset({ 'a.tif': raster('a.tif'), 'b.tif': raster('b.tif') });
        const first = await resolveLayers(ds, ['a.tif']);
        ds.listOne.mockClear();
        const second = await resolveLayers(ds, ['a.tif', 'b.tif'], first);
        expect(ds.listOne).toHaveBeenCalledTimes(1);
        expect(ds.listOne).toHaveBeenCalledWith('b.tif');
        expect(first.size).toBe(1);
        expect(second.size).toBe(2);
        expect(second.get('a.tif')).toBe(first.get('a.tif'));
    });

    it('fresh, resolves the given paths again and keeps the others as they were', async () => {
        const entries = { 'a.tif': raster('a.tif'), 'b.tif': raster('b.tif') };
        const ds = fakeDataset(entries);
        FileAvailabilityChecker.check.mockResolvedValueOnce({ available: false, title: 'Building' });
        const first = await resolveLayers(ds, ['a.tif', 'b.tif']);
        expect(first.get('a.tif').status).toBe('unavailable');
        // a.tif was built since, and b.tif removed
        delete entries['b.tif'];
        ds.listOne.mockClear();
        const again = await resolveLayers(ds, ['a.tif'], first, { fresh: true });
        expect(ds.listOne).toHaveBeenCalledTimes(1);
        expect(ds.listOne).toHaveBeenCalledWith('a.tif');
        expect(again.get('a.tif').status).toBe('ok');
        expect(again.get('b.tif')).toBe(first.get('b.tif'));
        expect(first.get('a.tif').status).toBe('unavailable');
    });
});

describe('toMapFiles', () => {
    it('keeps the order of the paths and shapes ok layers and placeholders', async () => {
        const ds = fakeDataset({ 'f/a.tif': raster('f/a.tif'), 'f/n.txt': { path: 'f/n.txt', type: entry.type.GENERIC } });
        const resolved = await resolveLayers(ds, ['f/a.tif', 'f/gone.tif', 'f/n.txt']);
        const files = toMapFiles(ds, ['f/a.tif', 'f/gone.tif', 'f/n.txt'], resolved);
        expect(files).toEqual([
            { path: 'ddb://org/ds/f/a.tif', entry: raster('f/a.tif'), label: 'a.tif', selected: false },
            {
                path: 'ddb://org/ds/f/gone.tif', entry: null, label: 'gone.tif', selected: false,
                placeholder: { path: 'f/gone.tif', kind: 'missing', text: 'Missing: f/gone.tif' }
            },
            {
                path: 'ddb://org/ds/f/n.txt', entry: null, label: 'n.txt', selected: false,
                placeholder: { path: 'f/n.txt', kind: 'unavailable', text: 'Not a georaster: f/n.txt' }
            }
        ]);
    });

    it('treats a path that was never resolved as missing', () => {
        const [file] = toMapFiles(fakeDataset(), ['x.tif'], new Map());
        expect(file.placeholder).toEqual({ path: 'x.tif', kind: 'missing', text: 'Missing: x.tif' });
    });
});

describe('pickGeoraster', () => {
    it('opens the file picker on georasters and returns its answer', async () => {
        const picked = { path: 'f/b.tif', entry: raster('f/b.tif') };
        const dialogs = { open: vi.fn().mockResolvedValue(picked) };
        const ds = fakeDataset();
        const result = await pickGeoraster(dialogs, ds, { title: 'Add raster', near: 'f/sub/a.tif', exclude: ['f/sub/a.tif'] });
        expect(result).toBe(picked);
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component).toBe(FolderPicker);
        expect(props).toMatchObject({ dataset: ds, mode: 'file', title: 'Add raster', initialPath: 'f/sub', exclude: ['f/sub/a.tif'] });
        expect(props.accept).toBe(isGeoraster);
        expect(props.accept(raster('x.tif'))).toBe(true);
        expect(props.accept({ path: 'n.txt', type: entry.type.GENERIC })).toBe(false);
    });

    it('starts at the root without a path to be near, and returns null when closed', async () => {
        const dialogs = { open: vi.fn().mockResolvedValue(null) };
        expect(await pickGeoraster(dialogs, fakeDataset(), { title: 'T' })).toBeNull();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ initialPath: '', exclude: [] });
    });
});

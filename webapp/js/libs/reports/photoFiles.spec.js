/**
 * What the photos of an annotation read and write in the dataset: the entries of the photos by folder, the search for
 * images, and the upload next to the measurement file, which takes the lowest free name and never replaces a file.
 */
import { describe, it, expect, vi } from 'vitest';
import { findImages, photoEntries, uploadPhoto, PICK_LIMIT } from './photoFiles';

const file = (name = 'a.JPG') => new File(['x'], name, { type: 'image/jpeg' });
const error = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, ...extra });
const dataset = (overrides = {}) => ({
    list: vi.fn(async () => []),
    search: vi.fn(async () => []),
    writeObj: vi.fn(async () => ({})),
    ...overrides
});

describe('photoEntries', () => {
    it('lists each folder once and returns the entries of the paths asked for', async () => {
        const ds = dataset({
            list: vi.fn(async folder => (folder === 'a'
                ? [{ path: 'a/1.jpg', hash: 'h1' }, { path: 'a/2.jpg', hash: 'h2' }, { path: 'a/other.jpg' }]
                : [{ path: 'root.jpg', hash: 'r' }]))
        });
        const entries = await photoEntries(ds, ['a/1.jpg', 'a/2.jpg', 'root.jpg']);
        expect(ds.list.mock.calls.map(c => c[0]).sort()).toEqual(['', 'a']);
        expect([...entries.keys()].sort()).toEqual(['a/1.jpg', 'a/2.jpg', 'root.jpg']);
        expect(entries.get('a/1.jpg').hash).toBe('h1');
    });

    it('leaves out the photos of a folder that cannot be listed, and keeps the others', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ds = dataset({ list: vi.fn(async folder => { if (folder === 'bad') throw error(500); return [{ path: 'ok/1.jpg' }]; }) });
        const entries = await photoEntries(ds, ['bad/1.jpg', 'ok/1.jpg']);
        expect([...entries.keys()]).toEqual(['ok/1.jpg']);
        warn.mockRestore();
    });
});

describe('findImages', () => {
    it('searches the whole dataset for pictures and merges the types, sorted by path', async () => {
        const ds = dataset({
            search: vi.fn(async (_q, { type }) => (type === 3 ? [{ path: 'b.jpg' }] : [{ path: 'a.jpg' }, { path: 'c.png' }]))
        });
        const found = await findImages(ds, ' roof ');
        expect(found.map(e => e.path)).toEqual(['a.jpg', 'b.jpg', 'c.png']);
        expect(ds.search).toHaveBeenCalledWith('*roof*', expect.objectContaining({ recursive: true, type: 3 }));
        expect(ds.search).toHaveBeenCalledWith('*roof*', expect.objectContaining({ recursive: true, type: 6 }));
    });

    it('returns at most the limit', async () => {
        const many = Array.from({ length: PICK_LIMIT + 20 }, (_, i) => ({ path: `p${String(i).padStart(3, '0')}.jpg` }));
        expect(await findImages(dataset({ search: vi.fn(async () => many) }), '')).toHaveLength(PICK_LIMIT);
    });
});

describe('uploadPhoto', () => {
    const upload = { measurementPath: 'site/survey_measurements.geojson', id: 'abc' };

    it('writes the image to the annotations folder next to the measurement file, as <id>-1.<ext>', async () => {
        const ds = dataset({ list: vi.fn(async () => { throw error(404); }) });
        const f = file('IMG.JPG');
        expect(await uploadPhoto(ds, { ...upload, file: f })).toBe('site/annotations/abc-1.jpg');
        expect(ds.writeObj).toHaveBeenCalledWith('site/annotations/abc-1.jpg', f);
    });

    it('takes the lowest free number from the files of the folder and the photos the annotation has', async () => {
        const ds = dataset({ list: vi.fn(async () => [{ path: 'site/annotations/abc-1.jpg' }, { path: 'site/annotations/abc-3.jpg' }]) });
        expect(await uploadPhoto(ds, { ...upload, file: file(), taken: ['site/annotations/abc-2.jpg'] })).toBe('site/annotations/abc-4.jpg');
        expect(await uploadPhoto(ds, { ...upload, file: file() })).toBe('site/annotations/abc-2.jpg');
    });

    it('does not replace a file: a name another session took first is left out of the next choice', async () => {
        const writeObj = vi.fn()
            .mockRejectedValueOnce(error(409, { conflictPath: 'site/annotations/abc-1.jpg' }))
            .mockResolvedValue({});
        const ds = dataset({ writeObj });
        expect(await uploadPhoto(ds, { ...upload, file: file() })).toBe('site/annotations/abc-2.jpg');
        expect(writeObj.mock.calls.map(c => c[0])).toEqual(['site/annotations/abc-1.jpg', 'site/annotations/abc-2.jpg']);
        expect(writeObj.mock.calls.every(c => c.length === 2)).toBe(true);
    });

    it('passes on any other refusal, and a busy dataset\'s 409', async () => {
        await expect(uploadPhoto(dataset({ writeObj: vi.fn(async () => { throw error(403); }) }), { ...upload, file: file() })).rejects.toThrow(/403/);
        const busy = error(409, { datasetBusy: 'rescan' });
        await expect(uploadPhoto(dataset({ writeObj: vi.fn(async () => { throw busy; }) }), { ...upload, file: file() })).rejects.toBe(busy);
    });

    it('fails when the folder cannot be listed for another reason than not being there', async () => {
        const ds = dataset({ list: vi.fn(async () => { throw error(500); }) });
        await expect(uploadPhoto(ds, { ...upload, file: file() })).rejects.toThrow(/500/);
        expect(ds.writeObj).not.toHaveBeenCalled();
    });

    it('refuses a file that is not an image before anything is written', async () => {
        const ds = dataset();
        await expect(uploadPhoto(ds, { ...upload, file: file('notes.pdf') })).rejects.toThrow(/image/);
        expect(ds.writeObj).not.toHaveBeenCalled();
    });
});

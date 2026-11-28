/**
 * The cover of a dataset: a candidate file in the root, the first one the dataset has is shown. A new cover is written
 * under the first candidate of its image type, then the other cover files go (one of them would be shown in its place);
 * Remove deletes them all; a file of the dataset gives its thumbnail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h_ = vi.hoisted(() => ({ candidates: undefined }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => h_.candidates } } }));

const { coverCandidates, isCoverPath, coverNameFor, coverFiles, setCover, removeCover, applyCoverChange, COVER_SOURCE_SIZE } = await import('./datasetCover');

const image = (type, name = 'x') => new File(['x'], name, { type });
let calls;
function dataset(root = []) {
    calls = [];
    return {
        list: vi.fn(async () => root.map(path => ({ path }))),
        uploadObj: vi.fn(async (...args) => { calls.push(['upload', ...args]); }),
        deleteObjs: vi.fn(async paths => { calls.push(['delete', paths]); }),
        thumbUrl: vi.fn((path, size) => `/thumb?path=${path}&size=${size}`),
        registry: { fetchRaw: vi.fn(async () => ({ ok: true, blob: async () => new Blob(['w'], { type: 'image/webp' }) })) }
    };
}

beforeEach(() => { h_.candidates = undefined; });

describe('coverCandidates', () => {
    it("is the server's list, else its default", () => {
        expect(coverCandidates()).toEqual(['thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png', 'cover.webp', 'cover.jpg', 'cover.png']);
        h_.candidates = ['logo.png'];
        expect(coverCandidates()).toEqual(['logo.png']);
    });
});

describe('isCoverPath', () => {
    it('is a candidate name in the root, any letter case', () => {
        expect(isCoverPath('Thumbnail.JPG')).toBe(true);
        expect(isCoverPath('cover.png')).toBe(true);
        expect(isCoverPath('photos/thumbnail.jpg')).toBe(false);
        expect(isCoverPath('thumbnail.tif')).toBe(false);
        expect(isCoverPath('')).toBe(false);
    });
});

describe('coverNameFor', () => {
    it('is the first candidate with an extension of the type', () => {
        expect(coverNameFor('image/webp')).toBe('thumbnail.webp');
        expect(coverNameFor('image/jpeg')).toBe('thumbnail.jpg');
        expect(coverNameFor('image/png')).toBe('thumbnail.png');
        h_.candidates = ['cover.jpeg', 'thumbnail.jpg'];
        expect(coverNameFor('image/jpeg')).toBe('cover.jpeg');
    });

    it('refuses a type a cover cannot be, or one the server takes no cover of', () => {
        expect(() => coverNameFor('image/gif')).toThrow('Choose a WebP, JPEG or PNG image');
        expect(() => coverNameFor('')).toThrow('Choose a WebP, JPEG or PNG image');
        h_.candidates = ['thumbnail.jpg'];
        expect(() => coverNameFor('image/png')).toThrow('This server takes no PNG cover');
    });
});

describe('coverFiles', () => {
    it('lists the cover files of the root', async () => {
        expect(await coverFiles(dataset(['a.jpg', 'thumbnail.webp', 'Cover.JPG', 'README.md']))).toEqual(['thumbnail.webp', 'Cover.JPG']);
    });
});

describe('setCover', () => {
    it('writes the image under its candidate, then deletes the other cover files', async () => {
        const ds = dataset(['thumbnail.webp', 'cover.png', 'thumbnail.jpg']);
        const file = image('image/jpeg', 'roof.jpg');

        expect(await setCover(ds, file)).toEqual({ written: 'thumbnail.jpg', removed: ['thumbnail.webp', 'cover.png'] });
        // Written first: a failure of the delete leaves a cover
        expect(calls).toEqual([['upload', 'thumbnail.jpg', file, { overwrite: true }], ['delete', ['thumbnail.webp', 'cover.png']]]);
    });

    it('deletes nothing when the dataset had no other cover', async () => {
        const ds = dataset(['thumbnail.png']);
        expect(await setCover(ds, image('image/png'))).toEqual({ written: 'thumbnail.png', removed: [] });
        expect(ds.deleteObjs).not.toHaveBeenCalled();
    });

    it('a failed write deletes nothing', async () => {
        const ds = dataset(['cover.jpg']);
        ds.uploadObj.mockRejectedValue(new Error('quota'));
        await expect(setCover(ds, image('image/webp'))).rejects.toThrow('quota');
        expect(ds.deleteObjs).not.toHaveBeenCalled();
    });

    it('writes a blob as a file of the name', async () => {
        const ds = dataset();
        await setCover(ds, new Blob(['w'], { type: 'image/webp' }));
        const sent = ds.uploadObj.mock.calls[0][1];
        expect(sent).toBeInstanceOf(File);
        expect(sent.name).toBe('thumbnail.webp');
    });
});

describe('removeCover', () => {
    it('deletes every cover file, and nothing when there is none', async () => {
        const ds = dataset(['thumbnail.webp', 'a.jpg', 'cover.jpg']);
        expect(await removeCover(ds)).toEqual({ written: null, removed: ['thumbnail.webp', 'cover.jpg'] });
        expect(ds.deleteObjs).toHaveBeenCalledWith(['thumbnail.webp', 'cover.jpg']);

        const empty = dataset(['a.jpg']);
        expect(await removeCover(empty)).toEqual({ written: null, removed: [] });
        expect(empty.deleteObjs).not.toHaveBeenCalled();
    });
});

describe('applyCoverChange', () => {
    it('makes the thumbnail of a file of the dataset the cover', async () => {
        const ds = dataset();
        expect(await applyCoverChange(ds, { entryPath: 'odm/ortho.tif' })).toEqual({ written: 'thumbnail.webp', removed: [] });
        expect(ds.thumbUrl).toHaveBeenCalledWith('odm/ortho.tif', COVER_SOURCE_SIZE);
        expect(ds.registry.fetchRaw).toHaveBeenCalledWith(`/thumb?path=odm/ortho.tif&size=${COVER_SOURCE_SIZE}`, { signal: undefined });
    });

    it('a thumbnail that cannot be read writes nothing', async () => {
        const ds = dataset();
        ds.registry.fetchRaw.mockResolvedValue({ ok: false, status: 404 });
        await expect(applyCoverChange(ds, { entryPath: 'a.tif' })).rejects.toThrow('The server answered 404');
        expect(ds.uploadObj).not.toHaveBeenCalled();
    });

    it('writes an image of the user, or removes the cover', async () => {
        const ds = dataset(['cover.webp']);
        expect((await applyCoverChange(ds, { file: image('image/png') })).written).toBe('thumbnail.png');
        expect(await applyCoverChange(dataset(['cover.webp']), { remove: true })).toEqual({ written: null, removed: ['cover.webp'] });
    });
});

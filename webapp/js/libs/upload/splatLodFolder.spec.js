import { describe, it, expect } from 'vitest';
import { splatLodFolders, splatLodWarning } from './splatLodFolder';

const files = (...paths) => paths.map(path => ({ path }));

describe('splatLodFolders', () => {
    it('finds the folder of a lod-meta.json, whatever its depth or letter case', () => {
        expect(splatLodFolders(files('hotel-oldmill/lod-meta.json', 'hotel-oldmill/2_8/means_l.webp'))).toEqual(['hotel-oldmill']);
        expect(splatLodFolders(files('a/b/LOD-META.JSON'))).toEqual(['a/b']);
        expect(splatLodFolders(files('lod-meta.json'))).toEqual(['']);
        expect(splatLodFolders(files('a\\b\\lod-meta.json'))).toEqual(['a/b']);
    });

    it('finds each folder once, and none in an ordinary selection', () => {
        expect(splatLodFolders(files('x/lod-meta.json', 'x/lod-meta.json', 'y/lod-meta.json'))).toEqual(['x', 'y']);
        expect(splatLodFolders(files('photos/a.jpg', 'meta.json', 'lod-meta.json.bak', 'x/not-lod-meta.json'))).toEqual([]);
    });
});

describe('splatLodWarning', () => {
    it('says that the folder is not supported and how to convert it', () => {
        expect(splatLodWarning(files('hotel-oldmill/lod-meta.json', 'hotel-oldmill/2_8/a.webp'))).toBe(
            'lod-meta.json is in the folder hotel-oldmill: a SOG level-of-detail folder is not supported as a splat, '
            + 'and its textures are stored as ordinary files. Bundle it into one .sog file first, then upload that file.');
    });

    it('names the selection when the file is at its top, and counts the folders when there are several', () => {
        expect(splatLodWarning(files('lod-meta.json'))).toContain('lod-meta.json is in the selection:');
        expect(splatLodWarning(files('a/lod-meta.json', 'b/lod-meta.json'))).toContain('is in 2 folders (a, b):');
    });

    it('is null for a selection without one', () => {
        expect(splatLodWarning(files('a.jpg', 'dir/b.ply'))).toBeNull();
        expect(splatLodWarning([])).toBeNull();
    });
});

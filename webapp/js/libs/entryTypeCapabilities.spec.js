/**
 * entryTypeCapabilities: what libddb does with each entry type comes from /sys/features (D8, XI-04);
 * the fallback is only for a features request that failed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { isBuildableType, hasThumbnail, isArchivePath } from './entryTypeCapabilities';
import { isArchiveFile } from './entryTypes';

const T = ddb.entry.type;
const row = (id, name, buildable, thumbnail) => ({ id, name, buildable, thumbnail, sidecarExtensions: [], roles: [] });

/** `entryTypes` of GET /sys/features as the Registry serves libddb's list (Registry golden sys-features.json). */
const SERVED = [
    row(0, 'Undefined', false, 'none'), row(1, 'Directory', false, 'none'), row(2, 'Generic', false, 'none'),
    row(3, 'GeoImage', false, 'file'), row(4, 'GeoRaster', true, 'file'), row(5, 'PointCloud', true, 'build'),
    row(6, 'Image', false, 'file'), row(7, 'DroneDB', false, 'none'), row(8, 'Markdown', false, 'none'),
    row(9, 'Video', false, 'none'), row(10, 'GeoVideo', false, 'none'), row(11, 'Model', true, 'none'),
    row(12, 'Panorama', false, 'file'), row(13, 'GeoPanorama', false, 'file'), row(14, 'Vector', true, 'none'),
    row(15, 'GaussianSplat', true, 'build'), row(16, 'Tiles3D', true, 'none')
];
const SERVED_ARCHIVES = ['tar.gz', 'tar.bz2', 'tar.xz', 'tgz', 'tbz2', 'txz', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];

const serve = features => { reg.features.values = features; };
const answers = (fn, ids) => ids.map(id => fn(id));
const ALL_IDS = SERVED.map(r => r.id);

beforeEach(() => serve({ entryTypes: SERVED, archiveExtensions: SERVED_ARCHIVES }));
afterEach(() => reg.features.clear());

describe('served by the Registry', () => {
    it('builds the types libddb builds, Tiles3D included (the two Hub copies used to disagree on it)', () => {
        const built = ALL_IDS.filter(id => isBuildableType(id));
        expect(built).toEqual([T.GEORASTER, T.POINTCLOUD, T.MODEL, T.VECTOR, T.GAUSSIAN_SPLAT, T.TILES3D]);
    });

    it('asks a thumbnail for the types whose thumbnail is "file" or "build"', () => {
        expect(ALL_IDS.filter(id => hasThumbnail(id))).toEqual([T.GEOIMAGE, T.GEORASTER, T.POINTCLOUD, T.IMAGE, T.PANORAMA, T.GEOPANORAMA, T.GAUSSIAN_SPLAT]);
        for (const type of [T.VIDEO, T.GEOVIDEO, T.MODEL, T.VECTOR, T.MARKDOWN, T.GENERIC, T.DIRECTORY, T.UNDEFINED, T.TILES3D]) {
            expect(hasThumbnail(type)).toBe(false);
        }
    });

    it('reads the type from a string too (list responses)', () => {
        expect(hasThumbnail(String(T.IMAGE))).toBe(true);
        expect(hasThumbnail(String(T.MODEL))).toBe(false);
        expect(isBuildableType(String(T.GEORASTER))).toBe(true);
    });

    it('follows the server, not the Hub: a type it changes or invents needs no Hub change', () => {
        serve({
            entryTypes: [row(14, 'Vector', false, 'file'), row(99, 'Spatial', true, 'build')],
            archiveExtensions: SERVED_ARCHIVES
        });
        expect(isBuildableType(T.VECTOR)).toBe(false);
        expect(hasThumbnail(T.VECTOR)).toBe(true);
        expect(isBuildableType(99)).toBe(true);
        expect(hasThumbnail(99)).toBe(true);
        // not listed: nothing is assumed for it
        expect(isBuildableType(T.GEORASTER)).toBe(false);
    });

    it('uses the data of the latest features load', () => {
        expect(isBuildableType(T.MODEL)).toBe(true);
        serve({ entryTypes: [row(11, 'Model', false, 'none')], archiveExtensions: SERVED_ARCHIVES });
        expect(isBuildableType(T.MODEL)).toBe(false);
    });

    it('takes the archive extensions of the extractor, the longest suffix first or not', () => {
        for (const name of ['a.zip', 'a.tar.gz', 'b.TGZ', 'dir/c.7z', 'd.tar.xz', 'e.bz2']) expect(isArchivePath(name)).toBe(true);
        for (const name of ['a.txt', 'zip', 'a.zipx', 'archive', 'a.gz.txt', '', null, undefined]) expect(isArchivePath(name)).toBe(false);
        serve({ entryTypes: SERVED, archiveExtensions: ['zip'] });
        expect(isArchivePath('a.rar')).toBe(false);
        expect(isArchivePath('a.zip')).toBe(true);
    });

    it('isArchiveFile is a file entry with an archive name, never a folder', () => {
        expect(isArchiveFile({ path: 'x/data.tar.gz', type: T.GENERIC })).toBe(true);
        expect(isArchiveFile({ path: 'x/folder.zip', type: T.DIRECTORY })).toBe(false);
        expect(isArchiveFile(null)).toBe(false);
    });
});

describe('fallback (features not loaded or their request failed)', () => {
    beforeEach(() => reg.features.clear());

    it('answers as the server does for every libddb type, so the file list works', () => {
        const fallback = [answers(isBuildableType, ALL_IDS), answers(hasThumbnail, ALL_IDS), SERVED_ARCHIVES.map(e => isArchivePath(`a.${e}`))];
        serve({ entryTypes: SERVED, archiveExtensions: SERVED_ARCHIVES });
        expect([answers(isBuildableType, ALL_IDS), answers(hasThumbnail, ALL_IDS), SERVED_ARCHIVES.map(e => isArchivePath(`a.${e}`))]).toEqual(fallback);
    });

    it('treats an empty or malformed list as not loaded', () => {
        serve({ entryTypes: [], archiveExtensions: 'zip' });
        expect(isBuildableType(T.GEORASTER)).toBe(true);
        expect(isArchivePath('a.zip')).toBe(true);
    });

    it('is not used once the server has answered', () => {
        serve({ entryTypes: [row(4, 'GeoRaster', false, 'none')] });
        expect(isBuildableType(T.GEORASTER)).toBe(false);
    });

    it('knows no type it was not told about', () => {
        expect(isBuildableType(99)).toBe(false);
        expect(hasThumbnail(undefined)).toBe(false);
    });
});

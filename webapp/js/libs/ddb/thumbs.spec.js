/**
 * thumbs.spec - which entry types the Hub asks the server a thumbnail for.
 *
 * libddb decides per type (DDBGetEntryTypes: thumbnail "file" | "build" | "none") and the Registry answers
 * 404 for a type without one; asking anyway only costs failed requests and retries per tile.
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import thumbs from './thumbs';

const T = ddb.entry.type;

describe('thumbs.supportedForType', () => {
    it.each([
        ['image', T.IMAGE],
        ['geoimage', T.GEOIMAGE],
        ['georaster', T.GEORASTER],
        ['point cloud', T.POINTCLOUD],
        ['gaussian splat', T.GAUSSIAN_SPLAT]
    ])('asks for the thumbnail of a %s', (_name, type) => {
        expect(thumbs.supportedForType(type)).toBe(true);
    });

    it.each([
        ['panorama', T.PANORAMA],
        ['geopanorama', T.GEOPANORAMA],
        ['video', T.VIDEO],
        ['model', T.MODEL],
        ['vector', T.VECTOR],
        ['markdown', T.MARKDOWN],
        ['generic file', T.GENERIC],
        ['folder', T.DIRECTORY]
    ])('does not ask for a %s (libddb gives its type no thumbnail)', (_name, type) => {
        expect(thumbs.supportedForType(type)).toBe(false);
    });

    it('reads the type from a string too (list responses)', () => {
        expect(thumbs.supportedForType(String(T.IMAGE))).toBe(true);
        expect(thumbs.supportedForType(String(T.MODEL))).toBe(false);
    });
});

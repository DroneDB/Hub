/**
 * The downloads of built files: offered when the entry's artifacts say the server offers them,
 * whatever the type of the file.
 */
import { describe, it, expect } from 'vitest';
import { BUILD_DOWNLOADS, offersBuildDownload, buildDownloadNote } from './buildDownloads';
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';

const row = role => BUILD_DOWNLOADS.find(d => d.role === role);
const offered = entry => BUILD_DOWNLOADS.filter(d => offersBuildDownload(entry, d)).map(d => d.role);

describe('downloads of built files', () => {
    it('offers each artifact with a download name, and only those', () => {
        const model = {
            artifacts: [
                { role: ArtifactRole.MODEL_BM3D, url: '/b/bm3d/model.bm3d' },
                { role: ArtifactRole.MODEL_3DTILES, url: '/b/3dtiles/tileset.json', downloadName: 'model.3dtiles.zip' }
            ]
        };
        expect(offered(model)).toEqual([ArtifactRole.MODEL_3DTILES]);
        expect(offered({ artifacts: [{ role: ArtifactRole.RASTER_COG, url: '/b/cog/cog.tif', downloadName: 'cog.tif' }] }))
            .toEqual([ArtifactRole.RASTER_COG]);
    });

    it('offers nothing for an artifact the server does not offer as a download', () => {
        // The 3D Tiles of a .3tz: the uploaded file is that archive already
        expect(offersBuildDownload({ artifacts: [{ role: ArtifactRole.MODEL_3DTILES, url: '/b/3dtiles/tileset.json' }] },
            row(ArtifactRole.MODEL_3DTILES))).toBe(false);
    });

    it('offers nothing for an entry without artifacts (not built, or not buildable)', () => {
        expect(offered({})).toEqual([]);
        expect(offered(null)).toEqual([]);
    });

    it('leaves the splat roles to the downloads of a splat', () => {
        expect(BUILD_DOWNLOADS.some(d => d.role.startsWith('gsplat.'))).toBe(false);
    });
});

describe('what a download says when it starts', () => {
    const copc = crs => ({ artifacts: [{ role: ArtifactRole.POINTCLOUD_COPC, url: '/b/copc/cloud.copc.laz', downloadName: 'cloud.copc.laz', crs }] });

    it('names the CRS of a COPC built in another CRS than its file', () => {
        expect(buildDownloadNote(copc({ name: 'WGS 84 / UTM zone 33N', epsg: 32633, transformed: true }), ArtifactRole.POINTCLOUD_COPC))
            .toContain('WGS 84 / UTM zone 33N (EPSG:32633)');
    });

    it('says nothing otherwise: a COPC in the CRS of its file, a build that does not say, another download', () => {
        expect(buildDownloadNote(copc({ name: 'WGS 84 / UTM zone 33N', epsg: 32633, transformed: false }), ArtifactRole.POINTCLOUD_COPC)).toBeNull();
        expect(buildDownloadNote(copc(undefined), ArtifactRole.POINTCLOUD_COPC)).toBeNull();
        expect(buildDownloadNote(copc({ name: 'x', epsg: 1, transformed: true }), ArtifactRole.RASTER_COG)).toBeNull();
        expect(buildDownloadNote(null, 'not.a.role')).toBeNull();
    });
});

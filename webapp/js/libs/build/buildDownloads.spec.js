/**
 * The downloads of built files: offered when the entry's artifacts say the server offers them,
 * whatever the type of the file.
 */
import { describe, it, expect } from 'vitest';
import { BUILD_DOWNLOADS, offersBuildDownload } from './buildDownloads';
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

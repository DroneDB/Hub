/**
 * Build artifacts by role (plan XI-04): the Hub asks for what an artifact is for,
 * and one module knows where DroneDB puts it.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { ArtifactRole, ALL_ARTIFACT_ROLES, artifactPath } from './buildArtifacts';
import { streamableArtifactRole } from '@/libs/ogcShareUrls';
import layout from './buildArtifacts.json';

const T = ddb.entry.type;

/** A fake dataset whose registry answers HEAD requests from a set of existing paths. */
function datasetWith(existingPaths) {
    const base = 'http://hub.test/orgs/o/ds/d';
    return {
        baseApi: base,
        registry: {
            headRequest: vi.fn(async url => existingPaths.some(p => url === `${base}/build/h1/${p}`)),
            fetchRaw: vi.fn(async () => new Response(JSON.stringify({ min: [0, 0, 0], max: [1, 1, 1] }), { status: 200 }))
        }
    };
}

const entryIn = (dataset, type = T.VECTOR) => new ddb.entry.Entry(dataset, { hash: 'h1', path: 'a/b.dxf', type });

describe('buildArtifacts', () => {
    it('knows a build path for every role', () => {
        for (const role of ALL_ARTIFACT_ROLES) expect(artifactPath(role)).toMatch(/^[a-z0-9]+\/[\w.]+$/);
    });

    it('has exactly one layout entry per role (the lint guard reads the same table)', () => {
        expect(Object.keys(layout).sort()).toEqual([...ALL_ARTIFACT_ROLES].sort());
    });

    it('rejects an unknown role instead of guessing a path', () => {
        expect(() => artifactPath('vector.fgb')).toThrow('Unknown build artifact role');
    });

    it('points vectors at the GeoPackage DroneDB writes (never the old vector.fgb)', () => {
        expect(artifactPath(ArtifactRole.VECTOR_GPKG)).toBe('vec/source.gpkg');
        expect(ALL_ARTIFACT_ROLES.map(artifactPath)).not.toContain('vec/vector.fgb');
    });
});

describe('Entry artifact helpers', () => {
    it('findArtifact returns the URL of an artifact that exists and null otherwise', async () => {
        const entry = entryIn(datasetWith(['vec/source.gpkg']));
        expect(await entry.findArtifact(ArtifactRole.VECTOR_GPKG)).toBe('http://hub.test/orgs/o/ds/d/build/h1/vec/source.gpkg');
        expect(await entry.findArtifact(ArtifactRole.VECTOR_MVT)).toBeNull();
    });

    it('requireArtifact names what is missing', async () => {
        const entry = entryIn(datasetWith([]), T.POINTCLOUD);
        await expect(entry.getCopc()).rejects.toThrow('The COPC file is not available.');
    });

    it('reads an optional JSON artifact, and returns null when it is absent', async () => {
        expect(await entryIn(datasetWith(['gsplat/bounds.json']), T.GAUSSIAN_SPLAT).getGsplatBounds())
            .toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
        expect(await entryIn(datasetWith([]), T.GAUSSIAN_SPLAT).getGsplatBounds()).toBeNull();
    });
});

describe('Share/Embed streamable artifact', () => {
    it('streams the artifact each geo type builds, and nothing for other types', () => {
        expect(streamableArtifactRole(T.POINTCLOUD)).toBe(ArtifactRole.POINTCLOUD_COPC);
        expect(streamableArtifactRole(T.GEORASTER)).toBe(ArtifactRole.RASTER_COG);
        expect(streamableArtifactRole(T.VECTOR)).toBe(ArtifactRole.VECTOR_GPKG);
        expect(streamableArtifactRole(T.IMAGE)).toBeNull();
    });

    it('resolves a built vector to its GeoPackage URL (Share/Embed used to fail for every vector)', async () => {
        const entry = entryIn(datasetWith(['vec/source.gpkg', 'mvt/metadata.json']));
        const url = await entry.findArtifact(streamableArtifactRole(T.VECTOR));
        expect(url).toBe('http://hub.test/orgs/o/ds/d/build/h1/vec/source.gpkg');
    });
});

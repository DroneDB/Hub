/**
 * Build artifacts by role: the entry DTO lists the artifacts that exist, the Hub
 * asks by role and requests nothing to find out.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { ArtifactRole, artifactsOf, findArtifactIn, artifactHref } from './buildArtifacts';
import { streamableArtifactRole } from '@/libs/ogcShareUrls';

const T = ddb.entry.type;

const GPKG = { role: 'vector.gpkg', url: 'http://hub.test/orgs/o/ds/d/build/h1/vec/source.gpkg', mediaType: 'application/geopackage+sqlite3' };
const MVT = { role: 'vector.mvt', url: 'http://hub.test/orgs/o/ds/d/build/h1/mvt/metadata.json', mediaType: 'application/json' };
const BOUNDS = { role: 'gsplat.bounds', url: 'http://hub.test/orgs/o/ds/d/build/h1/gsplat/bounds.json', mediaType: 'application/json' };

/** A fake dataset: any request the Hub makes is recorded, none is expected for a lookup. */
function datasetWith() {
    return {
        baseApi: '/orgs/o/ds/d',
        registry: {
            fetchRaw: vi.fn(async () => new Response(JSON.stringify({ min: [0, 0, 0], max: [1, 1, 1] }), { status: 200 })),
            headRequest: vi.fn()
        }
    };
}

const entryWith = (artifacts, dataset = datasetWith(), type = T.VECTOR) =>
    new ddb.entry.Entry(dataset, { hash: 'h1', path: 'a/b.dxf', type, ...(artifacts ? { artifacts } : {}) });

describe('artifact lookup on the entry DTO', () => {
    it('lists nothing for an entry without artifacts (not built, not buildable, listed before its build)', () => {
        expect(artifactsOf({})).toEqual([]);
        expect(artifactsOf(null)).toEqual([]);
        expect(artifactsOf({ artifacts: 'x' })).toEqual([]);
    });

    it('finds an artifact by role and returns null when the entry lacks it', () => {
        const entry = { artifacts: [GPKG, MVT] };
        expect(findArtifactIn(entry, ArtifactRole.VECTOR_GPKG)).toBe(GPKG);
        expect(findArtifactIn(entry, ArtifactRole.VECTOR_LOCAL)).toBeNull();
        expect(findArtifactIn({}, ArtifactRole.VECTOR_GPKG)).toBeNull();
    });

    it('takes the first role of an any-of list that exists', () => {
        const entry = { artifacts: [GPKG, MVT] };
        expect(findArtifactIn(entry, [ArtifactRole.VECTOR_LOCAL, ArtifactRole.VECTOR_MVT, ArtifactRole.VECTOR_GPKG])).toBe(MVT);
        expect(findArtifactIn(entry, [ArtifactRole.GSPLAT_LOD, ArtifactRole.GSPLAT_SPZ])).toBeNull();
    });

    it('ignores a role it does not know and keeps working with the ones it asks for (new libddb formats pass through)', () => {
        const entry = { artifacts: [{ role: 'raster.pmtiles', url: '/orgs/o/ds/d/build/h1/pm/x.pmtiles' }, GPKG] };
        expect(findArtifactIn(entry, ArtifactRole.VECTOR_GPKG)).toBe(GPKG);
    });

    it('requests an artifact on the Hub origin: the host Registry believes it has is dropped', () => {
        expect(artifactHref(GPKG)).toBe('/orgs/o/ds/d/build/h1/vec/source.gpkg');
        expect(artifactHref({ role: 'x', url: 'https://localhost:5000/orgs/o/ds/d/build/h/a%20b/c.tif?v=1' }))
            .toBe('/orgs/o/ds/d/build/h/a%20b/c.tif?v=1');
        expect(artifactHref({ role: 'x', url: '/orgs/o/ds/d/build/h/c.tif' })).toBe('/orgs/o/ds/d/build/h/c.tif');
    });
});

describe('Entry artifact helpers', () => {
    it('findArtifact returns the URL of a listed artifact and null otherwise, without a request', () => {
        const dataset = datasetWith();
        const entry = entryWith([GPKG], dataset);
        expect(entry.findArtifact(ArtifactRole.VECTOR_GPKG)).toBe('/orgs/o/ds/d/build/h1/vec/source.gpkg');
        expect(entry.findArtifact(ArtifactRole.VECTOR_MVT)).toBeNull();
        expect(dataset.registry.headRequest).not.toHaveBeenCalled();
        expect(dataset.registry.fetchRaw).not.toHaveBeenCalled();
    });

    it('requireArtifact names what is missing', () => {
        const entry = entryWith(undefined, datasetWith(), T.POINTCLOUD);
        expect(() => entry.getCopc()).toThrow('The COPC file is not available.');
    });

    it('requireArtifact returns the listed URL', () => {
        const copc = { role: 'pointcloud.copc', url: 'http://x/orgs/o/ds/d/build/h1/copc/cloud.copc.laz', mediaType: 'application/vnd.laszip' };
        expect(entryWith([copc], datasetWith(), T.POINTCLOUD).getCopc()).toBe('/orgs/o/ds/d/build/h1/copc/cloud.copc.laz');
    });

    it('reads an optional JSON artifact from its listed URL, and returns null when it is not listed', async () => {
        const dataset = datasetWith();
        expect(await entryWith([BOUNDS], dataset, T.GAUSSIAN_SPLAT).getGsplatBounds()).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
        expect(dataset.registry.fetchRaw).toHaveBeenCalledWith('/orgs/o/ds/d/build/h1/gsplat/bounds.json');

        const none = datasetWith();
        expect(await entryWith(undefined, none, T.GAUSSIAN_SPLAT).getGsplatBounds()).toBeNull();
        expect(none.registry.fetchRaw).not.toHaveBeenCalled();
    });

    it('the LOD splat is null when only the .spz is listed', () => {
        const spz = { role: 'gsplat.spz', url: '/orgs/o/ds/d/build/h1/gsplat/model.spz' };
        const entry = entryWith([spz], datasetWith(), T.GAUSSIAN_SPLAT);
        expect(entry.getGsplatLod()).toBeNull();
        expect(entry.getGsplat()).toBe('/orgs/o/ds/d/build/h1/gsplat/model.spz');
    });
});

describe('Share/Embed streamable artifact', () => {
    it('streams the artifact each geo type builds, and nothing for other types', () => {
        expect(streamableArtifactRole(T.POINTCLOUD)).toBe(ArtifactRole.POINTCLOUD_COPC);
        expect(streamableArtifactRole(T.GEORASTER)).toBe(ArtifactRole.RASTER_COG);
        expect(streamableArtifactRole(T.VECTOR)).toBe(ArtifactRole.VECTOR_GPKG);
        expect(streamableArtifactRole(T.IMAGE)).toBeNull();
    });

    it('resolves a built vector to its GeoPackage URL (Share/Embed used to fail for every vector)', () => {
        const url = entryWith([GPKG, MVT]).findArtifact(streamableArtifactRole(T.VECTOR));
        expect(url).toBe('/orgs/o/ds/d/build/h1/vec/source.gpkg');
    });
});

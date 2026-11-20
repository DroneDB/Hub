import { describe, it, expect, beforeEach } from 'vitest';
import { transformExtent, toLonLat } from 'ol/proj';
import { SplatFootprints, footprintOf, isGeoreferencedSplat } from './splatFootprints';
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';
import ddb from 'ddb';

const SPLAT = ddb.entry.type.GAUSSIAN_SPLAT;
const WORLD = [-20037508, -20037508, 20037508, 20037508];

const FOOTPRINT = {
    type: 'Polygon',
    coordinates: [[[11.0, 43.0], [11.002, 43.0], [11.002, 43.001], [11.0, 43.001], [11.0, 43.0]]]
};

// The point_geom as Registry sends it: a GeoJSON Feature of the Point, with the CRS of the index
const pointGeom = coordinates => ({
    type: 'Feature',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    geometry: { type: 'Point', coordinates },
    properties: {}
});

const splat = (name, extra = {}) => ({
    entry: {
        path: name, hash: `hash-${name}`, type: SPLAT,
        point_geom: pointGeom([11.001, 43.0005, 100]),
        properties: { georeferenced: true, georef: { kind: 'enu', origin: [43.0005, 11.001, 100] } },
        ...extra
    }
});

/** A dataset whose entries list a bounds artifact per path (or none) and read the given bounds. */
function datasetWith(boundsByPath) {
    const reads = [];
    const dataset = {
        Entry: entry => ({
            findArtifact: role => (role === ArtifactRole.GSPLAT_BOUNDS && entry.path in boundsByPath ? `/build/${entry.hash}/bounds.json` : null),
            getGsplatBounds: async () => {
                reads.push(entry.path);
                const b = boundsByPath[entry.path];
                if (b instanceof Error) throw b;
                return b;
            }
        })
    };
    return { dataset, reads };
}

const geometryType = (splats, file) => splats.features.get(file).getGeometry().getType();

let splats;
beforeEach(() => { splats = new SplatFootprints(); });

describe('which files are drawn', () => {
    it('is a splat with a georeference and a point', () => {
        expect(isGeoreferencedSplat(splat('a.spz'))).toBe(true);
        // A bare Point geometry is read too
        expect(isGeoreferencedSplat(splat('a.spz', { point_geom: { type: 'Point', coordinates: [11, 43] } }))).toBe(true);
    });

    it('draws the point Registry sends where it is', () => {
        const a = splat('a.spz');
        splats.setFiles([a]);
        const [x, y] = splats.features.get(a).getGeometry().getCoordinates();
        expect(toLonLat([x, y])[0]).toBeCloseTo(11.001, 6);
        expect(toLonLat([x, y])[1]).toBeCloseTo(43.0005, 6);
    });

    it.each([
        ['a splat that is not georeferenced', splat('a.spz', { properties: { georeferenced: false } })],
        ['a splat with no properties', splat('a.spz', { properties: undefined })],
        ['a splat with no point', splat('a.spz', { point_geom: null })],
        ['a splat whose Feature has no geometry', splat('a.spz', { point_geom: { type: 'Feature', geometry: null } })],
        ['a splat with a point out of range', splat('a.spz', { point_geom: pointGeom([11, 143]) })],
        ['another type of file', splat('a.jpg', { type: ddb.entry.type.GEOIMAGE })]
    ])('is not %s', (_name, file) => {
        expect(isGeoreferencedSplat(file)).toBe(false);
    });

    it('puts only the georeferenced splats on the map, as points', () => {
        const a = splat('a.spz');
        const plain = splat('b.spz', { properties: { georeferenced: false } });
        splats.setFiles([a, plain, { entry: { path: 'c.jpg', type: ddb.entry.type.GEOIMAGE, point_geom: pointGeom([1, 2]) } }]);
        expect([...splats.features.keys()]).toEqual([a]);
        expect(splats.source.getFeatures()).toHaveLength(1);
        expect(geometryType(splats, a)).toBe('Point');
    });

    it('forgets the files that are no longer on show', () => {
        splats.setFiles([splat('a.spz')]);
        splats.setFiles([]);
        expect(splats.source.getFeatures()).toHaveLength(0);
        expect(splats.features.size).toBe(0);
    });
});

describe('footprintOf', () => {
    it('is the wgs84Footprint polygon', () => {
        expect(footprintOf({ min: [0, 0, 0], max: [1, 1, 1], wgs84Footprint: FOOTPRINT })).toEqual(FOOTPRINT);
    });

    it.each([
        ['bounds without a footprint', { min: [0, 0, 0], max: [1, 1, 1] }],
        ['no bounds', null],
        ['a footprint that is not a polygon', { wgs84Footprint: { type: 'Point', coordinates: [1, 2] } }],
        ['a ring that is not closed', { wgs84Footprint: { type: 'Polygon', coordinates: [[[1, 2], [2, 2], [2, 3], [1, 4]]] } }],
        ['a ring of three positions', { wgs84Footprint: { type: 'Polygon', coordinates: [[[1, 2], [2, 2], [1, 2]]] } }],
        ['a position that is not a longitude and a latitude', { wgs84Footprint: { type: 'Polygon', coordinates: [[[1, 200], [2, 2], [2, 3], [1, 200]]] } }],
        ['a ring of text', { wgs84Footprint: { type: 'Polygon', coordinates: [[['1', '2'], ['2', '2'], ['2', '3'], ['1', '2']]] } }]
    ])('is null for %s', (_name, bounds) => {
        expect(footprintOf(bounds)).toBeNull();
    });
});

describe('the footprint of a built splat', () => {
    it('replaces the point with the polygon of the bounds, in Web Mercator', async () => {
        const file = splat('a.spz');
        splats.setFiles([file]);
        const { dataset } = datasetWith({ 'a.spz': { min: [0, 0, 0], max: [1, 1, 1], wgs84Footprint: FOOTPRINT } });
        await splats.loadInView(WORLD, dataset);

        expect(geometryType(splats, file)).toBe('Polygon');
        const expected = transformExtent([11.0, 43.0, 11.002, 43.001], 'EPSG:4326', 'EPSG:3857');
        splats.features.get(file).getGeometry().getExtent().forEach((v, i) => expect(v).toBeCloseTo(expected[i], 4));
    });

    it('keeps the point when the bounds have no footprint', async () => {
        const file = splat('a.spz');
        splats.setFiles([file]);
        await splats.loadInView(WORLD, datasetWith({ 'a.spz': { min: [0, 0, 0], max: [1, 1, 1] } }).dataset);
        expect(geometryType(splats, file)).toBe('Point');
    });

    it('keeps the point when the bounds cannot be read', async () => {
        const file = splat('a.spz');
        splats.setFiles([file]);
        await splats.loadInView(WORLD, datasetWith({ 'a.spz': new Error('network') }).dataset);
        expect(geometryType(splats, file)).toBe('Point');
    });

    it('keeps the point, and asks nothing, for a splat that lists no bounds (not built yet)', async () => {
        const file = splat('a.spz');
        splats.setFiles([file]);
        const { dataset, reads } = datasetWith({});
        await splats.loadInView(WORLD, dataset);
        expect(reads).toEqual([]);
        expect(geometryType(splats, file)).toBe('Point');
    });

    it('does nothing without a dataset', async () => {
        splats.setFiles([splat('a.spz')]);
        await expect(splats.loadInView(WORLD, null)).resolves.toBeUndefined();
    });
});

describe('what is read, and when', () => {
    it('is the bounds of the splats in view only', async () => {
        const near = splat('near.spz');
        const far = splat('far.spz', { point_geom: pointGeom([-70, -30]) });
        splats.setFiles([near, far]);
        const { dataset, reads } = datasetWith({ 'near.spz': { min: [0], max: [1], wgs84Footprint: FOOTPRINT }, 'far.spz': { min: [0], max: [1] } });
        await splats.loadInView(transformExtent([10.9, 42.9, 11.1, 43.1], 'EPSG:4326', 'EPSG:3857'), dataset);
        expect(reads).toEqual(['near.spz']);

        await splats.loadInView(WORLD, dataset);
        expect(reads).toEqual(['near.spz', 'far.spz']);
    });

    it('is read once per build, however often the map moves', async () => {
        splats.setFiles([splat('a.spz')]);
        const { dataset, reads } = datasetWith({ 'a.spz': { min: [0], max: [1], wgs84Footprint: FOOTPRINT } });
        await Promise.all([splats.loadInView(WORLD, dataset), splats.loadInView(WORLD, dataset)]);
        await splats.loadInView(WORLD, dataset);
        expect(reads).toEqual(['a.spz']);
    });

    it('is read again for a new file list, so a splat built again under the same bounds URL gets the footprint of its new build', async () => {
        // An older build without a footprint, then the same file built again (same hash, same URL) with one
        const bounds = { 'a.spz': { min: [0], max: [1] } };
        const { dataset, reads } = datasetWith(bounds);
        splats.setFiles([splat('a.spz')]);
        await splats.loadInView(WORLD, dataset);

        bounds['a.spz'] = { min: [0], max: [1], wgs84Footprint: FOOTPRINT };
        const again = splat('a.spz');
        splats.setFiles([again]);
        expect(geometryType(splats, again)).toBe('Point');
        await splats.loadInView(WORLD, dataset);
        expect(geometryType(splats, again)).toBe('Polygon');
        expect(reads).toEqual(['a.spz', 'a.spz']);
    });

    it.each([
        ['bounds that could not be read (a server error or a dropped connection)', null],
        ['a read that throws', new Error('network')]
    ])('is asked again on the next move after %s, and then applied', async (_name, failure) => {
        const bounds = { 'a.spz': failure };
        const { dataset, reads } = datasetWith(bounds);
        const file = splat('a.spz');
        splats.setFiles([file]);
        await splats.loadInView(WORLD, dataset);
        expect(geometryType(splats, file)).toBe('Point');

        bounds['a.spz'] = { min: [0], max: [1], wgs84Footprint: FOOTPRINT };
        await splats.loadInView(WORLD, dataset);
        expect(geometryType(splats, file)).toBe('Polygon');
        expect(reads).toEqual(['a.spz', 'a.spz']);
    });

    it('is not asked again, within a file list, for bounds that were read and have no footprint', async () => {
        const { dataset, reads } = datasetWith({ 'a.spz': { min: [0], max: [1] } });
        splats.setFiles([splat('a.spz')]);
        await splats.loadInView(WORLD, dataset);
        await splats.loadInView(WORLD, dataset);
        expect(reads).toEqual(['a.spz']);
    });

    it('is read again for a build that is another (its bounds have another URL)', async () => {
        const { dataset, reads } = datasetWith({ 'a.spz': { min: [0], max: [1], wgs84Footprint: FOOTPRINT } });
        splats.setFiles([splat('a.spz')]);
        await splats.loadInView(WORLD, dataset);
        splats.setFiles([splat('a.spz', { hash: 'rebuilt' })]);
        await splats.loadInView(WORLD, dataset);
        expect(reads).toEqual(['a.spz', 'a.spz']);
    });

    it('is not applied to a feature the files on show have left behind', async () => {
        const old = splat('a.spz');
        splats.setFiles([old]);
        const { dataset } = datasetWith({ 'a.spz': { min: [0], max: [1], wgs84Footprint: FOOTPRINT } });
        const staleFeature = splats.features.get(old);
        const loading = splats.loadInView(WORLD, dataset);
        splats.setFiles([]);
        await loading;
        expect(staleFeature.getGeometry().getType()).toBe('Point');
        expect(splats.source.getFeatures()).toHaveLength(0);
    });
});

describe('extent', () => {
    it('is empty with no splat and covers the points otherwise', () => {
        expect(splats.extent().every(v => !Number.isFinite(v))).toBe(true);
        splats.setFiles([splat('a.spz')]);
        const [minX, , maxX] = splats.extent();
        expect(Number.isFinite(minX) && Number.isFinite(maxX)).toBe(true);
    });
});


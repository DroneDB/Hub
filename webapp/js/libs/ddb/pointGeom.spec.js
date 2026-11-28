/**
 * The place of an entry is read from its point_geom as Registry sends it (a GeoJSON Feature of a
 * Point) and from a bare Point.
 */
import { describe, it, expect } from 'vitest';
import { pointLonLat } from './pointGeom';

const feature = geometry => ({
    type: 'Feature', crs: { type: 'name', properties: { name: 'EPSG:4326' } }, geometry, properties: {}
});

describe('pointLonLat', () => {
    it('reads the Point of the Feature Registry sends', () => {
        expect(pointLonLat(feature({ type: 'Point', coordinates: [-91.99401, 46.842651, 0] })))
            .toEqual([-91.99401, 46.842651, 0]);
    });

    it('reads a bare Point', () => {
        expect(pointLonLat({ type: 'Point', coordinates: [11, 43] })).toEqual([11, 43]);
    });

    it.each([
        ['nothing', null],
        ['a Feature without a geometry', feature(null)],
        ['a polygon', feature({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })],
        ['a point without a latitude', { type: 'Point', coordinates: [11] }],
        ['a point that is not a number', { type: 'Point', coordinates: [11, NaN] }]
    ])('is null for %s', (_name, pointGeom) => {
        expect(pointLonLat(pointGeom)).toBeNull();
    });
});

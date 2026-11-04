/**
 * The CSV of the map's measurements reads the GeoJSON export: the values in the units the map
 * shows, one area scale with the labels, the geometry as WKT in WGS84, the group's name and the
 * other properties of each measurement.
 */
import { describe, it, expect } from 'vitest';
import Feature from 'ol/Feature';
import { LineString, Point, Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Vector as VectorSource } from 'ol/source';
import { exportMeasurements } from './olMeasurementConverter';
import { measurementsToCsv, geometryToWkt } from './measurementCsv';

const feature = (geometry, props) => {
    const f = new Feature(geometry);
    Object.entries(props).forEach(([k, v]) => f.set(k, v));
    return f;
};
// About 100 m x 100 m at the equator: 1 ha
const square = new Polygon([[[0, 0], [0.0008983, 0], [0.0008983, 0.0009043], [0, 0.0009043], [0, 0]].map(c => fromLonLat(c))]);
const line = new LineString([[0, 0], [0.0004492, 0]].map(c => fromLonLat(c)));

function exported(units) {
    const source = new VectorSource();
    source.addFeatures([
        feature(new Point(fromLonLat([11.25, 43.5])), { measurementType: 'point', name: 'Gate, north', description: 'Say "open"', groupId: 'g1', createdAt: 't0' }),
        feature(line.clone(), { measurementType: 'length', name: 'Fence', createdAt: 't1' }),
        feature(square.clone(), { measurementType: 'area', name: 'Field', groupId: 'g1', createdAt: 't2' })
    ]);
    return exportMeasurements(source, 'ortho.tif', units);
}
const parse = csv => csv.trim().split('\r\n');
const groups = [{ id: 'g1', name: 'Site A' }];

describe('measurementsToCsv', () => {
    it('writes one row per measurement with its group, value, unit and WKT', () => {
        const [header, point, length, area] = parse(measurementsToCsv(exported('metric'), groups, 'metric'));
        expect(header).toBe('group,name,type,value,unit,longitude,latitude,wkt,description,createdAt,length_m,area_m2');
        expect(point).toMatch(/^Site A,"Gate, north",point,,,11\.25,43\.5,POINT \(11\.25\d* 43\.5\d*\),"Say ""open""",t0,,$/);
        expect(length).toMatch(/^,Fence,length,(49\.9\d|50(\.0\d?)?),m,,,"LINESTRING \(0 0, 0\.000449\d* 0\)",,t1,(49\.9\d|50(\.0\d?)?),$/);
        expect(area).toMatch(/^Site A,Field,area,1(\.0\d?)?,ha,,,"POLYGON \(\(0 0, .*\)\)",,t2,,100\d\d(\.\d+)?$/);
    });

    it('gives the values in the units the map shows: the same area scale as the labels', () => {
        const [, , length, area] = parse(measurementsToCsv(exported('imperial'), groups, 'imperial'));
        expect(length).toMatch(/^,Fence,length,16[34]\.\d+,ft,/);
        expect(area).toMatch(/^Site A,Field,area,2\.4\d,acres,/);
    });

    it('gives the net volume of a stockpile in the volume unit of the units shown', () => {
        const geojson = { features: [{ type: 'Feature', geometry: null,
            properties: { measurementType: 'stockpile', name: 'Pile', netVolume: 76.4554857984, materialName: 'Gravel' } }] };
        const [header, row] = parse(measurementsToCsv(geojson, [], 'imperial'));
        expect(header).toBe('group,name,type,value,unit,longitude,latitude,wkt,description,netVolume,materialName');
        expect(row).toBe(',Pile,stockpile,100,yd³,,,,,76.4554857984,Gravel');
    });

    it('writes an object property as JSON in one field', () => {
        const geojson = { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] },
            properties: { measurementType: 'point', longitude: 1, latitude: 2, extra: { a: 1 } } }] };
        expect(parse(measurementsToCsv(geojson))[1]).toBe(',,point,,,1,2,POINT (1 2),,"{""a"":1}"');
    });

    it('writes only the header when there is nothing to export', () => {
        expect(measurementsToCsv({ features: [] })).toBe('group,name,type,value,unit,longitude,latitude,wkt,description\r\n');
    });
});

describe('geometryToWkt', () => {
    it('writes points, lines and polygons with holes in two dimensions', () => {
        expect(geometryToWkt({ type: 'Point', coordinates: [1, 2, 3] })).toBe('POINT (1 2)');
        expect(geometryToWkt({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toBe('LINESTRING (0 0, 1 1)');
        expect(geometryToWkt({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 1]]] }))
            .toBe('POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))');
        expect(geometryToWkt(null)).toBe('');
    });
});

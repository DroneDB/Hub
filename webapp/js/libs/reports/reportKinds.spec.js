/**
 * What an annotation is to a report: its kind, the total it adds to, and what it measures.
 */
import { describe, it, expect } from 'vitest';
import { kindOfFeature, totalKeyOf, metresPerUnit, measuredOf, KIND_ORDER, KIND_LABELS } from './reportKinds';
import { MEASUREMENT_KINDS } from './reportDefinition';
import { geodesicLength, geodesicArea } from '@/libs/map/geodesic';
import { mapFeature, cloudFeature, square } from './reportModel.fixtures';

const POINT = { type: 'Point', coordinates: [9.2, 45.1] };
const LINE = { type: 'LineString', coordinates: [[9.2, 45.1], [9.2005, 45.1005]] };
const POLYGON = square(9.2, 45.1, 10);

describe('the kind of an annotation', () => {
    it.each([
        ['map', 'point', POINT, 'point'],
        ['map', 'length', LINE, 'length'],
        ['map', 'area', POLYGON, 'area'],
        ['map', 'profile', LINE, 'profile'],
        ['map', 'stockpile', POLYGON, 'volume'],
        ['pointCloud', 'point', POINT, 'point'],
        ['pointCloud', 'annotation', POINT, 'point'],
        ['pointCloud', 'distance', LINE, 'length'],
        ['pointCloud', 'height', LINE, 'length'],
        ['pointCloud', 'area', POLYGON, 'area'],
        ['pointCloud', 'circle', POINT, 'measure3d'],
        ['pointCloud', 'angle', POINT, 'measure3d']
    ])('is as the table says: %s %s is %s', (owner, type, geometry, kind) => {
        const make = owner === 'map' ? mapFeature : cloudFeature;
        expect(kindOfFeature(make('x', '1', type, geometry))).toMatchObject({ owner, kind, measurementType: type });
    });

    it('is by its geometry for a map feature with no type or an unknown one', () => {
        expect(kindOfFeature(mapFeature('x', '1', undefined, POINT)).kind).toBe('point');
        expect(kindOfFeature(mapFeature('x', '1', 'unknown', LINE)).kind).toBe('length');
        expect(kindOfFeature(mapFeature('x', '1', 'whatever', POLYGON)).kind).toBe('area');
    });

    it('is none for a contour line, which is no annotation', () => {
        expect(kindOfFeature(mapFeature('x', '', 'contour', LINE))).toBeNull();
    });

    it('is none for a geometry that is no point, line or polygon, and no feature', () => {
        expect(kindOfFeature(mapFeature('x', '1', undefined, { type: 'MultiPoint', coordinates: [[1, 2]] }))).toBeNull();
        expect(kindOfFeature(mapFeature('x', '1', undefined, null))).toBeNull();
        expect(kindOfFeature(null)).toBeNull();
    });

    it('uses the kinds the filter and the definition know, in the order of the tables', () => {
        expect([...KIND_ORDER]).toEqual([...MEASUREMENT_KINDS]);
        expect(Object.keys(KIND_LABELS)).toEqual([...MEASUREMENT_KINDS]);
    });
});

describe('the total an item adds to', () => {
    it('is length for a length or a distance, not for a height or a profile', () => {
        expect(totalKeyOf({ kind: 'length', measurementType: 'length' })).toBe('length');
        expect(totalKeyOf({ kind: 'length', measurementType: 'distance' })).toBe('length');
        expect(totalKeyOf({ kind: 'length', measurementType: 'height' })).toBeNull();
        expect(totalKeyOf({ kind: 'profile', measurementType: 'profile' })).toBeNull();
    });

    it('is area for an area, volume for a stockpile, and none for the rest', () => {
        expect(totalKeyOf({ kind: 'area', measurementType: 'area' })).toBe('area');
        expect(totalKeyOf({ kind: 'volume', measurementType: 'stockpile' })).toBe('volume');
        expect(totalKeyOf({ kind: 'point', measurementType: 'point' })).toBeNull();
        expect(totalKeyOf({ kind: 'measure3d', measurementType: 'circle' })).toBeNull();
    });
});

describe('metresPerUnit', () => {
    it('knows the units of a point cloud CRS, squared or not', () => {
        expect(metresPerUnit('m')).toBe(1);
        expect(metresPerUnit('m²')).toBe(1);
        expect(metresPerUnit('ft')).toBe(0.3048);
        expect(metresPerUnit('ft²')).toBe(0.3048);
        expect(metresPerUnit('ftUS²')).toBeCloseTo(1200 / 3937, 12);
    });

    it('is metres for no unit, and null for one it does not know', () => {
        expect(metresPerUnit(undefined)).toBe(1);
        expect(metresPerUnit('')).toBe(1);
        expect(metresPerUnit('furlong')).toBeNull();
    });
});

describe('what an item measures', () => {
    it('is, for a 2D item, the geodesic length or area and perimeter of its geometry', () => {
        const length = mapFeature('x', '1', 'length', LINE);
        expect(measuredOf({ owner: 'map', kind: 'length' }, length).length).toBe(geodesicLength(LINE.coordinates));
        const area = mapFeature('x', '1', 'area', POLYGON);
        const measured = measuredOf({ owner: 'map', kind: 'area' }, area);
        expect(measured.area).toBe(geodesicArea(POLYGON.coordinates));
        expect(measured.perimeter).toBeCloseTo(40, 0);
    });

    it('is, for a 3D item, what it was saved with in metres', () => {
        const distance = cloudFeature('x', '1', 'distance', LINE, { distance: 10, unit: 'ft' });
        expect(measuredOf({ owner: 'pointCloud', kind: 'length' }, distance).length).toBeCloseTo(3.048, 9);
        const circle = cloudFeature('x', '1', 'circle', POINT, { radius: 2, circumference: 12.5, area: 12.5, unit: 'm' });
        expect(measuredOf({ owner: 'pointCloud', kind: 'measure3d' }, circle)).toMatchObject({ radius: 2, circumference: 12.5, area: 12.5 });
        const angle = cloudFeature('x', '1', 'angle', POINT, { angle: 45, unit: 'degrees' });
        expect(measuredOf({ owner: 'pointCloud', kind: 'measure3d' }, angle).angle).toBe(45);
    });

    it('is nothing for a point and a stockpile (it has its own figures), and says when a unit cannot be converted', () => {
        expect(measuredOf({ owner: 'map', kind: 'point' }, mapFeature('x', '1', 'point', POINT)).length).toBeNull();
        expect(measuredOf({ owner: 'map', kind: 'volume' }, mapFeature('x', '1', 'stockpile', POLYGON)).area).toBeNull();
        const odd = cloudFeature('x', '1', 'distance', LINE, { distance: 1, unit: 'furlong' });
        expect(measuredOf({ owner: 'pointCloud', kind: 'length' }, odd)).toMatchObject({ length: null, unconvertible: true });
    });
});

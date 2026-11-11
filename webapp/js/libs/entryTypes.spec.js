import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { isGeoraster, canOpenInMap } from './entryTypes';

const T = ddb.entry.type;

describe('isGeoraster', () => {
    it('accepts a georaster entry only', () => {
        expect(isGeoraster({ type: T.GEORASTER, path: 'a.tif' })).toBe(true);
        expect(isGeoraster({ type: T.GEOIMAGE, path: 'a.jpg' })).toBe(false);
        expect(isGeoraster({ type: T.POINTCLOUD, path: 'a.laz' })).toBe(false);
        expect(isGeoraster({ type: T.DIRECTORY, path: 'a' })).toBe(false);
    });

    it('is false when there is no entry', () => {
        expect(isGeoraster(null)).toBe(false);
        expect(isGeoraster(undefined)).toBe(false);
    });
});

describe('canOpenInMap', () => {
    const T = ddb.entry.type;

    it('takes the map-viewable types', () => {
        for (const type of [T.GEORASTER, T.GEOIMAGE, T.POINTCLOUD, T.VECTOR, T.GEOVIDEO]) expect(canOpenInMap({ type, path: 'x' })).toBe(true);
    });

    it('refuses other files, a drawing without geolocation and no entry', () => {
        for (const type of [T.MARKDOWN, T.IMAGE, T.MODEL, T.GENERIC, T.DIRECTORY]) expect(canOpenInMap({ type, path: 'x' })).toBe(false);
        expect(canOpenInMap({ type: T.VECTOR, path: 'a.dxf', properties: { georeferenced: false } })).toBe(false);
        expect(canOpenInMap(null)).toBe(false);
    });
});

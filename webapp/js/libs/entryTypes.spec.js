import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { isGeoraster } from './entryTypes';

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

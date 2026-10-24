/**
 * Unit tests for the CAD coordinate-system row of libs/propertiesUtils.js.
 * Run with: npx vitest run webapp/js/libs/propertiesUtils.spec.js
 */
import { describe, it, expect } from 'vitest';
import { formatCadCrs, tidyProperties, beautifyKey, isUrl } from './propertiesUtils';

const entry = (crs, units = 'm') => ({ properties: { vector: { crs, units } } });

describe('formatCadCrs', () => {
    it('says when WGS84 was assumed', () => {
        expect(formatCadCrs(entry({ source: 'lonlat', label: 'EPSG:4326' })))
            .toMatch(/^WGS84 \(EPSG:4326\), assumed/);
    });

    it('names the origin of a real coordinate system', () => {
        expect(formatCadCrs(entry({ source: 'geodata', label: 'EPSG:2193' }))).toBe('EPSG:2193 (stored in the drawing)');
        expect(formatCadCrs(entry({ source: 'prj', label: 'EPSG:32632' }))).toBe('EPSG:32632 (from the .prj file)');
    });

    it('describes local drawings, with units', () => {
        expect(formatCadCrs(entry({ source: 'none', label: '' }))).toMatch(/^None: local drawing coordinates, units: m\./);
        expect(formatCadCrs(entry({ source: 'prj', label: 'local' }, 'mm')))
            .toBe('None: local drawing coordinates, set by the .prj file, units: mm');
    });

    it('returns null without CAD CRS information', () => {
        expect(formatCadCrs({ properties: { vector: { layers: [] } } })).toBeNull();
        expect(formatCadCrs({ properties: {} })).toBeNull();
        expect(formatCadCrs(null)).toBeNull();
    });
});

describe('tidyProperties', () => {
    it('turns the geotransform into a resolution and merges width and height', () => {
        const props = tidyProperties({ geotransform: [0, 0.126, 0, 0, 0, -0.126], width: 400, height: 300 });
        expect(props).toEqual({ resolution: '0.13 meters', Dimensions: '400 x 300' });
    });

    it('drops internal fields and upper-cases the sensor', () => {
        const props = tidyProperties({ projection: 'x', focalLength35: 24, orientation: 1, sensor: 'fc6310', make: 'DJI' });
        expect(props).toEqual({ sensor: 'FC6310', make: 'DJI' });
    });
});

describe('beautifyKey', () => {
    it('capitalises and splits camel case, and leaves non-strings alone', () => {
        expect(beautifyKey('focalLength')).toBe('Focal Length');
        expect(beautifyKey('band1')).toBe('Band 1');
        expect(beautifyKey(3)).toBe(3);
    });
});

describe('isUrl', () => {
    it('accepts absolute http and https URLs only', () => {
        expect(isUrl('https://example.com/a')).toBe(true);
        expect(isUrl('http://example.com')).toBe(true);
        expect(isUrl('ftp://example.com')).toBe(false);
        expect(isUrl('not a url')).toBe(false);
        expect(isUrl('')).toBe(false);
    });
});

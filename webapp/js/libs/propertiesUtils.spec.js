/**
 * Unit tests for libs/propertiesUtils.js.
 * Run with: npx vitest run webapp/js/libs/propertiesUtils.spec.js
 */
import { describe, it, expect } from 'vitest';
import { formatCadCrs, tidyProperties, beautifyKey, isUrl, linkCrsCodes, pointCoordinatesText, buildCopyableValues, buildAllProperties } from './propertiesUtils';

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

describe('linkCrsCodes', () => {
    it('links EPSG and ESRI codes to their epsg.io page, by the bare code', () => {
        expect(linkCrsCodes('EPSG:4326 11.2, 46.1')).toEqual([
            { text: 'EPSG:4326', href: 'https://epsg.io/4326' },
            { text: ' 11.2, 46.1' }
        ]);
        expect(linkCrsCodes('WGS84 (EPSG:4326), assumed')).toEqual([
            { text: 'WGS84 (' },
            { text: 'EPSG:4326', href: 'https://epsg.io/4326' },
            { text: '), assumed' }
        ]);
        expect(linkCrsCodes('ESRI:102100 (from the .prj file)')[0]).toEqual({ text: 'ESRI:102100', href: 'https://epsg.io/102100' });
        expect(linkCrsCodes('urn:ogc:def:crs:EPSG::32633')[1]).toEqual({ text: 'EPSG::32633', href: 'https://epsg.io/32633' });
        expect(linkCrsCodes('epsg:2056')[0].href).toBe('https://epsg.io/2056');
    });

    it('links every code in a text', () => {
        const links = linkCrsCodes('EPSG:32633 + EPSG:5773').filter(p => p.href).map(p => p.href);
        expect(links).toEqual(['https://epsg.io/32633', 'https://epsg.io/5773']);
    });

    it('leaves text without a code, other authorities and non-strings as one plain part', () => {
        expect(linkCrsCodes('DJI FC6310')).toEqual([{ text: 'DJI FC6310' }]);
        expect(linkCrsCodes('IGNF:LAMB93')).toEqual([{ text: 'IGNF:LAMB93' }]);
        expect(linkCrsCodes('NOTEPSG:4326x')).toEqual([{ text: 'NOTEPSG:4326x' }]);
        expect(linkCrsCodes('')).toEqual([{ text: '' }]);
    });
});

const pointEntry = (coordinates, extra = {}) => ({
    entry: {
        type: 3, path: 'a.jpg', hash: 'abc123', size: 10,
        point_geom: {
            crs: { type: 'name', properties: { name: 'EPSG:4326' } },
            geometry: { type: 'Point', coordinates },
            properties: {}, type: 'Feature'
        },
        ...extra
    }
});

describe('coordinates row', () => {
    it('shows the CRS and the altitude in metres, and copies the plain numbers', () => {
        const file = pointEntry([11.2, 46.1, 300.456]);
        expect(buildAllProperties(file).coordinates).toBe('EPSG:4326 11.2, 46.1, 300.46m');
        expect(pointCoordinatesText(file.entry.point_geom)).toBe('11.2, 46.1, 300.46');
    });

    it('has no altitude part for a 2D point', () => {
        const file = pointEntry([11.2, 46.1]);
        expect(buildAllProperties(file).coordinates).toBe('EPSG:4326 11.2, 46.1');
        expect(pointCoordinatesText(file.entry.point_geom)).toBe('11.2, 46.1');
    });

    it('is absent without a point geometry', () => {
        expect(pointCoordinatesText(undefined)).toBeNull();
        expect(pointCoordinatesText({ geometry: { coordinates: [] } })).toBeNull();
    });
});

describe('buildCopyableValues', () => {
    it('copies the hash from the size row and the coordinates from the coordinates row', () => {
        expect(buildCopyableValues(pointEntry([11.2, 46.1, 300]))).toEqual({
            size: { text: 'abc123', label: 'hash' },
            coordinates: { text: '11.2, 46.1, 300.00', label: 'coordinates' }
        });
    });

    it('has only what the entry has', () => {
        expect(buildCopyableValues({ entry: { type: 1, path: 'dir' } })).toEqual({});
        expect(buildCopyableValues(null)).toEqual({});
    });
});

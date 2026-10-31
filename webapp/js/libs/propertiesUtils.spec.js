/**
 * Unit tests for libs/propertiesUtils.js.
 * Run with: npx vitest run webapp/js/libs/propertiesUtils.spec.js
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { formatCadCrs, tidyProperties, formatDimensions, beautifyKey, isUrl, linkCrsCodes, pointCoordinatesText, buildCopyableValues, buildRowNotes, buildAllProperties, visibleMeta, HIDDEN_META_KEYS } from './propertiesUtils';

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
    it('turns the geotransform into a resolution in coordinate system units and merges width and height', () => {
        const props = tidyProperties({ geotransform: [0, 0.126, 0, 0, 0, -0.126], width: 400, height: 300 });
        expect(props).toEqual({ resolution: '0.126 per pixel, in coordinate system units', Dimensions: '400 x 300 ~ 0.1Mpx' });
    });

    it('keeps a ground resolution it is given and drops the geotransform', () => {
        const props = tidyProperties({ geotransform: [0, 0.126, 0, 0, 0, -0.126], resolution: '5.0 cm/px' });
        expect(props).toEqual({ resolution: '5.0 cm/px' });
    });

    it('drops internal fields and upper-cases the sensor', () => {
        const props = tidyProperties({ projection: 'x', focalLength35: 24, orientation: 1, sensor: 'fc6310', make: 'DJI' });
        expect(props).toEqual({ sensor: 'FC6310', make: 'DJI' });
    });
});

describe('formatDimensions', () => {
    it('adds the megapixels, rounded to one decimal', () => {
        expect(formatDimensions(3581, 3854)).toBe('3581 x 3854 ~ 13.8Mpx');
        expect(formatDimensions(8000, 6000)).toBe('8000 x 6000 ~ 48.0Mpx');
    });

    it('leaves the megapixels out when a side is not a positive number', () => {
        expect(formatDimensions(0, 300)).toBe('0 x 300');
        expect(formatDimensions('a', 300)).toBe('a x 300');
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

describe('resolution row', () => {
    // A 5 cm/px georaster in a projection whose unit is not the metre: the row is
    // measured on the WGS84 footprint, not read from the geotransform
    const ring = [[-91.9944, 46.8430], [-91.9932, 46.8430], [-91.9932, 46.8422], [-91.9944, 46.8422], [-91.9944, 46.8430]];
    const entry = {
        type: ddb.entry.type.GEORASTER,
        path: 'ortho.tif',
        polygon_geom: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} },
        properties: { geotransform: [0, 0.164, 0, 0, 0, -0.164], width: 1830, height: 1780 }
    };

    it('shows the ground resolution of a georaster', () => {
        const props = tidyProperties(buildAllProperties({ entry }));
        expect(props.resolution).toBe('5.0 cm/px\n91 x 89 m (8119 m²)');
        expect(props.geotransform).toBeUndefined();
    });

    it('follows the imperial units', () => {
        const props = tidyProperties(buildAllProperties({ entry }, 'imperial'));
        expect(props.resolution).toBe('2.0 in/px\n299 x 292 ft (2.01 acres)');
    });

    it('falls back to the geotransform without a footprint', () => {
        const props = tidyProperties(buildAllProperties({ entry: { ...entry, polygon_geom: undefined } }));
        expect(props.resolution).toBe('0.164 per pixel, in coordinate system units');
    });
});

describe('speed and length rows', () => {
    const entry = {
        type: ddb.entry.type.GEOIMAGE,
        path: 'DJI_0001.JPG',
        properties: { flightSpeed: 5, flightSpeedZ: -0.5, gpsXYAccuracy: 1.5, gpsZAccuracy: 3, focalLength: 4.5 }
    };

    it('shows speeds and GPS accuracies in metric units', () => {
        const props = buildAllProperties({ entry });
        expect(props.flightSpeed).toBe('18.0 km/h');
        expect(props.flightSpeedZ).toBe('-1.8 km/h');
        expect(props.gpsXYAccuracy).toBe('1.50 m');
        expect(props.focalLength).toBe(4.5);
    });

    it('shows them in imperial units', () => {
        const props = buildAllProperties({ entry }, 'imperial');
        expect(props.flightSpeed).toBe('11.2 mph');
        expect(props.gpsZAccuracy).toBe('9.84 ft');
    });
});

describe('coordinates row', () => {
    it('shows the CRS, longitude first and the altitude in metres, and copies latitude first', () => {
        const file = pointEntry([11.2, 46.1, 300.456]);
        expect(buildAllProperties(file).coordinates).toBe('EPSG:4326 11.2, 46.1, 300.46m');
        expect(pointCoordinatesText(file.entry.point_geom)).toBe('46.1, 11.2, 300.46');
    });

    it('shows the altitude in feet for imperial and still copies it in metres', () => {
        const file = pointEntry([11.2, 46.1, 300.456]);
        expect(buildAllProperties(file, 'imperial').coordinates).toBe('EPSG:4326 11.2, 46.1, 985.75ft');
        expect(buildCopyableValues(file).coordinates.text).toBe('46.1, 11.2, 300.46');
    });

    it('has no altitude part for a 2D point', () => {
        const file = pointEntry([11.2, 46.1]);
        expect(buildAllProperties(file).coordinates).toBe('EPSG:4326 11.2, 46.1');
        expect(pointCoordinatesText(file.entry.point_geom)).toBe('46.1, 11.2');
    });

    it('is absent without a point geometry', () => {
        expect(pointCoordinatesText(undefined)).toBeNull();
        expect(pointCoordinatesText({ geometry: { coordinates: [] } })).toBeNull();
    });
});

describe('buildRowNotes', () => {
    it('shows how long ago the entry was modified under the modified row', () => {
        const mtime = Math.floor(Date.now() / 1000) - 120;
        expect(buildRowNotes({ entry: { type: 2, path: 'a.txt', mtime } })).toEqual({ modified: '2 minutes ago' });
    });

    it('has no notes without a modified time', () => {
        expect(buildRowNotes({ entry: { type: 1, path: 'dir' } })).toEqual({});
        expect(buildRowNotes(null)).toEqual({});
    });
});

describe('buildCopyableValues', () => {
    it('copies the hash from the size row and latitude, longitude, altitude from the coordinates row', () => {
        expect(buildCopyableValues(pointEntry([11.2, 46.1, 300]))).toEqual({
            size: { text: 'abc123', label: 'hash' },
            coordinates: { text: '46.1, 11.2, 300.00', label: 'latitude, longitude, altitude' }
        });
        expect(buildCopyableValues(pointEntry([11.2, 46.1])).coordinates)
            .toEqual({ text: '46.1, 11.2', label: 'latitude, longitude' });
    });

    it('has only what the entry has', () => {
        expect(buildCopyableValues({ entry: { type: 1, path: 'dir' } })).toEqual({});
        expect(buildCopyableValues(null)).toEqual({});
    });
});

describe('raw metadata rows', () => {
    const file = meta => ({ entry: { type: ddb.entry.type.GENERIC, path: 'a.txt', properties: { meta } } });

    it('hides the saved comparisons but keeps the other keys', () => {
        const props = buildAllProperties(file({ name: { data: 'Site' }, comparisons: [{ id: '1', data: '{}' }] }));
        expect(props.metadata).toEqual({ name: { data: 'Site' } });
    });

    it('leaves no metadata row when only hidden keys exist', () => {
        expect(buildAllProperties(file({ comparisons: [] })).metadata).toBeUndefined();
    });

    it('visibleMeta drops every hidden key and tolerates no meta', () => {
        expect(HIDDEN_META_KEYS).toContain('comparisons');
        expect(visibleMeta({ license: 1, comparisons: 2 })).toEqual({ license: 1 });
        expect(visibleMeta(undefined)).toEqual({});
    });
});

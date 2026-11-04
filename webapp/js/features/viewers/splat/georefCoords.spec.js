import { describe, it, expect } from 'vitest';
import { COORD_MODE, createGeorefFrame, coordinateFormatter, availableModes, nextMode, modeLabel, enuToWgs84, utmDefinition, crsToWgs84 } from './georefCoords';

// Expected values below were worked out with PROJ (cs2cs / cct), not with the code under test
const BRIGHTON_OFFSET = [576705, 5188170, 0];
const UTM_15N = { georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32615', offset: BRIGHTON_OFFSET } };

describe('the frame of a projected splat', () => {
    it('adds the offset to a scene point to get the coordinates of the CRS', () => {
        const frame = createGeorefFrame(UTM_15N);
        expect(frame.kind).toBe('projected');
        expect(frame.toCrs([12.5, -3, 4])).toEqual([576717.5, 5188167, 4]);
    });

    it('takes a z offset when there is one and none otherwise', () => {
        const frame = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32615', offset: [1, 2] } });
        expect(frame.toCrs([0, 0, 5])).toEqual([1, 2, 5]);
        const withZ = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32615', offset: [1, 2, 100] } });
        expect(withZ.toCrs([0, 0, 5])).toEqual([1, 2, 105]);
    });

    it('turns the offset itself into the longitude and latitude PROJ gives for it (UTM 15N)', () => {
        const [lon, lat, height] = createGeorefFrame(UTM_15N).toWgs84([0, 0, 7]);
        expect(lon).toBeCloseTo(-91.994009513, 6);
        expect(lat).toBeCloseTo(46.842651237, 6);
        expect(height).toBe(7);
    });

    it('turns a point 100 m east and north of the offset into the longitude and latitude PROJ gives', () => {
        const [lon, lat] = createGeorefFrame(UTM_15N).toWgs84([100, 100, 0]);
        expect(lon).toBeCloseTo(-91.992681396, 6);
        expect(lat).toBeCloseTo(46.843539466, 6);
    });

    it('knows the southern zones (EPSG:327xx) and the form ODM writes', () => {
        // UTM 33S, 500000 E 4000000 N: on the central meridian, 54.148104104 S
        const south = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32733', offset: [500000, 4000000] } });
        const [lon, lat] = south.toWgs84([0, 0, 0]);
        expect(lon).toBeCloseTo(15, 6);
        expect(lat).toBeCloseTo(-54.148104104, 6);

        const odm = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'WGS84 UTM 15N', offset: BRIGHTON_OFFSET } });
        expect(odm.toWgs84([0, 0, 0])[0]).toBeCloseTo(-91.994009513, 6);
        const odmSouth = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'WGS84 UTM 33S', offset: [500000, 4000000] } });
        expect(odmSouth.toWgs84([0, 0, 0])[1]).toBeCloseTo(-54.148104104, 6);
    });

    it('works from a proj string', () => {
        const frame = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: '+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs', offset: BRIGHTON_OFFSET } });
        expect(frame.toWgs84([0, 0, 0])[1]).toBeCloseTo(46.842651237, 6);
    });

    it('has no WGS84 for an EPSG code it has no definition of, and still gives the CRS coordinates', () => {
        const frame = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:2056', offset: [2600000, 1200000, 0] } });
        expect(frame.toWgs84).toBeNull();
        expect(frame.toCrs([1, 2, 3])).toEqual([2600001, 1200002, 3]);
        expect(availableModes(frame)).toEqual([COORD_MODE.CRS]);
        expect(crsToWgs84('EPSG:2056')).toBeNull();
    });
});

describe('the frame of an ENU splat', () => {
    // PROJ: cct +proj=pipeline +step +inv +proj=topocentric +ellps=WGS84 +lat_0=43.5 +lon_0=11.25 +h_0=120 +step +inv +proj=cart +ellps=WGS84
    it('converts around the origin the way PROJ does', () => {
        const [lon, lat, height] = enuToWgs84([43.5, 11.25, 120])([100, 200, 30]);
        expect(lon).toBeCloseTo(11.251236458, 8);
        expect(lat).toBeCloseTo(43.50180009, 8);
        expect(height).toBeCloseTo(150.003924427, 5);
    });

    it('converts in the southern and eastern hemisphere and a few kilometres away', () => {
        const [lon, lat, height] = enuToWgs84([-33.9, 151.2, 5])([-3000, 5000, -10]);
        expect(lon).toBeCloseTo(151.167582116, 8);
        expect(lat).toBeCloseTo(-33.854918249, 8);
        expect(height).toBeCloseTo(-2.328323641, 5);
    });

    it('gives the origin for the point at zero', () => {
        const [lon, lat, height] = enuToWgs84([10, 20, 30])([0, 0, 0]);
        expect(lon).toBeCloseTo(20, 9);
        expect(lat).toBeCloseTo(10, 9);
        expect(height).toBeCloseTo(30, 6);
    });

    it('moves a degree of longitude per 111319.49 m east at the equator (a * pi / 180)', () => {
        const [lon, lat] = enuToWgs84([0, 0, 0])([1000, 0, 0]);
        expect(lon).toBeCloseTo(1000 / 111319.4908, 8);
        expect(lat).toBeCloseTo(0, 4);
    });

    it('has the CRS coordinates of the scene as they are and always a WGS84', () => {
        const frame = createGeorefFrame({ georeferenced: true, georef: { kind: 'enu', origin: [43.5, 11.25, 120] } });
        expect(frame.toCrs([1, 2, 3])).toEqual([1, 2, 3]);
        expect(availableModes(frame)).toEqual([COORD_MODE.CRS, COORD_MODE.WGS84]);
    });
});

describe('createGeorefFrame', () => {
    it.each([
        ['a splat that is not georeferenced', { georeferenced: false, georef: { kind: 'enu', origin: [1, 2, 3] } }],
        ['no properties', undefined],
        ['no georef', { georeferenced: true }],
        ['an unknown kind', { georeferenced: true, georef: { kind: 'mars' } }],
        ['an origin out of range', { georeferenced: true, georef: { kind: 'enu', origin: [95, 20, 0] } }],
        ['an offset that is not numbers', { georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:32615', offset: ['a', 'b'] } }],
        ['no crs', { georeferenced: true, georef: { kind: 'projected', offset: [1, 2] } }]
    ])('is null for %s', (_name, properties) => {
        expect(createGeorefFrame(properties)).toBeNull();
    });
});

describe('utmDefinition', () => {
    it('reads the zone and the hemisphere, and nothing else', () => {
        expect(utmDefinition('EPSG:32615')).toBe('+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs');
        expect(utmDefinition('epsg:32760')).toContain('+zone=60 +south');
        expect(utmDefinition('WGS84 UTM 7N')).toContain('+zone=7 ');
        expect(utmDefinition('EPSG:32661')).toBeNull();
        expect(utmDefinition('EPSG:32600')).toBeNull();
        expect(utmDefinition('EPSG:4326')).toBeNull();
    });
});

describe('coordinateFormatter', () => {
    const projected = createGeorefFrame(UTM_15N);
    const enu = createGeorefFrame({ georeferenced: true, georef: { kind: 'enu', origin: [43.5, 11.25, 120] } });

    it('writes the CRS coordinates of a projected splat', () => {
        expect(coordinateFormatter(projected, COORD_MODE.CRS)([0.5, 1.25, 2])).toBe('576705.50, 5188171.25, 2.00 m');
    });

    it('writes a local frame as east, north and up', () => {
        expect(coordinateFormatter(enu, COORD_MODE.CRS)([1, 2, 3])).toBe('E 1.00, N 2.00, U 3.00 m');
    });

    it('writes WGS84 as latitude, longitude and height', () => {
        expect(coordinateFormatter(projected, COORD_MODE.WGS84)([0, 0, 7])).toBe('46.842651°, -91.994010°, 7.00 m');
    });

    it('falls back to the CRS for a frame that has no WGS84', () => {
        const frame = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:2056', offset: [1, 2, 0] } });
        expect(coordinateFormatter(frame, COORD_MODE.WGS84)([1, 1, 1])).toBe('2.00, 3.00, 1.00 m');
    });
});

describe('the modes of a frame', () => {
    const projected = createGeorefFrame(UTM_15N);
    const noWgs84 = createGeorefFrame({ georeferenced: true, georef: { kind: 'projected', crs: 'EPSG:2056', offset: [1, 2, 0] } });

    it('go round between the CRS and WGS84', () => {
        expect(nextMode(projected, COORD_MODE.CRS)).toBe(COORD_MODE.WGS84);
        expect(nextMode(projected, COORD_MODE.WGS84)).toBe(COORD_MODE.CRS);
    });

    it('stay on the CRS when that is all the frame can show', () => {
        expect(nextMode(noWgs84, COORD_MODE.CRS)).toBe(COORD_MODE.CRS);
        expect(nextMode(noWgs84, COORD_MODE.WGS84)).toBe(COORD_MODE.CRS);
    });

    it('are named by the CRS of the frame and by WGS84', () => {
        expect(modeLabel(projected, COORD_MODE.CRS)).toBe('EPSG:32615');
        expect(modeLabel(projected, COORD_MODE.WGS84)).toBe('WGS84');
        expect(modeLabel(createGeorefFrame({ georeferenced: true, georef: { kind: 'enu', origin: [1, 2, 3] } }), COORD_MODE.CRS)).toBe('Local east-north-up');
    });
});

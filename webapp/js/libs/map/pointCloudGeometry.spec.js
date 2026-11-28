/**
 * Whether two coordinate systems of a point cloud are the same one: by meaning, not by text (WKT 1 and WKT 2 of a CRS,
 * an EPSG code and its WKT are the same; another CRS is not, wherever the sample point lies).
 */
import { describe, it, expect } from 'vitest';
import { sameCrs, projectorFor } from './pointCloudGeometry';
import { WGS84_WKT, GEOCENTRIC_WKT, UTM_33N_WKT, UTM_33N_WKT2, COMPOUND_WKT, COMPOUND_WKT2, CUSTOM_TM_WKT } from './crs.fixtures';

// A point of the cloud in UTM 33N (13.84 E, 46.68 N)
const IN_UTM = [411295.168, 5170271.646, 600.5];

describe('sameCrs', () => {
    it('is true for the same text, and for the same CRS written as WKT 1, WKT 2 or its EPSG code', () => {
        expect(sameCrs(UTM_33N_WKT, UTM_33N_WKT, null)).toBe(true);
        expect(sameCrs(UTM_33N_WKT, UTM_33N_WKT2, IN_UTM)).toBe(true);
        expect(sameCrs(UTM_33N_WKT2, 'EPSG:32633', IN_UTM)).toBe(true);
        expect(sameCrs(COMPOUND_WKT, COMPOUND_WKT2, [342000, 3045000, 12.5])).toBe(true);
    });

    it('reads the SRS of a coordinate system', () => {
        expect(sameCrs({ srs: UTM_33N_WKT, scale: [1, 1, 1] }, { srs: UTM_33N_WKT2 }, IN_UTM)).toBe(true);
    });

    it('is false for another CRS: longitude and latitude, another zone, a custom transverse Mercator, geocentric', () => {
        expect(sameCrs(WGS84_WKT, UTM_33N_WKT, [13.84, 46.68, 600])).toBe(false);
        expect(sameCrs(UTM_33N_WKT, 'EPSG:32632', IN_UTM)).toBe(false);
        expect(sameCrs(UTM_33N_WKT, CUSTOM_TM_WKT, IN_UTM)).toBe(false);
        expect(sameCrs(GEOCENTRIC_WKT, UTM_33N_WKT, [4256756.97, 1048721.13, 4617877.37])).toBe(false);
    });

    it('without a sample, or with a CRS proj4 cannot use, only the same text is the same CRS', () => {
        expect(sameCrs(UTM_33N_WKT, UTM_33N_WKT2, null)).toBe(false);
        expect(sameCrs('EPSG:2056', 'EPSG:2056', IN_UTM)).toBe(true);
        expect(sameCrs('EPSG:2056', UTM_33N_WKT, IN_UTM)).toBe(false);
    });

    it('no CRS is the same as no CRS only', () => {
        expect(sameCrs(null, { srs: null }, IN_UTM)).toBe(true);
        expect(sameCrs(null, UTM_33N_WKT, IN_UTM)).toBe(false);
        expect(sameCrs(UTM_33N_WKT, '', IN_UTM)).toBe(false);
    });
});

describe('projectorFor a compound or geocentric CRS', () => {
    it('can reproject both (the horizontal CRS of a compound one; a geocentric one in 3-D)', () => {
        expect(projectorFor(COMPOUND_WKT).usable).toBe(true);
        const [lon, lat, height] = projectorFor(GEOCENTRIC_WKT).toGeographic([4256756.969533, 1048721.126765, 4617877.373960]);
        expect(Math.abs(lon - 13.8401234)).toBeLessThan(1e-8);
        expect(Math.abs(lat - 46.6801234)).toBeLessThan(1e-8);
        expect(height).toBeCloseTo(600.5, 3);
    });
});

describe('projectorFor a local CRS', () => {
    it('is not usable and leaves the positions as they are (not read as radians)', () => {
        const projector = projectorFor('LOCAL_CS["Local",UNIT["metre",1]]');
        expect(projector.usable).toBe(false);
        expect(projector.definition).toBeNull();
        expect(projector.toGeographic([1000, 2000, 3])).toEqual([1000, 2000, 3]);
    });
});

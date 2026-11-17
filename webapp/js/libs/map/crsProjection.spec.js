/**
 * The coordinate systems of point clouds through proj4: the horizontal part of a compound CRS, a geocentric CRS
 * in 3-D, and the unit of length of a CRS. Expected positions are literals from GDAL 3.12 / PROJ
 * (`gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32633`, `cs2cs EPSG:4979 EPSG:4978`), not computed by the code.
 */
import { describe, it, expect } from 'vitest';
import { horizontalDefinition, crsToWgs84, wgs84ToCrs, linearUnitOf, LINEAR_UNITS } from './crsProjection';
import {
    WGS84_WKT, GEOCENTRIC_WKT, UTM_33N_WKT, UTM_33N_WKT2, COMPOUND_WKT, COMPOUND_WKT2, FOOT_WKT, US_FOOT_WKT, US_FOOT_WKT2,
    US_FOOT_COMPOUND_WKT, CUSTOM_TM_WKT
} from './crs.fixtures';

// echo "13.8401234 46.6801234 600.5" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32633
const UTM = [411295.168136401, 5170271.64613447];
// echo "46.6801234 13.8401234 600.5" | cs2cs -f %.6f EPSG:4979 EPSG:4978
const ECEF = [4256756.969533, 1048721.126765, 4617877.373960];
const GEO = [13.8401234, 46.6801234, 600.5];

describe('horizontalDefinition', () => {
    it('is the projected CRS of a compound CRS, in WKT 1 and in WKT 2', () => {
        expect(horizontalDefinition(COMPOUND_WKT)).toMatch(/^PROJCS\["NAD83\(2011\) \/ UTM zone 17N"/);
        expect(horizontalDefinition(COMPOUND_WKT)).not.toContain('VERT_CS');
        expect(horizontalDefinition(COMPOUND_WKT2)).toMatch(/^PROJCRS\["NAD83\(2011\) \/ UTM zone 17N"/);
        expect(horizontalDefinition(COMPOUND_WKT2)).not.toContain('VERTCRS');
    });

    it('is a geocentric proj string for a geocentric CRS, the UTM definition of a code, and the text of anything else', () => {
        expect(horizontalDefinition(GEOCENTRIC_WKT)).toMatch(/^\+proj=geocent \+a=6378137 \+rf=298.257223563/);
        expect(horizontalDefinition('EPSG:4978')).toContain('+proj=geocent');
        expect(horizontalDefinition('EPSG:32633')).toBe('+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');
        expect(horizontalDefinition(UTM_33N_WKT)).toBe(UTM_33N_WKT);
        expect(horizontalDefinition('+proj=tmerc +lon_0=9')).toBe('+proj=tmerc +lon_0=9');
    });

    it('is null for a compound CRS with no horizontal part', () => {
        expect(horizontalDefinition('COMPD_CS["only heights",VERT_CS["NAVD88 height",VERT_DATUM["x",2005],UNIT["metre",1]]]')).toBeNull();
    });
});

describe('crsToWgs84 and wgs84ToCrs', () => {
    it('reproject the x and y of a compound CRS through its horizontal CRS, and keep its heights', () => {
        // NAD83(2011) / UTM 17N, near Tampa: echo "342000 3045000 12.5" | gdaltransform -s_srs EPSG:6346 -t_srs EPSG:6318
        const toWgs84 = crsToWgs84(COMPOUND_WKT);
        expect(toWgs84).not.toBeNull();
        const [lon, lat, z] = toWgs84(342000, 3045000, 12.5);
        expect(Math.abs(lon - -82.5997962718674)).toBeLessThan(1e-8);
        expect(Math.abs(lat - 27.5195347646543)).toBeLessThan(1e-8);
        expect(z).toBe(12.5);
        const back = wgs84ToCrs(COMPOUND_WKT2)(lon, lat, z);
        expect(back[0]).toBeCloseTo(342000, 3);
        expect(back[1]).toBeCloseTo(3045000, 3);
    });

    it('go from WGS84 to UTM within 1 mm of GDAL, the height unchanged', () => {
        const [x, y, z] = wgs84ToCrs(UTM_33N_WKT)(...GEO);
        expect(Math.abs(x - UTM[0])).toBeLessThan(0.001);
        expect(Math.abs(y - UTM[1])).toBeLessThan(0.001);
        expect(z).toBe(600.5);
    });

    it('transform a geocentric CRS in 3-D: z is the height above the ellipsoid', () => {
        const [lon, lat, height] = crsToWgs84(GEOCENTRIC_WKT)(...ECEF);
        expect(Math.abs(lon - GEO[0])).toBeLessThan(1e-8);
        expect(Math.abs(lat - GEO[1])).toBeLessThan(1e-8);
        expect(height).toBeCloseTo(GEO[2], 3);
        const xyz = wgs84ToCrs('EPSG:4978')(...GEO);
        xyz.forEach((v, i) => expect(Math.abs(v - ECEF[i])).toBeLessThan(0.001));
    });

    it('are null for a CRS proj4 cannot use', () => {
        expect(crsToWgs84('EPSG:2056')).toBeNull();
        expect(wgs84ToCrs('not a crs')).toBeNull();
    });
});

describe('linearUnitOf', () => {
    it('reads metres, feet and US survey feet from WKT 1, WKT 2, a compound CRS and a proj string', () => {
        expect(linearUnitOf(UTM_33N_WKT)).toBe(LINEAR_UNITS.METRE);
        expect(linearUnitOf(UTM_33N_WKT2)).toBe(LINEAR_UNITS.METRE);
        expect(linearUnitOf(CUSTOM_TM_WKT)).toBe(LINEAR_UNITS.METRE);
        expect(linearUnitOf(FOOT_WKT)).toBe(LINEAR_UNITS.FOOT);
        expect(linearUnitOf(US_FOOT_WKT)).toBe(LINEAR_UNITS.US_FOOT);
        expect(linearUnitOf(US_FOOT_WKT2)).toBe(LINEAR_UNITS.US_FOOT);
        expect(linearUnitOf(US_FOOT_COMPOUND_WKT)).toBe(LINEAR_UNITS.US_FOOT);
        expect(linearUnitOf('+proj=utm +zone=17 +datum=NAD83 +units=us-ft')).toBe(LINEAR_UNITS.US_FOOT);
        expect(linearUnitOf('+proj=tmerc +lon_0=9 +units=ft')).toBe(LINEAR_UNITS.FOOT);
    });

    it('labels both feet "ft" and tells them apart by their factor and code', () => {
        expect(LINEAR_UNITS.FOOT.symbol).toBe('ft');
        expect(LINEAR_UNITS.US_FOOT.symbol).toBe('ft');
        expect(LINEAR_UNITS.US_FOOT.code).toBe('ftUS');
        expect(LINEAR_UNITS.US_FOOT.metresPerUnit).toBeCloseTo(0.3048006096, 10);
    });

    it('keeps another unit a CRS names, with its factor', () => {
        const unit = linearUnitOf('+proj=tmerc +lon_0=9 +to_meter=0.201168');
        expect(unit.metresPerUnit).toBe(0.201168);
    });

    it('is metres with no CRS, a CRS proj4 does not know, a geographic and a geocentric CRS', () => {
        for (const crs of [null, undefined, '', 'EPSG:2056', WGS84_WKT, GEOCENTRIC_WKT, 'not a crs']) {
            expect(linearUnitOf(crs)).toBe(LINEAR_UNITS.METRE);
        }
    });
});

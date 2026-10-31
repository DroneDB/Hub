/**
 * Raster Analysis shows metres only for an elevation model, a raster's own unit otherwise, and no
 * unit for raw values.
 */
import { describe, it, expect } from 'vitest';
import { isElevationRaster, rasterValueUnit } from './rasterUnit';

// As libddb's raster value info answers them
const DSM = { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '' };
// odx/hat-creek: an airborne thermal mosaic of raw digital numbers, with an alpha band
const THERMAL_MOSAIC = { bandCount: 2, dataType: 'UInt16', isThermal: false, unit: '' };

describe('isElevationRaster', () => {
    it('is one band of floating point or signed integer samples', () => {
        expect(isElevationRaster(DSM)).toBe(true);
        for (const dataType of ['Float64', 'Int16', 'Int32']) expect(isElevationRaster({ ...DSM, dataType })).toBe(true);
    });

    it('is not a raster of unsigned samples, of more bands, a thermal one or one not known', () => {
        expect(isElevationRaster(THERMAL_MOSAIC)).toBe(false);
        expect(isElevationRaster({ ...THERMAL_MOSAIC, bandCount: 1 })).toBe(false);
        expect(isElevationRaster({ ...DSM, bandCount: 3 })).toBe(false);
        expect(isElevationRaster({ ...DSM, isThermal: true })).toBe(false);
        expect(isElevationRaster({ unit: '' })).toBe(false);
        expect(isElevationRaster(null)).toBe(false);
    });
});

describe('rasterValueUnit', () => {
    it('is metres for an elevation model without a unit, and its own unit when it has one', () => {
        expect(rasterValueUnit(DSM)).toBe('m');
        expect(rasterValueUnit({ ...DSM, unit: 'ft' })).toBe('ft');
    });

    it('is none for raw values, and the own unit of any other raster', () => {
        expect(rasterValueUnit(THERMAL_MOSAIC)).toBe('');
        expect(rasterValueUnit({ ...THERMAL_MOSAIC, unit: 'W/m²' })).toBe('W/m²');
        expect(rasterValueUnit(null)).toBe('');
    });
});

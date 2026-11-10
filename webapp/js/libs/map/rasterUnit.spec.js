/**
 * Raster Analysis shows metres only for an elevation model, a raster's own unit otherwise, and no
 * unit for raw values.
 */
import { describe, it, expect } from 'vitest';
import { isElevationRaster, rasterValueUnit, rasterValueParts, rasterUnitSymbol } from './rasterUnit';

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

// FR-RAS-28: one format of a raster value, {value, unit, text}; it does not convert (D-022)
describe('rasterValueParts', () => {
    it('writes a temperature with one decimal and the normalised symbol after a space', () => {
        expect(rasterValueParts(29.06, 'Celsius')).toEqual({ value: 29.1, unit: '°C', text: '29.1 °C' });
        expect(rasterValueParts(29, 'C').text).toBe('29.0 °C');
        expect(rasterValueParts(293.15, 'K').text).toBe('293.2 K');
        expect(rasterValueParts(293.15, 'kelvin')).toMatchObject({ value: 293.2, unit: 'K' });
        expect(rasterValueParts(84.2, 'Fahrenheit').text).toBe('84.2 °F');
        expect(rasterValueParts(-0.04, '°C').text).toBe('0.0 °C');
    });

    it('does not convert: the value is the number it was given', () => {
        expect(rasterValueParts(20, 'K').text).toBe('20.0 K');
        expect(rasterValueParts(20, '°F').text).toBe('20.0 °F');
    });

    it('writes an elevation with two decimals and any other value with up to three', () => {
        expect(rasterValueParts(216, 'm').text).toBe('216.00 m');
        expect(rasterValueParts(-6.3, 'ft').text).toBe('-6.30 ft');
        expect(rasterValueParts(0.12345, 'NDVI')).toEqual({ value: 0.123, unit: 'NDVI', text: '0.123 NDVI' });
        expect(rasterValueParts(145, '').text).toBe('145');
        expect(rasterValueParts(145, null)).toEqual({ value: 145, unit: '', text: '145' });
        expect(rasterValueParts(12.5, 'W/m²').text).toBe('12.5 W/m²');
    });

    it('takes the decimals that were asked for', () => {
        expect(rasterValueParts(1.23456, 'm', { digits: 4 }).text).toBe('1.2346 m');
    });

    it('is the placeholder without a number, and keeps values that are already text', () => {
        expect(rasterValueParts(null, '°C')).toEqual({ value: null, unit: '', text: '–' });
        expect(rasterValueParts(NaN, '°C', { placeholder: 'n/d' }).text).toBe('n/d');
        expect(rasterValueParts('1, 2, 3', 'm').text).toBe('1, 2, 3 m');
    });
});

describe('rasterUnitSymbol', () => {
    it('writes a temperature unit as its symbol, and any other as it is', () => {
        expect(['Celsius', 'celsius', 'C', 'degC', ' °C '].map(rasterUnitSymbol)).toEqual(['°C', '°C', '°C', '°C', '°C']);
        expect(['Kelvin', 'k', 'K'].map(rasterUnitSymbol)).toEqual(['K', 'K', 'K']);
        expect(['Fahrenheit', 'F', '°F'].map(rasterUnitSymbol)).toEqual(['°F', '°F', '°F']);
        expect(rasterUnitSymbol('m')).toBe('m');
        expect(rasterUnitSymbol(undefined)).toBe('');
    });
});

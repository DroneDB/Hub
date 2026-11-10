/**
 * The default style of a raster (FR-XC-24, FR-RAS-24, D-041): the stretch is the one of the value info (ddb's), the colour
 * map follows the kind of raster. The expected texts are written out, not computed.
 */
import { describe, it, expect } from 'vitest';
import { defaultVizParams, defaultRescale, hasDefaultRamp, layerStyleOf } from './defaultVizParams';

// LisbonElevation.tif: negative heights, no NoData value (FR-RAS-01)
const LISBON = { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', valueMin: -6.3, valueMax: 216, stretch: [{ min: -6.3, max: 216 }] };

describe('defaultVizParams', () => {
    it('is viridis stretched to the stretch of the value info, in metres, for a DEM', () => {
        expect(defaultVizParams(LISBON)).toEqual({ colormap: 'viridis', rescale: '-6.3,216', unit: 'm' });
    });

    it('is ironbow in Celsius, with the formula, for a calibrated thermal raster', () => {
        const info = { isThermal: true, calibration: { r1: 1 }, unit: '', stretch: [{ min: 12.76, max: 35.27 }] };
        expect(defaultVizParams(info)).toEqual({ formula: 'CELSIUS', colormap: 'ironbow', rescale: '12.76,35.27', unit: '°C' });
    });

    // D-022: the default unit is the band unit
    it('opens a Kelvin raster in K, with the formula of the unit of its band', () => {
        const info = { isThermal: true, isDirectValue: true, unit: 'K', stretch: [{ min: 280.1, max: 308.4 }] };
        expect(defaultVizParams(info)).toEqual({ formula: 'KELVIN', colormap: 'ironbow', rescale: '280.1,308.4', unit: 'K' });
    });

    it('opens a raster in degrees Celsius or Fahrenheit in that unit', () => {
        expect(defaultVizParams({ isThermal: true, isDirectValue: true, unit: 'Celsius', stretch: [{ min: 1, max: 2 }] }))
            .toMatchObject({ formula: 'CELSIUS', unit: '°C' });
        expect(defaultVizParams({ isThermal: true, isDirectValue: true, unit: 'degF', stretch: [{ min: 1, max: 2 }] }))
            .toMatchObject({ formula: 'FAHRENHEIT', unit: '°F' });
    });

    it('has no formula and no unit for a thermal raster of raw counts, which are no temperatures', () => {
        const raw = defaultVizParams({ isThermal: true, isDirectValue: false, unit: '°C', stretch: [{ min: 14000, max: 16000 }] });
        expect(raw).toEqual({ colormap: 'ironbow', rescale: '14000,16000', unit: '' });
    });

    it('has no formula for a thermal raster whose unit is not known', () => {
        expect(defaultVizParams({ isThermal: true, stretch: [{ min: 1, max: 2 }] }).formula).toBeUndefined();
    });

    it('is rdylgn for a vegetation index', () => {
        const params = defaultVizParams({ stretch: [{ min: -0.272, max: 0.644 }] }, { index: true });
        expect(params).toMatchObject({ colormap: 'rdylgn', rescale: '-0.272,0.644' });
    });

    it('is the own unit of the raster, and none for raw values', () => {
        expect(defaultVizParams({ ...LISBON, unit: 'ft' }).unit).toBe('ft');
        expect(defaultVizParams({ bandCount: 2, dataType: 'UInt16', unit: '', stretch: [{ min: 145, max: 402 }] }).unit).toBe('');
    });

    it('keeps the stretch limits as the server gave them, without float noise or an exponent', () => {
        expect(defaultRescale({ stretch: [{ min: -6.300000001, max: 216.0000004 }] })).toBe('-6.3,216');
        expect(defaultRescale({ stretch: [{ min: 1e-9, max: 0.5 }] })).toBe('0,0.5');
        expect(defaultRescale({ stretch: [{ min: 12345.678, max: 99999.9 }] })).toBe('12345.68,99999.9');
    });

    it('has no rescale for several bands (each is stretched by the tiles), a Byte raster, or no info', () => {
        expect(defaultRescale({ stretch: [{ min: 0, max: 1 }, { min: 0, max: 2 }] })).toBe('');
        expect(defaultRescale({ stretch: [], valueMin: 0, valueMax: 255 })).toBe('');
        expect(defaultRescale(null)).toBe('');
        expect(defaultVizParams(null)).toEqual({ colormap: 'viridis', rescale: '', unit: '' });
    });

    it('falls back to the range of the values when the value info has no stretch', () => {
        expect(defaultRescale({ valueMin: 194.7, valueMax: 229.5 })).toBe('194.7,229.5');
    });
});

describe('hasDefaultRamp and layerStyleOf', () => {
    it('a ramp is for a thermal raster and for values, not for a Byte image', () => {
        expect(hasDefaultRamp(LISBON)).toBe(true);
        expect(hasDefaultRamp({ isThermal: true, dataType: 'Byte' })).toBe(true);
        expect(hasDefaultRamp({ dataType: 'Byte' })).toBe(false);
        expect(hasDefaultRamp(null)).toBe(false);
    });

    it('the style of a layer has no Unit, which is a field of the panel only', () => {
        expect(layerStyleOf(defaultVizParams(LISBON))).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
        expect(layerStyleOf({ colormap: 'viridis', rescale: '', unit: 'm' })).toEqual({ colormap: 'viridis' });
    });
});

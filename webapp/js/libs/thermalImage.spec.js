/**
 * The thermal mode of the image viewer (U-603: FR-RAS-15, FR-XC-24, FR-XC-32). The pixel of the raw thermal grid under the
 * pointer comes from the box the picture is drawn in, at any size of the bitmap on show; the values are written by the one
 * raster value formatter in the unit the server answered. The expected numbers are literals.
 */
import { describe, it, expect } from 'vitest';
import { gridPixelAt, isRadiometric, isThermalEntry, thermalFields, thermalLegendStyle, thermalPalettes, thermalRangeText,
    thermalReadout, uncalibratedThermalNotice } from './thermalImage';

const GRID = { width: 640, height: 512 };

describe('gridPixelAt: the pointer on the drawn picture to the raw thermal grid', () => {
    it('maps the pointer of a picture drawn at 960 x 768 (1.5 css pixels per grid pixel)', () => {
        const box = { left: 100, top: 50, width: 960, height: 768 };
        expect(gridPixelAt({ x: 100, y: 50 }, box, GRID)).toEqual({ x: 0, y: 0 });
        // the centre of the picture is the pixel (320, 256)
        expect(gridPixelAt({ x: 580, y: 434 }, box, GRID)).toEqual({ x: 320, y: 256 });
        // 100 + 959 is the last css pixel of the box: the last pixel of the grid
        expect(gridPixelAt({ x: 1059, y: 817 }, box, GRID)).toEqual({ x: 639, y: 511 });
        // 1.5 css pixels per grid pixel: 100 + 3 is the pixel 2
        expect(gridPixelAt({ x: 103, y: 50 }, box, GRID)).toEqual({ x: 2, y: 0 });
    });

    it('maps the pointer of the same picture drawn at 320 x 256 (half a grid pixel per css pixel) to the same pixels', () => {
        const box = { left: 10, top: 20, width: 320, height: 256 };
        expect(gridPixelAt({ x: 10, y: 20 }, box, GRID)).toEqual({ x: 0, y: 0 });
        expect(gridPixelAt({ x: 170, y: 148 }, box, GRID)).toEqual({ x: 320, y: 256 });
        // one css pixel is two grid pixels
        expect(gridPixelAt({ x: 11, y: 21 }, box, GRID)).toEqual({ x: 2, y: 2 });
        expect(gridPixelAt({ x: 329, y: 275 }, box, GRID)).toEqual({ x: 638, y: 510 });
    });

    it('follows the box of a zoomed picture, which is larger than the stage', () => {
        // zoomed to 4x and panned: the box starts left of the page
        const box = { left: -1000, top: -400, width: 2560, height: 2048 };
        expect(gridPixelAt({ x: 280, y: 624 }, box, GRID)).toEqual({ x: 320, y: 256 });
    });

    it('is nothing outside the picture, and nothing for an empty box or grid', () => {
        const box = { left: 100, top: 50, width: 960, height: 768 };
        expect(gridPixelAt({ x: 99, y: 100 }, box, GRID)).toBeNull();
        expect(gridPixelAt({ x: 1060, y: 100 }, box, GRID)).toBeNull();
        expect(gridPixelAt({ x: 200, y: 49 }, box, GRID)).toBeNull();
        expect(gridPixelAt({ x: 200, y: 818 }, box, GRID)).toBeNull();
        expect(gridPixelAt({ x: 200, y: 100 }, { left: 0, top: 0, width: 0, height: 0 }, GRID)).toBeNull();
        expect(gridPixelAt({ x: 200, y: 100 }, box, { width: 0, height: 0 })).toBeNull();
    });

    it('uses the grid, not the size of the picture: a 1280 x 1024 picture of a 640 x 512 grid', () => {
        const box = { left: 0, top: 0, width: 1280, height: 1024 };
        expect(gridPixelAt({ x: 641, y: 513 }, box, GRID)).toEqual({ x: 320, y: 256 });
    });
});

describe('the radiometric picture', () => {
    const info = { width: 640, height: 512, valueMin: -5.4784, valueMax: 36.5976, unit: '°C', isThermal: true, isDirectValue: false,
        calibration: { emissivity: 0.95, objectDistance: 5 } };

    it('is a thermal entry with a raw thermal grid, a range and a unit', () => {
        expect(isThermalEntry({ properties: { sensorCategory: 'thermal' } })).toBe(true);
        expect(isThermalEntry({ properties: { sensorCategory: 'multispectral' } })).toBe(false);
        expect(isThermalEntry({ properties: {} })).toBe(false);
        expect(isThermalEntry(null)).toBe(false);
        expect(isRadiometric(info)).toBe(true);
    });

    it('is not radiometric when ddb read only the colour preview: no unit and no calibration (FR-RAS-14)', () => {
        expect(isRadiometric({ ...info, unit: '', calibration: undefined })).toBe(false);
        // the raw counts of a DJI R-JPEG: no unit, no calibration (they need DJI's own conversion)
        expect(isRadiometric({ width: 640, height: 512, valueMin: 13537, valueMax: 20670, unit: '', isThermal: true,
            isDirectValue: false })).toBe(false);
        expect(isRadiometric({ ...info, valueMin: undefined })).toBe(false);
        expect(isRadiometric({ ...info, width: 0 })).toBe(false);
        expect(isRadiometric(null)).toBe(false);
    });

    it('writes the range and the readout with the one raster value formatter', () => {
        expect(thermalRangeText(info)).toBe('-5.5 °C to 36.6 °C');
        expect(thermalRangeText({ ...info, unit: 'K', valueMin: 267.6716, valueMax: 309.7476 })).toBe('267.7 K to 309.7 K');
        expect(thermalRangeText(null)).toBe('');
        expect(thermalReadout({ value: 25.1017, unit: '°C' })).toEqual({ value: 25.1, unit: '°C', text: '25.1 °C' });
        expect(thermalReadout({ value: 298.2517, unit: 'K' }).text).toBe('298.3 K');
        expect(thermalReadout({ value: 77.1831 }, '°F').text).toBe('77.2 °F');
        expect(thermalReadout(null).text).toBe('–');
    });

    it('draws the legend of a palette over the range in the unit of the formula, none as shot', () => {
        expect(thermalLegendStyle('ironbow', info, 'CELSIUS')).toEqual({ colormap: 'ironbow', rescale: '-5.4784,36.5976', formula: 'CELSIUS' });
        expect(thermalLegendStyle('', info, 'CELSIUS')).toBeNull();
        expect(thermalLegendStyle('ironbow', { ...info, valueMax: info.valueMin }, 'CELSIUS')).toBeNull();
        expect(thermalLegendStyle('ironbow', null, 'CELSIUS')).toBeNull();
    });

    it('offers the picture as shot and the thermal colormaps, with their swatches', () => {
        const palettes = thermalPalettes();
        expect(palettes.map(p => p.id)).toEqual(['', 'ironbow', 'whitehot', 'blackhot', 'arctic', 'lava', 'inferno', 'magma', 'plasma']);
        expect(palettes[0].name).toBe('As shot');
        expect(palettes[1].colors[0]).toBe('#000000');
    });

    it('lists the thermal fields for the details panel: sensor, range, emissivity, distance and the conditions', () => {
        const entry = { properties: { make: 'FLIR Systems AB', model: 'FLIR Vue Pro R' } };
        const full = { ...info, calibration: { emissivity: 0.95, objectDistance: 5, reflectedApparentTemperature: 20,
            atmosphericTemperature: 25, relativeHumidity: 50 } };
        expect(thermalFields(entry, full)).toEqual({
            sensor: 'FLIR Systems AB FLIR Vue Pro R',
            range: '-5.5 °C to 36.6 °C',
            emissivity: '0.95',
            'object distance': '5.0 m',
            'reflected temperature': '20.0 °C',
            'atmospheric temperature': '25.0 °C',
            'relative humidity': '50 %'
        });
        expect(thermalFields(entry, full, 'imperial')['object distance']).toBe('16.4 ft');
        expect(thermalFields({ properties: {} }, { ...info, calibration: undefined })).toEqual({ range: '-5.5 °C to 36.6 °C' });
        expect(thermalFields(entry, null)).toBeNull();
    });

    it('lists only the fields the file says: no default is shown as what the camera was set to', () => {
        const entry = { properties: { make: 'FLIR Systems AB', model: 'FLIR Vue Pro R' } };
        expect(thermalFields(entry, { ...info, calibration: { planckR1: 21106.77, emissivity: 0.95 } })).toEqual({
            sensor: 'FLIR Systems AB FLIR Vue Pro R',
            range: '-5.5 °C to 36.6 °C',
            emissivity: '0.95'
        });
    });
});

describe('uncalibratedThermalNotice: a thermal picture without temperatures', () => {
    const thermal = (make, model) => ({ properties: { sensorCategory: 'thermal', make, model } });
    const rawCounts = { width: 640, height: 512, valueMin: 13537, valueMax: 20670, unit: '', isThermal: true, isDirectValue: false };

    it('says that a DJI picture needs DJI\'s own conversion, which is not available yet', () => {
        expect(uncalibratedThermalNotice(thermal('DJI', 'ZH20T'), rawCounts)).toBe('No thermal calibration data: showing the picture '
            + 'as shot, without temperatures. The temperatures of a DJI picture need DJI\'s own conversion of its raw sensor values, '
            + 'which is not available yet.');
    });

    it('says that another camera has no calibration', () => {
        expect(uncalibratedThermalNotice(thermal('FLIR Systems AB', 'FLIR Vue Pro R'), rawCounts))
            .toBe('No thermal calibration data: showing the picture as shot, without temperatures.');
    });

    it('says nothing for a radiometric picture, a picture that is not thermal, or before the value info', () => {
        const calibrated = { ...rawCounts, valueMin: 5.685, valueMax: 44.2823, unit: '°C', calibration: { planckR1: 21106.77 } };
        expect(uncalibratedThermalNotice(thermal('FLIR Systems AB', 'FLIR Vue Pro R'), calibrated)).toBe('');
        expect(uncalibratedThermalNotice({ properties: { make: 'DJI' } }, rawCounts)).toBe('');
        expect(uncalibratedThermalNotice(thermal('DJI', 'ZH20T'), null)).toBe('');
        expect(uncalibratedThermalNotice(thermal('DJI', 'ZH20T'), { ...rawCounts, isThermal: false })).toBe('');
    });
});

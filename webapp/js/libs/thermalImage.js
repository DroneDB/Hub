// @ts-check
/**
 * The thermal mode of the image viewer (FR-RAS-15): what a radiometric R-JPEG shows beyond its picture. The functions are
 * pure: which entries are thermal pictures, the pixel of the raw thermal grid under the pointer, the readout of a value, the
 * palette choices and the thermal fields of the details panel. The values are formatted by the one raster value formatter
 * (FR-RAS-28), in the unit the server answers (D-022); the Hub does not convert.
 */
import { rasterValueParts, thermalBandUnit } from '@/libs/map/rasterUnit';
import { colormapList, THERMAL_COLORMAPS } from '@/libs/map/colormaps';
import { formatNumber, fixedLengthParts } from '@/libs/format';

/** The formula of the unit a radiometric picture opens in: ddb gives the temperatures of its raw thermal data in degrees Celsius */
export const DEFAULT_THERMAL_FORMULA = 'CELSIUS';

/**
 * Whether the entry is a picture of a thermal camera (the sensorCategory libddb gives at the scan, FR-RAS-13).
 * @param {{ properties?: Record<string, any> }|null|undefined} entry
 */
export function isThermalEntry(entry) {
    return entry?.properties?.sensorCategory === 'thermal';
}

/**
 * @typedef {{ width?: number, height?: number, valueMin?: number, valueMax?: number, unit?: string, isThermal?: boolean,
 *             isDirectValue?: boolean, calibration?: Record<string, number> }} ThermalInfo  the raster value info of the picture
 */

/**
 * Whether the value info is that of a radiometric picture: a raw thermal grid with a size, the temperatures of its range, and
 * a calibration. A thermal picture whose values are no temperatures says no unit and no calibration, and is shown as a plain
 * picture: one without raw thermal data (its colour preview), and a DJI R-JPEG, whose raw counts need DJI's own conversion,
 * which ddb does not have (FR-RAS-14).
 * @param {ThermalInfo|null|undefined} info
 */
export function isRadiometric(info) {
    if (!info || !(Number(info.width) > 0) || !(Number(info.height) > 0)) return false;
    if (!Number.isFinite(info.valueMin) || !Number.isFinite(info.valueMax)) return false;
    return thermalBandUnit(info) !== '';
}

/**
 * The notice of a thermal picture that has no temperatures (FR-RAS-06, FR-RAS-14): ddb read no calibration, so the viewer shows
 * the picture as shot. A DJI picture says why: its raw sensor values need DJI's own conversion, which is not available yet.
 * '' for a radiometric picture, a picture that is not thermal, or before the value info is known.
 * @param {{ properties?: Record<string, any> }|null|undefined} entry
 * @param {ThermalInfo|null|undefined} info
 */
export function uncalibratedThermalNotice(entry, info) {
    if (!isThermalEntry(entry) || !info || !info.isThermal || isRadiometric(info)) return '';
    const notice = 'No thermal calibration data: showing the picture as shot, without temperatures.';
    if (!/\bdji\b/i.test(String(entry?.properties?.make || ''))) return notice;
    return `${notice} The temperatures of a DJI picture need DJI's own conversion of its raw sensor values, which is not available yet.`;
}

/**
 * The pixel of the raw thermal grid under the pointer. The picture is drawn in a box (the bounding box of the image as the
 * page shows it, zoom included), whatever the size of the bitmap it shows (FR-XC-32): the position in the box, as a fraction,
 * gives the pixel of the grid. Null when the pointer is outside the box.
 * @param {{ x: number, y: number }} pointer  the pointer in the page (clientX, clientY)
 * @param {{ left: number, top: number, width: number, height: number }} box  the drawn picture in the page
 * @param {{ width: number, height: number }} grid  the size of the raw thermal grid
 * @returns {{ x: number, y: number }|null}
 */
export function gridPixelAt(pointer, box, grid) {
    if (!(box.width > 0) || !(box.height > 0) || !(grid.width > 0) || !(grid.height > 0)) return null;
    const fx = (pointer.x - box.left) / box.width;
    const fy = (pointer.y - box.top) / box.height;
    if (!(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null;
    return {
        x: Math.min(grid.width - 1, Math.floor(fx * grid.width)),
        y: Math.min(grid.height - 1, Math.floor(fy * grid.height))
    };
}

/** The choice that shows the picture as the camera made it, with its own palette */
export const AS_SHOT = Object.freeze({ id: '', name: 'As shot', colors: [] });

/**
 * The palettes of the viewer: the picture as shot, then the thermal colormaps (THERMAL_COLORMAPS) with their swatches.
 * @returns {{ id: string, name: string, colors: string[], discrete?: boolean }[]}
 */
export function thermalPalettes() {
    return [{ ...AS_SHOT }, ...colormapList(THERMAL_COLORMAPS)];
}

/**
 * The text of the value under the pointer, written by the raster value formatter in the unit the server answered.
 * @param {{ value?: number, unit?: string }|null|undefined} point  the answer of the point value
 * @param {string} [fallbackUnit]  the unit of the formula, when the answer says none
 * @returns {{ value: number|null, unit: string, text: string }}
 */
export function thermalReadout(point, fallbackUnit = '') {
    return rasterValueParts(point?.value, point?.unit || fallbackUnit);
}

/**
 * The range of the picture as text, "18.7 °C to 33.5 °C", in the unit of the info.
 * @param {ThermalInfo|null|undefined} info
 */
export function thermalRangeText(info) {
    if (!info) return '';
    const min = rasterValueParts(info.valueMin, info.unit);
    const max = rasterValueParts(info.valueMax, info.unit);
    return min.value === null || max.value === null ? '' : `${min.text} to ${max.text}`;
}

/**
 * The style of the legend of the palette on show: the colormap over the range of the picture, in the unit of the formula
 * (the shape RasterLegend takes: `legendLayers`). Null for the picture as shot, which has no palette of ours.
 * @param {string} palette  the colormap id, '' as shot
 * @param {ThermalInfo|null|undefined} info
 * @param {string} formula
 * @returns {{ colormap: string, rescale: string, formula: string }|null}
 */
export function thermalLegendStyle(palette, info, formula) {
    if (!palette || !info || !(Number(info.valueMax) > Number(info.valueMin))) return null;
    return { colormap: palette, rescale: `${info.valueMin},${info.valueMax}`, formula };
}

/**
 * The thermal fields of the details panel: the sensor, the range and what the camera was set to (the emissivity, the
 * distance to the object and the conditions of the measurement). A field the camera did not say is left out.
 * @param {{ properties?: Record<string, any> }|null|undefined} entry
 * @param {ThermalInfo|null|undefined} info
 * @param {string} [units]  the user's measure units
 * @returns {Record<string, string>|null}
 */
export function thermalFields(entry, info, units = 'metric') {
    if (!info) return null;
    /** @type {Record<string, string>} */
    const fields = {};
    const props = entry?.properties || {};
    const sensor = [props.make, props.model].filter(Boolean).join(' ');
    if (sensor) fields.sensor = sensor;
    const range = thermalRangeText(info);
    if (range) fields.range = range;
    const cal = info.calibration;
    if (cal) {
        if (Number.isFinite(cal.emissivity)) fields.emissivity = formatNumber(cal.emissivity, 2, { trim: true });
        if (Number.isFinite(cal.objectDistance)) fields['object distance'] = fixedLengthParts(cal.objectDistance, units, 1).text;
        if (Number.isFinite(cal.reflectedApparentTemperature)) {
            fields['reflected temperature'] = rasterValueParts(cal.reflectedApparentTemperature, '°C').text;
        }
        if (Number.isFinite(cal.atmosphericTemperature)) {
            fields['atmospheric temperature'] = rasterValueParts(cal.atmosphericTemperature, '°C').text;
        }
        // ddb gives the humidity as a fraction (0 to 1) from the FLIR CameraInfo record; the XMP fallback can still be a
        // percentage, so a value over 2 is read as one (the rule of ddb)
        if (Number.isFinite(cal.relativeHumidity)) {
            const percent = cal.relativeHumidity > 2 ? cal.relativeHumidity : cal.relativeHumidity * 100;
            fields['relative humidity'] = `${formatNumber(percent, 0)} %`;
        }
    }
    return Object.keys(fields).length ? fields : null;
}

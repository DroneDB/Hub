// @ts-check
/**
 * The colour legend of a styled raster on the map (FR-RAS-27, the `RasterLegend` of FR-XC-24): what it draws is derived
 * from the style of the layer (`vizParams`: colormap, rescale, formula), which saved views already keep, so it needs no
 * state of its own and shows in a saved view and in an embed. One function turns the style into the model the component
 * draws; the numbers are written by the raster value formatter (FR-RAS-28) with the unit of the raster.
 */
import { colormap, colormapGradient } from '@/libs/map/colormaps';
import { rasterValueParts, rasterUnitSymbol } from '@/libs/map/rasterUnit';
import { splitRescale } from '@/libs/rescale';
import { parseNumber } from '@/libs/format';

/**
 * @typedef {{ colormap?: string, rescale?: string, formula?: string }} LayerStyle  the vizParams a layer is drawn with
 * @typedef {{ path: string, name?: string, visible?: boolean }} LayerRow  a row of the layer list
 * @typedef {{ path: string, name: string, colormap: string, colormapName: string, discrete: boolean, min: number, max: number,
 *             formula: string }} LegendLayer  a layer that has a legend: its colormap and the range the colours span
 * @typedef {LegendLayer & { unit: string, gradient: string, minText: string, maxText: string, label: string }} LegendEntry
 */

/** The formulas that give a temperature, and the unit each gives (D-022) */
const FORMULA_UNITS = new Map([['CELSIUS', '°C'], ['KELVIN', 'K'], ['FAHRENHEIT', '°F']]);

/**
 * The layers that have a legend, top first: the visible ones whose style has a colormap and a range to stretch to. A layer
 * without a style (its own colours), or without a range (the server's own stretch), has none.
 * @param {LayerRow[]} rows  the layer list, top first
 * @param {Record<string, LayerStyle>|null|undefined} styles  the style of each layer by path
 * @returns {LegendLayer[]}
 */
export function legendLayers(rows, styles) {
    /** @type {LegendLayer[]} */
    const layers = [];
    for (const row of rows || []) {
        if (row.visible === false) continue;
        const style = styles && styles[row.path];
        if (!style || !style.colormap || !style.rescale) continue;
        const { min, max } = splitRescale(style.rescale);
        const lo = parseNumber(min);
        const hi = parseNumber(max);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) continue;
        const map = colormap(style.colormap);
        if (map.colors.length === 0) continue;
        layers.push({
            path: row.path,
            name: row.name || row.path,
            colormap: style.colormap,
            colormapName: map.name,
            discrete: !!map.discrete,
            min: lo,
            max: hi,
            formula: style.formula || ''
        });
    }
    return layers;
}

/**
 * The unit of the values a layer shows: that of its thermal formula (°C, K, °F); none for a vegetation index; else the unit
 * of the raster (D-022: the legend shows the unit of the values the tiles are drawn in).
 * @param {{ formula?: string }} layer
 * @param {string|null|undefined} rasterUnit  the unit of the raster, when it is known: `defaultVizParams(info).unit` of its value info
 * @returns {string}
 */
export function legendUnit(layer, rasterUnit) {
    if (layer.formula) return FORMULA_UNITS.get(layer.formula.toUpperCase()) ?? '';
    return rasterUnitSymbol(rasterUnit);
}

/**
 * What the legend of a layer draws: the colour bar and the two ends of its range, written with the unit.
 * @param {LegendLayer} layer
 * @param {string|null|undefined} rasterUnit  see legendUnit
 * @returns {LegendEntry}
 */
export function legendEntry(layer, rasterUnit) {
    const unit = legendUnit(layer, rasterUnit);
    const minText = rasterValueParts(layer.min, unit).text;
    const maxText = rasterValueParts(layer.max, unit).text;
    return {
        ...layer,
        unit,
        gradient: colormapGradient(colormap(layer.colormap).colors, layer.discrete),
        minText,
        maxText,
        label: `${layer.name}: ${layer.colormapName} colours from ${minText} to ${maxText}`
    };
}

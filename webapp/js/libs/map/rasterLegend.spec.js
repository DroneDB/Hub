/**
 * The legend of a styled raster (FR-RAS-27): derived from the vizParams of the layers, with the unit of the raster. The
 * expected texts are written by hand.
 */
import { describe, it, expect } from 'vitest';
import { legendLayers, legendUnit, legendEntry } from './rasterLegend';

const ROW = { path: 'hat-creek/thermal.tif', name: 'thermal.tif' };

describe('legendLayers', () => {
    it('has a layer that has a colormap and a range, in the order of the list', () => {
        const rows = [ROW, { path: 'dsm.tif', name: 'dsm.tif' }];
        const styles = {
            'hat-creek/thermal.tif': { formula: 'CELSIUS', colormap: 'ironbow', rescale: '10,40' },
            'dsm.tif': { colormap: 'viridis', rescale: '-6.3,216' }
        };
        expect(legendLayers(rows, styles)).toEqual([
            { path: 'hat-creek/thermal.tif', name: 'thermal.tif', colormap: 'ironbow', colormapName: 'Ironbow', discrete: false, min: 10, max: 40, formula: 'CELSIUS' },
            { path: 'dsm.tif', name: 'dsm.tif', colormap: 'viridis', colormapName: 'Viridis', discrete: false, min: -6.3, max: 216, formula: '' }
        ]);
    });

    it('leaves out a hidden layer, one without a style, without a range or with a range that is not one', () => {
        const styles = {
            a: { colormap: 'viridis', rescale: '0,1' },
            b: { colormap: 'viridis' },
            c: { colormap: 'viridis', rescale: '5,5' },
            d: { colormap: 'viridis', rescale: 'x,3' },
            e: { colormap: 'nope', rescale: '0,1' }
        };
        const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(path => ({ path, name: path }));
        expect(legendLayers(rows, styles).map(l => l.path)).toEqual(['a']);
        expect(legendLayers([{ path: 'a', name: 'a', visible: false }], styles)).toEqual([]);
        expect(legendLayers(null, null)).toEqual([]);
    });

    it('marks a discrete colormap', () => {
        const [layer] = legendLayers([{ path: 'a', name: 'a' }], { a: { formula: 'NDVI', colormap: 'discrete_ndvi', rescale: '-1,1' } });
        expect(layer.discrete).toBe(true);
    });
});

describe('legendUnit', () => {
    it('is the unit of the thermal formula, none for an index and that of the raster otherwise', () => {
        expect(legendUnit({ formula: 'CELSIUS' }, null)).toBe('°C');
        expect(legendUnit({ formula: 'KELVIN' }, null)).toBe('K');
        expect(legendUnit({ formula: 'NDVI' }, 'm')).toBe('');
        expect(legendUnit({}, 'm')).toBe('m');
        expect(legendUnit({}, 'celsius')).toBe('°C');
        expect(legendUnit({}, '')).toBe('');
        expect(legendUnit({}, null)).toBe('');
    });

    // D-022: a rescale kept across a change of the unit is in the unit it was written in
    it('is the unit of the rescale of a thermal layer when it was written in another temperature unit', () => {
        expect(legendUnit({ formula: 'FAHRENHEIT' }, null)).toBe('°F');
        expect(legendUnit({ formula: 'CELSIUS', rescaleUnit: 'K' }, null)).toBe('K');
        expect(legendUnit({ formula: 'NDVI', rescaleUnit: 'K' }, null)).toBe('');
        expect(legendUnit({ formula: 'KELVIN', rescaleUnit: 'm' }, null)).toBe('K');
    });
});

describe('legendEntry', () => {
    const [thermal] = legendLayers([ROW], { 'hat-creek/thermal.tif': { formula: 'CELSIUS', colormap: 'ironbow', rescale: '10,40' } });

    it('draws ironbow from 10 °C to 40 °C', () => {
        const entry = legendEntry(thermal, null);
        expect(entry.gradient).toBe('linear-gradient(to right, #000000, #570f6a, #bd3754, #f97808, #ffe344, #ffffff)');
        expect(entry.minText).toBe('10.0 °C');
        expect(entry.maxText).toBe('40.0 °C');
        expect(entry.label).toBe('thermal.tif: Ironbow colours from 10.0 °C to 40.0 °C');
    });

    it('writes an elevation in metres with two decimals and an index without a unit', () => {
        const [dsm] = legendLayers([{ path: 'dsm.tif', name: 'dsm.tif' }], { 'dsm.tif': { colormap: 'viridis', rescale: '-6.3,216' } });
        const entry = legendEntry(dsm, 'm');
        expect([entry.minText, entry.maxText]).toEqual(['-6.30 m', '216.00 m']);

        const [ndvi] = legendLayers([{ path: 'o.tif', name: 'o.tif' }], { 'o.tif': { formula: 'NDVI', colormap: 'rdylgn', rescale: '-0.25,0.9' } });
        const index = legendEntry(ndvi, null);
        expect([index.minText, index.maxText]).toEqual(['-0.25', '0.9']);
    });

    it('writes the range of a °C layer whose rescale was kept in K in K', () => {
        const [kept] = legendLayers([ROW], { 'hat-creek/thermal.tif': { formula: 'CELSIUS', colormap: 'ironbow', rescale: '280.1,308.4', rescaleUnit: 'K' } });
        expect(kept.rescaleUnit).toBe('K');
        const entry = legendEntry(kept, null);
        expect([entry.minText, entry.maxText]).toEqual(['280.1 K', '308.4 K']);
    });
});

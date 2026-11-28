import { describe, it, expect } from 'vitest';
import Feature from 'ol/Feature';
import { LineString, Point, Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { measurementTotals, measurementTotalsText } from './measurementTotals';

// About 111.3 m of longitude at the equator per 0.001°
const line = (lon = 0.001) => ({ type: 'length', feature: new Feature({ geometry: new LineString([fromLonLat([0, 0]), fromLonLat([lon, 0])]) }) });
const square = deg => ({
    type: 'area',
    feature: new Feature({ geometry: new Polygon([[[0, 0], [deg, 0], [deg, deg], [0, deg], [0, 0]].map(c => fromLonLat(c))]) })
});
const pile = netVolume => ({ type: 'stockpile', feature: new Feature({ geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]), netVolume }) });
const point = () => ({ type: 'point', feature: new Feature({ geometry: new Point([0, 0]) }) });

describe('measurementTotals', () => {
    it('sums the lines, the areas and the volumes of the piles, metric', () => {
        const t = measurementTotals([line(), line(), square(0.001), pile(40), pile(2.5), point()]);
        expect(t.length.count).toBe(2);
        expect(t.length.total).toBeCloseTo(222.64, 0);
        expect(t.area.count).toBe(1);
        expect(t.area.total).toBeCloseTo(12308, -2);
        expect(t.volume).toEqual({ count: 2, total: 42.5 });
    });

    it('leaves out a pile that was never computed, and a row with no feature', () => {
        const t = measurementTotals([pile(undefined), { type: 'length' }]);
        expect(t.volume.count).toBe(0);
        expect(t.length.count).toBe(0);
    });
});

describe('measurementTotalsText', () => {
    it('says each kind with its count, in the units of the map, rounded once', () => {
        expect(measurementTotalsText([line(), line(), pile(40), pile(2.5)])).toBe('2 lines 222.64 m · 2 piles 42.5 m³');
        expect(measurementTotalsText([line()], 'imperial')).toMatch(/^1 line 365\.\d+ ft$/);
        expect(measurementTotalsText([square(0.001)])).toMatch(/^1 area /);
    });

    it('is empty when nothing has a size', () => {
        expect(measurementTotalsText([point()])).toBe('');
        expect(measurementTotalsText([])).toBe('');
    });
});

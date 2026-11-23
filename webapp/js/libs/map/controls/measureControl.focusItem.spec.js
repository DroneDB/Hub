/**
 * focusItem: the link of a report item. The map frames the annotation with the id and shows it as the annotation under
 * the pointer is; an id that no annotation of the map has changes nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { LineString, Point, Polygon } from 'ol/geom';
import MeasureControls from './measureControl';
import { FILE_FIT_OPTIONS, POINT_FIT_MIN_RESOLUTION } from '@/libs/map/mapUtils';

let control;
let map;

const annotation = (id, geometry, type = 'area') => {
    const feature = new Feature({ geometry, id, measurementType: type });
    control.source.addFeature(feature);
    return feature;
};

beforeEach(() => {
    localStorage.clear();
    control = new MeasureControls({ openDialog: () => ({ close: vi.fn() }) });
    const target = document.createElement('div');
    target.style.width = '400px';
    target.style.height = '300px';
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [0, 0], zoom: 2 }) });
    map.setSize([400, 300]);
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

describe('focusItem', () => {
    it('fits the view to the extent of an area, with the options the map fits its files with', () => {
        const fit = vi.spyOn(map.getView(), 'fit');
        annotation('a1', new Polygon([[[1000, 1000], [3000, 1000], [3000, 2000], [1000, 2000], [1000, 1000]]]));
        annotation('a2', new Polygon([[[-90000, -90000], [-80000, -90000], [-80000, -80000], [-90000, -80000], [-90000, -90000]]]));
        expect(control.focusItem('a1')).toBe(true);
        expect(fit).toHaveBeenCalledOnce();
        expect(fit.mock.calls[0][0]).toEqual([1000, 1000, 3000, 2000]);
        expect(fit.mock.calls[0][1]).toEqual(FILE_FIT_OPTIONS);
    });

    it('fits a line the same way, and a point, which has no extent, to a close scale', () => {
        const fit = vi.spyOn(map.getView(), 'fit');
        annotation('l1', new LineString([[0, 0], [500, 500]]), 'length');
        expect(control.focusItem('l1')).toBe(true);
        expect(fit.mock.calls[0][1]).toEqual(FILE_FIT_OPTIONS);
        annotation('p1', new Point([4000, 4000]), 'point');
        expect(control.focusItem('p1')).toBe(true);
        expect(fit.mock.calls[1][0]).toEqual([4000, 4000, 4000, 4000]);
        expect(fit.mock.calls[1][1]).toEqual({ ...FILE_FIT_OPTIONS, minResolution: POINT_FIT_MIN_RESOLUTION });
    });

    it('shows the annotation as the one under the pointer is, and another one takes it over', () => {
        const a = annotation('a1', new Point([10, 10]), 'point');
        const b = annotation('a2', new Point([20, 20]), 'point');
        control.focusItem('a1');
        expect(control._hoveredFeature).toBe(a);
        control.focusItem('a2');
        expect(control._hoveredFeature).toBe(b);
        expect(a._hovered).toBe(false);
    });

    it('is false, and changes nothing, for an id no annotation has', () => {
        annotation('a1', new Point([10, 10]), 'point');
        const fit = vi.spyOn(map.getView(), 'fit');
        expect(control.focusItem('gone')).toBe(false);
        expect(control._hoveredFeature ?? null).toBeNull();
        expect(fit).not.toHaveBeenCalled();
    });

    it('does not take a feature that is no annotation (a sketch with no type)', () => {
        const sketch = new Feature({ geometry: new Point([1, 1]), id: 'sketch' });
        control.source.addFeature(sketch);
        expect(control.focusItem('sketch')).toBe(false);
    });
});

describe('fitFeatures', () => {
    it('fits the view to the extent of all the measurements given', () => {
        const fit = vi.spyOn(map.getView(), 'fit');
        const a = annotation('a1', new Polygon([[[1000, 1000], [3000, 1000], [3000, 2000], [1000, 2000], [1000, 1000]]]));
        const p = annotation('p1', new Point([-500, 4000]), 'point');
        expect(control.fitFeatures([a, p])).toBe(true);
        expect(fit.mock.calls[0][0]).toEqual([-500, 1000, 3000, 4000]);
        expect(fit.mock.calls[0][1]).toEqual(FILE_FIT_OPTIONS);
    });

    it('does nothing with no measurement', () => {
        const fit = vi.spyOn(map.getView(), 'fit');
        expect(control.fitFeatures([])).toBe(false);
        expect(fit).not.toHaveBeenCalled();
    });
});

describe('setListSelection', () => {
    const strokeWidth = feature => {
        const style = control.createFeatureStyle(feature);
        return (Array.isArray(style) ? style[0] : style).getStroke().getWidth();
    };

    it('draws the measurements selected in the list as hovered ones, and the next call clears the others', () => {
        const a = annotation('a1', new LineString([[0, 0], [10, 10]]), 'length');
        const b = annotation('b1', new LineString([[0, 0], [20, 20]]), 'length');
        const rest = strokeWidth(a);
        control.setListSelection([a, b]);
        expect(strokeWidth(a)).toBeGreaterThan(rest);
        expect(strokeWidth(b)).toBeGreaterThan(rest);
        control.setListSelection([b]);
        expect(strokeWidth(a)).toBe(rest);
        expect(strokeWidth(b)).toBeGreaterThan(rest);
        control.setListSelection([]);
        expect(strokeWidth(b)).toBe(rest);
        // The mark is not a property: it is never saved
        expect(Object.keys(b.getProperties())).not.toContain('_listSelected');
    });
});

describe('setFeatureVisibility', () => {
    it('hides one measurement and shows it again', () => {
        const a = annotation('a1', new LineString([[0, 0], [10, 10]]), 'length');
        control.setFeatureVisibility(a, false);
        expect(a.getStyle()).toEqual([]);
        control.setFeatureVisibility(a, true);
        expect(a.getStyle()).toBeFalsy();
    });
});

/**
 * The found piles on the map: every outline with the number of its row, in a layer of its own, emphasised when it is
 * the chosen pile or the one under the pointer in the list, and dimmed when the pile is a measurement already.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { createPilePreview } from './stockpilePreview';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';
import { hexRgba } from '@/libs/palette';

const polygon = (lon, lat) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat]]] });
const PILES = [{ id: 7, polygon: polygon(9, 45) }, { id: 9, polygon: polygon(9.01, 45) }];

let preview;
let map;
const featureOf = id => preview.layer.getSource().getFeatures().find(f => f.get('pileId') === id);
const stylesOf = id => preview.layer.getStyleFunction()(featureOf(id), 1);
// [halo, outline and fill, row number]
const lineOf = id => stylesOf(id)[1].getStroke();
const numberOf = id => stylesOf(id)[2].getText();

beforeEach(() => {
    preview = createPilePreview();
    map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
    preview.show(PILES, 'EPSG:3857');
});

describe('the preview of the found piles', () => {
    it('has a feature for each pile, in the projection of the map, numbered by its row', () => {
        expect(preview.layer.getSource().getFeatures().map(f => [f.get('pileId'), f.get('rank')])).toEqual([[7, 1], [9, 2]]);
        // 9 degrees east is about 1,001,875 m in Web Mercator
        expect(featureOf(7).getGeometry().getExtent()[0]).toBeCloseTo(1001875.4, 0);
        expect(numberOf(7).getText()).toBe('1');
        expect(numberOf(9).getText()).toBe('2');
    });

    it('takes the outline of the measurement a pile is (an edited outline), and leaves an unknown pile alone', () => {
        preview.setOutline(7, polygon(10, 45), 'EPSG:3857');
        // 10 degrees east is about 1,113,195 m in Web Mercator
        expect(featureOf(7).getGeometry().getExtent()[0]).toBeCloseTo(1113194.9, 0);
        expect(featureOf(7).get('rank')).toBe(1);
        expect(() => preview.setOutline(42, polygon(10, 45), 'EPSG:3857')).not.toThrow();
        expect(featureOf(9).getGeometry().getExtent()[0]).toBeCloseTo(1002988.6, 0);
    });

    it('shows a new list in place of the old one', () => {
        preview.show([PILES[1]], 'EPSG:3857');
        expect(preview.layer.getSource().getFeatures().map(f => f.get('pileId'))).toEqual([9]);
        expect(numberOf(9).getText()).toBe('1');
    });

    it('draws in the analysis yellow, with dark number text on it: no orange, no red', () => {
        expect(lineOf(7).getColor()).toBe(hexRgba(ANALYSIS_COLOR, 0.9));
        expect(numberOf(7).getFill().getColor()).toBe('#1a1a1a');
        expect(numberOf(7).getBackgroundFill().getColor()).toBe(hexRgba(ANALYSIS_COLOR, 0.9));
    });

    it('emphasises the chosen pile and the one the pointer is on, and lets go of them', () => {
        const normal = lineOf(7).getWidth();
        preview.setChosen(9);
        expect(lineOf(9).getWidth()).toBeGreaterThan(normal);
        expect(lineOf(7).getWidth()).toBe(normal);

        preview.setHovered(7);
        expect(lineOf(7).getWidth()).toBeGreaterThan(normal);

        preview.setChosen(null);
        preview.setHovered(null);
        expect(lineOf(7).getWidth()).toBe(normal);
        expect(lineOf(9).getWidth()).toBe(normal);
    });

    it('dims the piles that are measurements already, and the chosen one stays emphasised', () => {
        preview.setAdded([7]);
        expect(lineOf(7).getColor()).toBe(hexRgba(ANALYSIS_COLOR, 0.45));
        expect(lineOf(7).getWidth()).toBeLessThan(lineOf(9).getWidth());
        expect(numberOf(7).getBackgroundFill().getColor()).toBe(hexRgba(ANALYSIS_COLOR, 0.5));

        preview.setChosen(7);
        expect(lineOf(7).getWidth()).toBeGreaterThan(lineOf(9).getWidth());
    });

    it('is empty and forgets its state once cleared', () => {
        preview.setChosen(7);
        preview.setAdded([9]);
        preview.clear();
        expect(preview.layer.getSource().getFeatures()).toHaveLength(0);
        preview.show(PILES, 'EPSG:3857');
        expect(lineOf(7).getWidth()).toBe(lineOf(9).getWidth());
        expect(lineOf(9).getColor()).toBe(hexRgba(ANALYSIS_COLOR, 0.9));
    });

    it('gives the pile under a pixel, from its own layer only', () => {
        const seen = [];
        map.forEachFeatureAtPixel = (pixel, callback, { layerFilter }) => {
            seen.push(layerFilter(preview.layer), layerFilter({}));
            return callback(featureOf(9), preview.layer);
        };
        expect(preview.pileAt(map, [1, 1])).toBe(9);
        expect(seen).toEqual([true, false]);

        map.forEachFeatureAtPixel = () => undefined;
        expect(preview.pileAt(map, [1, 1])).toBeNull();
    });

    it('brings a pile into view, and leaves a map that has no size alone', () => {
        const view = map.getView();
        const fit = view.fit;
        let fitted = null;
        view.fit = (geometry, options) => { fitted = [geometry, options]; return fit.call(view, geometry, options); };

        preview.fit(map, 7);
        expect(fitted).toBeNull();

        map.setSize([400, 300]);
        preview.fit(map, 7);
        expect(fitted[0]).toBe(featureOf(7).getGeometry());
        preview.fit(map, 12345);
        expect(fitted[0]).toBe(featureOf(7).getGeometry());
    });
});

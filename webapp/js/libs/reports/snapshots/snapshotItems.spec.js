/**
 * The items of a snapshot: a callout with the display reference of each (the one the tables show), the item at full
 * strength over the others at 40 %, and no item without a geometry.
 */
import { describe, it, expect } from 'vitest';
import { itemFeature, itemLayers, calloutAnchor, itemStyles, OTHER_ITEMS_OPACITY, readableColour } from './snapshotItems';

const point = (id, ref, lon = 11, lat = 45) => ({ id, ref, colour: '#d97706', category: 'x', geometry: { type: 'Point', coordinates: [lon, lat] } });
const line = (id, ref) => ({ id, ref, colour: '#2563eb', geometry: { type: 'LineString', coordinates: [[11, 45], [11.001, 45], [11.002, 45]] } });
const area = (id, ref) => ({ id, ref, colour: '#16a34a', geometry: { type: 'Polygon', coordinates: [[[11, 45], [11.001, 45], [11.001, 45.001], [11, 45.001], [11, 45]]] } });

/** The text of the callout among the styles of a feature. */
const calloutOf = feature => feature.getStyle().map(s => s.getText && s.getText()).filter(Boolean).map(t => t.getText());

describe('the callouts', () => {
    it('show the display refs 1 and 12 of two items, as the table rows do', () => {
        const [layer] = itemLayers([point('a', '1'), point('b', '12', 11.01)], null);
        const features = layer.getSource().getFeatures();
        expect(features.flatMap(calloutOf)).toEqual(['1', '12']);
    });

    it('show a display ref with a source label as it is', () => {
        expect(calloutOf(itemFeature(line('l', 'B-3')))).toEqual(['B-3']);
    });

    it('anchor a point on itself, a line in the middle, and an area inside it', () => {
        const at = item => calloutAnchor(itemFeature(item).getGeometry());
        const p = at(point('p', '1'));
        expect(p[0]).toBeCloseTo(1224514.4, 0);
        const l = at(line('l', '2'));
        const g = itemFeature(line('l', '2')).getGeometry();
        expect(l).toEqual(g.getCoordinateAt(0.5));
        const a = at(area('a', '3'));
        expect(itemFeature(area('a', '3')).getGeometry().intersectsCoordinate(a)).toBe(true);
    });

    it('have no callout for an item with no ref', () => {
        expect(calloutOf(itemFeature({ ...point('p', ''), ref: '' }))).toEqual([]);
    });
});

describe('the layers of the items', () => {
    const items = [point('a', '1'), line('b', '2'), area('c', '3')];

    it('draw every item at full strength in an overview', () => {
        const layers = itemLayers(items, null);
        expect(layers).toHaveLength(1);
        expect(layers[0].getOpacity()).toBe(1);
        expect(layers[0].getSource().getFeatures()).toHaveLength(3);
    });

    it('draw the other items at 40 % under the item at full strength', () => {
        const [others, focus] = itemLayers(items, 'b');
        expect(OTHER_ITEMS_OPACITY).toBe(0.4);
        expect(others.getOpacity()).toBe(0.4);
        expect(focus.getOpacity()).toBe(1);
        expect(others.getSource().getFeatures().map(f => f.get('id'))).toEqual(['a', 'c']);
        expect(focus.getSource().getFeatures().map(f => f.get('id'))).toEqual(['b']);
    });

    it('draw no item without a geometry (an item that is not georeferenced)', () => {
        const layers = itemLayers([point('a', '1'), { id: 'n', ref: '2', colour: '#000', geometry: null }, { id: 'bad', ref: '3', colour: '#000', geometry: { type: 'Nope' } }], null);
        expect(layers[0].getSource().getFeatures().map(f => f.get('id'))).toEqual(['a']);
    });
});

describe('the style of an item', () => {
    it('uses the colour of its category for the line and the callout border, and falls back to the blue for a colour it cannot read', () => {
        expect(readableColour('#d97706')).toBe('#d97706');
        expect(readableColour('not a colour')).toBe('#0070e0');
        const geometry = itemFeature(line('l', '1')).getGeometry();
        const styles = itemStyles({ ref: '1', colour: '#2563eb' }, geometry);
        expect(styles[1].getStroke().getColor()).toBe('#2563eb');
        expect(styles[2].getText().getBackgroundStroke().getColor()).toBe('#2563eb');
    });
});

/**
 * Imported measurements show their size in today's units: an area or a length is recalculated from
 * its geometry, so a measurement saved as "0.03 acres" reads in ft² after a reload. Other
 * measurements keep the text they were saved with.
 */
import { describe, it, expect } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import { importMeasurements, measurementSizeText } from './olMeasurementConverter';
import { ANALYSIS_COLOR } from './mapUtils';
import { ANALYSIS_FILL } from './analysisStyles';

// About 11 m x 11 m near the equator: a roof-sized area, well below 1 acre
const ROOF = [[[9, 0], [9.0001, 0], [9.0001, 0.0001], [9, 0.0001], [9, 0]]];
const LINE = [[9, 0], [9.0001, 0]];

const featureOf = (type, coordinates, properties) =>
    ({ type: 'Feature', geometry: { type, coordinates }, properties });

function importOne(feature, unitPref = 'imperial') {
    const source = new VectorSource();
    const { features } = importMeasurements({ type: 'FeatureCollection', features: [feature] }, source, unitPref, null);
    expect(features).toHaveLength(1);
    return features[0];
}

describe('importMeasurements tooltip text', () => {
    it('recalculates a saved area in the current units instead of keeping its saved text', () => {
        const f = importOne(featureOf('Polygon', ROOF, { measurementType: 'area', tooltipText: '0.03 acres' }));
        expect(f.get('tooltipText')).toMatch(/^\d+(\.\d+)? ft²$/);
        expect(f.get('tooltipText')).toBe(measurementSizeText(f.getGeometry(), 'area', 'imperial'));
    });

    it('recalculates a saved length in the current units', () => {
        const f = importOne(featureOf('LineString', LINE, { measurementType: 'length', tooltipText: '36.5 ft' }), 'metric');
        expect(f.get('tooltipText')).toMatch(/^\d+(\.\d+)? m$/);
    });

    it('keeps the saved text of a stockpile and of a profile, which is not their size', () => {
        const pile = importOne(featureOf('Polygon', ROOF,
            { measurementType: 'stockpile', tooltipText: 'Pile A - 12.0 m³', id: 'p1' }));
        expect(pile.get('tooltipText')).toBe('Pile A - 12.0 m³');
        const profile = importOne(featureOf('LineString', LINE,
            { measurementType: 'profile', tooltipText: 'Profile: 11.1 m' }));
        expect(profile.get('tooltipText')).toBe('Profile: 11.1 m');
    });

    it('gives an untyped feature saved without text its size', () => {
        const f = importOne(featureOf('Polygon', ROOF, {}));
        expect(f.get('tooltipText')).toMatch(/ ft²$/);
    });
});

describe('measurementSizeText', () => {
    it('is null for measurements whose text is not their size', () => {
        const pile = importOne(featureOf('Polygon', ROOF, { measurementType: 'stockpile', tooltipText: 'x' }));
        expect(measurementSizeText(pile.getGeometry(), 'stockpile', 'metric')).toBeNull();
        expect(measurementSizeText(pile.getGeometry(), 'length', 'metric')).toBeNull();
    });
});

describe('importMeasurements colours of the analysis overlays', () => {
    it('gives a stockpile or a profile saved in the earlier orange the yellow of today', () => {
        const pile = importOne(featureOf('Polygon', ROOF, {
            measurementType: 'stockpile', stroke: '#ff9800', fill: 'rgba(255, 152, 0, 0.20)'
        }));
        expect(pile.get('stroke')).toBe(ANALYSIS_COLOR);
        expect(pile.get('fill')).toBe(ANALYSIS_FILL);
        const profile = importOne(featureOf('LineString', LINE, { measurementType: 'profile', stroke: '#FF9800' }));
        expect(profile.get('stroke')).toBe(ANALYSIS_COLOR);
    });

    it('keeps a colour the user chose, and the orange of a measurement that is not an analysis', () => {
        const pile = importOne(featureOf('Polygon', ROOF, { measurementType: 'stockpile', stroke: '#00cc66' }));
        expect(pile.get('stroke')).toBe('#00cc66');
        const length = importOne(featureOf('LineString', LINE, { measurementType: 'length', stroke: '#ff9800' }));
        expect(length.get('stroke')).toBe('#ff9800');
    });
});

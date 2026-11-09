/**
 * A stockpile on the measure control: its label (map and Measurement List) is built from its
 * stored metric properties in the units of the map (FR-MAP-13), and the control tells whether one
 * measurement is in the saved file (FR-MAP-02).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import Feature from 'ol/Feature';
import { Polygon } from 'ol/geom';
import LineString from 'ol/geom/LineString';
import MeasureControls from './measureControl';
import { _resetPrefListenersForTests } from '@/libs/preferences';

let control;
let map;

const pile = (id = 'p1') => {
    const f = new Feature(new Polygon([[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]));
    f.setProperties({
        measurementType: 'stockpile', id, title: 'North', netVolume: 8097.19, materialName: 'Gravel',
        materialDensity: 1.68, unitSystem: 'metric', tooltipText: 'North - 8,097.19 m³ - Gravel - 1.68 t/m³'
    });
    return f;
};
const distance = () => {
    const f = new Feature(new LineString([[0, 0], [100, 0]]));
    f.set('measurementType', 'length');
    return f;
};

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    control = new MeasureControls({});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
    _resetPrefListenersForTests();
});

describe('stockpile label after a units change (FR-MAP-13)', () => {
    // Worked out by hand: 8097.19 m³ x 1.307950619 yd³/m³ = 10,590.72 yd³; 1.68 t/m³ x 0.8427774 = 1.416 ST/yd³
    const METRIC = 'North - 8,097.19 m³ - Gravel - 1.68 t/m³';
    const IMPERIAL = 'North - 10,590.72 yd³ - Gravel - 1.416 ST/yd³';
    beforeEach(() => Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true }));
    afterEach(() => { delete navigator.language; });

    it('shows yd³ and ST in the feature tooltip and in the Measurement List, and m³ again for metric', () => {
        const f = pile();
        control.source.addFeature(f);
        control.showUnit('imperial');
        expect(f.get('tooltipText')).toBe(IMPERIAL);
        const [item] = control.getMeasurementsList();
        expect(item.type).toBe('stockpile');
        expect(item.value).toBe(IMPERIAL);
        // the stored properties stay metric
        expect(f.get('netVolume')).toBe(8097.19);
        expect(f.get('materialDensity')).toBe(1.68);
        control.showUnit('metric');
        expect(f.get('tooltipText')).toBe(METRIC);
        expect(control.getMeasurementsList()[0].value).toBe(METRIC);
    });

    it('Convert (applyUnitsChange) to imperial: the Measurement List shows the pile in yd³ and ST', () => {
        const f = pile();
        control.source.addFeature(f);
        expect(control.getMeasurementsList()[0].value).toBe(METRIC);
        control.applyUnitsChange('imperial');
        expect(control.getMeasurementsList()[0].value).toBe(IMPERIAL);
        expect(f.get('tooltipText')).toBe(IMPERIAL);
        expect(f.get('netVolume')).toBe(8097.19);
    });

    it('lists a stockpile in the units of the map even when its tooltip text was not updated', () => {
        const f = pile();
        control.source.addFeature(f);
        control.unitPref = 'imperial';
        expect(control.getMeasurementsList()[0].value).toBe(IMPERIAL);
    });

    it('a pile saved without a volume keeps its text through a units change, on the map and in the list', () => {
        const f = new Feature(new Polygon([[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]));
        f.setProperties({ measurementType: 'stockpile', id: 'old', title: 'Old pile', tooltipText: 'Old pile - 12.0 m³ - <b>Sand</b>' });
        control.source.addFeature(f);
        control.applyUnitsChange('imperial');
        expect(f.get('tooltipText')).toBe('Old pile - 12.0 m³ - <b>Sand</b>');
        expect(control.getMeasurementsList()[0].value).toBe('Old pile - 12.0 m³ - Sand');
        // A volume that is not a number is no volume
        f.set('netVolume', '12');
        control.showUnit('metric');
        expect(f.get('tooltipText')).toBe('Old pile - 12.0 m³ - <b>Sand</b>');
    });
});

describe('isSaved (FR-MAP-02)', () => {
    it('is true for a measurement in the saved snapshot, whatever else changed since', () => {
        control.source.addFeature(pile('p1'));
        expect(control.isSaved('p1')).toBe(false);
        control.markSaved();
        expect(control.isSaved('p1')).toBe(true);
        control.source.addFeature(distance());
        expect(control.isDirty()).toBe(true);
        expect(control.isSaved('p1')).toBe(true);
        expect(control.isSaved('p2')).toBe(false);
        expect(control.isSaved('')).toBe(false);
    });
});

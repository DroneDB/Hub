/**
 * Imported measurements show their size in today's units: an area or a length is recalculated from
 * its geometry, so a measurement saved as "0.03 acres" reads in ft² after a reload. Other
 * measurements keep the text they were saved with.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Vector as VectorSource } from 'ol/source';
import proj4 from 'proj4';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import { LineString, Polygon } from 'ol/geom';
import OlMap from 'ol/Map';
import { exportMeasurements, importMeasurements, measurementSizeText, updateFeatureTooltip } from './olMeasurementConverter';
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

afterEach(() => {
    delete navigator.language;
});

describe('importMeasurements tooltip text', () => {
    it('recalculates a saved area in the current units instead of keeping its saved text', () => {
        const f = importOne(featureOf('Polygon', ROOF, { measurementType: 'area', tooltipText: '0.03 acres' }));
        expect(f.get('tooltipText')).toMatch(/^\d{1,3}(,\d{3})*(\.\d+)? ft²$/);
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

    it('builds the label of a stockpile from its metric properties in the current units (FR-MAP-13)', () => {
        Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
        const props = { measurementType: 'stockpile', id: 'p1', title: 'North', netVolume: 8097.19, materialName: 'Gravel',
            materialDensity: 1.68, unitSystem: 'metric', tooltipText: 'North - 8,097.19 m³ - Gravel - 1.68 t/m³' };
        // Reloaded in imperial: yd³ and ST, whatever the file's text says
        // (8097.19 m³ x 1.307950619 = 10,590.72 yd³; 1.68 t/m³ x 0.8427774 = 1.416 ST/yd³)
        const imperial = importOne(featureOf('Polygon', ROOF, props), 'imperial');
        expect(imperial.get('tooltipText')).toBe('10,590.72 yd³ - Gravel - 1.416 ST/yd³');
        // The stored properties stay metric
        expect(imperial.get('netVolume')).toBe(8097.19);
        expect(imperial.get('materialDensity')).toBe(1.68);
        expect(importOne(featureOf('Polygon', ROOF, props), 'metric').get('tooltipText')).toBe('8,097.19 m³ - Gravel - 1.68 t/m³');
    });

    it('gives an untyped feature saved without text its size', () => {
        const f = importOne(featureOf('Polygon', ROOF, {}));
        expect(f.get('tooltipText')).toMatch(/ ft²$/);
    });
});

describe('contour lines', () => {
    const contourOf = extra => featureOf('LineString', LINE, {
        id: 'c', measurementType: 'contour', name: 'Contour 162.0 m', elev: 162, unit: 'm', interval: 1, isMajor: false, ...extra
    });

    it('show their level in the unit of the raster, not their length (an older Hub saved the length as their text)', () => {
        expect(importOne(contourOf({ tooltipText: '119.98 m' }), 'metric').get('tooltipText')).toBe('162.00 m');
        // In imperial too: the level is in the unit of the raster, which the map does not convert
        expect(importOne(contourOf(), 'imperial').get('tooltipText')).toBe('162.00 m');
        expect(importOne(contourOf({ elev: 29.14, unit: '°C' }), 'metric').get('tooltipText')).toBe('29.1 °C');
        // A level without a unit is written as a value
        expect(importOne(contourOf({ unit: undefined }), 'metric').get('tooltipText')).toBe('162');
    });

    it('are saved as contours, with their level and its unit, without a length and without the unsaved flag', () => {
        const source = new VectorSource();
        importMeasurements({ type: 'FeatureCollection', features: [contourOf({ unsaved: true, elev: 29.1, unit: '°C' })] }, source, 'imperial', null);
        const [saved] = exportMeasurements(source, 'dsm.tif', 'imperial').features;
        expect(saved.properties).toMatchObject({ measurementType: 'contour', elev: 29.1, unit: '°C', interval: 1, isMajor: false, tooltipText: '29.1 °C' });
        expect(saved.properties).not.toHaveProperty('unsaved');
        expect(saved.properties).not.toHaveProperty('length');
        expect(saved.properties).not.toHaveProperty('displayValue');
    });
});

describe('the labels of measurements from a saved file are text, not HTML', () => {
    const NAME = '<img src=x onerror=alert(1)>';
    let map;
    afterEach(() => map?.setTarget(undefined));

    function importOnMap(feature) {
        const target = document.createElement('div');
        document.body.appendChild(target);
        map = new OlMap({ target });
        const { features } = importMeasurements({ type: 'FeatureCollection', features: [feature] }, new VectorSource(), 'metric', map);
        return features[0];
    }
    const label = f => /** @type {HTMLElement} */ (f.get('measureTooltipElement'));

    it('shows the name of an imported measurement as written', () => {
        const f = importOnMap(featureOf('Polygon', ROOF, { measurementType: 'profile', name: NAME, tooltipText: 'Profile: 11.1 m' }));
        expect(label(f).querySelector('img')).toBeNull();
        expect(label(f).querySelector('.ol-tooltip-name').textContent).toBe(NAME);
        expect(label(f).querySelector('.ol-tooltip-value').textContent).toBe('Profile: 11.1 m');
    });

    it('shows the material of a stockpile in its label as written', () => {
        Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
        const f = importOnMap(featureOf('Polygon', ROOF, { measurementType: 'stockpile', id: 'p1', netVolume: 8097.19,
            materialName: NAME, materialDensity: 1.68, unitSystem: 'metric' }));
        expect(label(f).querySelector('img')).toBeNull();
        expect(label(f).querySelector('.ol-tooltip-value').textContent).toBe('8,097.19 m³ - <img src=x onerror=alert(1)> - 1.68 t/m³');
    });

    it('shows saved label text as written', () => {
        const f = importOnMap(featureOf('LineString', LINE, { measurementType: 'profile', tooltipText: `Profile ${NAME}` }));
        expect(label(f).querySelector('img')).toBeNull();
        expect(label(f).querySelector('.ol-tooltip-value').textContent).toBe('Profile <img src=x onerror=alert(1)>');
    });

    it('keeps the name as text when the label is written again (updateFeatureTooltip)', () => {
        const f = importOnMap(featureOf('LineString', LINE, { measurementType: 'length', name: 'Fence' }));
        f.set('name', NAME);
        updateFeatureTooltip(f);
        expect(label(f).querySelector('img')).toBeNull();
        expect(label(f).querySelector('.ol-tooltip-name').textContent).toBe(NAME);
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

// FR-MAP-15: a length and an area on the WGS84 ellipsoid, at 56°N where a sphere is 0.34% / 0.5% short.
// The shapes are built from a transverse Mercator grid, k=1, on the UTM 32N central meridian (9°E): not
// UTM, which has k0 = 0.9996, but a grid of scale 1 like SWEREF99, so 100 grid metres are 100 ground metres.
describe('measurements at 56°N on the ellipsoid (FR-MAP-15)', () => {
    /** Transverse Mercator, k=1, on the UTM 32N central meridian */
    const GRID = '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs';
    const LONLAT = '+proj=longlat +datum=WGS84 +no_defs';
    const [E, N] = proj4(LONLAT, GRID, [9.001, 56]);
    const at = (de, dn) => fromLonLat(proj4(GRID, LONLAT, [E + de, N + dn]));

    const line = () => new LineString([at(0, 0), at(100, 0)]);
    const square = () => new Polygon([[at(0, 0), at(100, 0), at(100, 100), at(0, 100), at(0, 0)]]);

    function exportedProperties(geometry, properties, unitPref = 'metric') {
        const source = new VectorSource();
        const f = new Feature(geometry);
        f.setProperties(properties);
        source.addFeature(f);
        return exportMeasurements(source, 'ortho.tif', unitPref).features[0].properties;
    }

    it('stores a 100 m line as 100 m (a sphere gave 99.66 m)', () => {
        const props = exportedProperties(line(), { measurementType: 'length' });
        expect(Math.abs(props.length - 100)).toBeLessThan(0.01);
        expect(props.length).toBe(100);
        expect(props.lengthValue).toBe(100);
        expect(props.unit).toBe('m');
        expect(props.displayValue).toBe('100 m');
        expect(props.unitPreference).toBe('metric');
    });

    it('stores a 100 x 100 m square as 10,000 m2 (a sphere gave 9,952.68 m2)', () => {
        const props = exportedProperties(square(), { measurementType: 'area' });
        expect(Math.abs(props.area - 10000)).toBeLessThan(1);
        expect(props.area).toBe(10000);
        expect(props.unit).toBe('m²');
        expect(props.areaValue).toBe(10000);
        expect(props.displayValue).toBe('10,000 m²');
    });

    it('stores the line of a profile as its length, and keeps its type', () => {
        const props = exportedProperties(line(), { measurementType: 'profile', tooltipText: 'Profile: 100 m' });
        expect(props.measurementType).toBe('profile');
        expect(props.length).toBe(100);
        expect(props.tooltipText).toBe('Profile: 100 m');
    });

    it('labels the line and the square from the geometry, in metric and in imperial', () => {
        expect(measurementSizeText(line(), 'length', 'metric')).toBe('100 m');
        expect(measurementSizeText(line(), 'length', 'imperial')).toBe('328.08 ft');
        expect(measurementSizeText(square(), 'area', 'metric')).toBe('10,000 m²');
        expect(measurementSizeText(square(), 'area', 'imperial')).toBe('2.47 acres');
    });
});

describe('the identity, the fields and the properties of a measurement that the map does not know', () => {
    const FIELDS = {
        id: 'stable-id', ref: '7', category: 'defect', severity: 'high', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false,
        photos: [{ path: 'a/photo.jpg', source: 'dataset', caption: 'Crack' }]
    };
    // A file loaded into the map and saved again
    function roundTrip(feature, unitPref = 'metric') {
        const source = new VectorSource();
        importMeasurements({ type: 'FeatureCollection', features: [feature] }, source, unitPref, null);
        return exportMeasurements(source, 'ortho.tif', unitPref).features[0];
    }

    it('keeps a property it does not know, of any value, for every kind of measurement', () => {
        const extra = { customKey: 5, nested: { a: [1, { b: 2 }] }, flag: false, nothing: null };
        const kinds = [
            featureOf('Polygon', ROOF, { measurementType: 'area', ...extra }),
            featureOf('LineString', LINE, { measurementType: 'length', ...extra }),
            featureOf('Point', [9, 0], { measurementType: 'point', ...extra }),
            featureOf('Polygon', ROOF, { measurementType: 'stockpile', id: 'p1', netVolume: 5, ...extra })
        ];
        kinds.forEach(kind => expect(roundTrip(kind).properties).toMatchObject(extra));
    });

    it('keeps the id, the ref, the fields and the photos, and writes the GeoJSON id as the id', () => {
        const saved = roundTrip(featureOf('Polygon', ROOF, { measurementType: 'area', createdAt: 't0', ...FIELDS }));
        expect(saved.properties).toMatchObject(FIELDS);
        expect(saved.id).toBe('stable-id');
    });

    it('writes what the map computes, not what the file said: the size follows the geometry', () => {
        const saved = roundTrip(featureOf('Polygon', ROOF, { measurementType: 'area', area: 1, displayValue: 'stale', areaValue: 1, unit: 'x' }));
        expect(saved.properties.area).toBeGreaterThan(100);
        expect(saved.properties.displayValue).not.toBe('stale');
    });

    it('lets the user clear a field and leaves nothing of it in the file', () => {
        const source = new VectorSource();
        importMeasurements({ type: 'FeatureCollection', features: [featureOf('Polygon', ROOF, { measurementType: 'area', ...FIELDS })] }, source, 'metric', null);
        const [feature] = source.getFeatures();
        feature.set('category', undefined);
        feature.set('assignee', undefined);
        const saved = exportMeasurements(source, 'ortho.tif', 'metric').features[0];
        expect(saved.properties).not.toHaveProperty('category');
        expect(saved.properties).not.toHaveProperty('assignee');
        expect(saved.properties).toMatchObject({ status: 'open', ref: '7' });
    });

    it('does not make an id: a feature of the file that has none has none when saved (the format gives it one)', () => {
        const saved = roundTrip(featureOf('LineString', LINE, { measurementType: 'length' }));
        expect(saved.properties.id).toBeUndefined();
        expect(saved.id).toBeUndefined();
    });
});

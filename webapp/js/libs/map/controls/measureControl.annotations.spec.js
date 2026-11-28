/**
 * A measurement is an annotation: it has an id and a reference when it is made, the reference is drawn on the map
 * (unless the user hides it), a point that is discarded gives its reference back, a file that has no references does
 * not make the map unsaved, the properties dialog is given the organization's schema and asks the control whether a
 * reference is taken, and the list of measurements has the fields.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { LineString, Point, Polygon } from 'ol/geom';
import { Style } from 'ol/style';
import MeasureControls from './measureControl';
import { RefSequence } from '@/libs/map/annotationIds';
import { read } from '@/libs/map/measurementFormat';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';

let control;
let map;
let dialogs;
let sequence;

beforeEach(() => {
    localStorage.clear();
    dialogs = [];
    sequence = null;
    control = new MeasureControls({
        openDialog: (component, props) => { dialogs.push({ ...props, component }); return { close: vi.fn() }; },
        getRefSequence: () => sequence
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [1000, 2000], zoom: 10 }) });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

const refs = () => control.source.getFeatures().map(f => f.get('ref')).sort();
const rightClick = () => {
    const pointer = type => map.getViewport().dispatchEvent(new MouseEvent(type, { clientX: 50, clientY: 50, button: 2, bubbles: true, cancelable: true }));
    pointer('pointerdown');
    pointer('pointerup');
};
// The tool stays armed for the next line
const drawLine = () => {
    if (control.selectedTool !== 'length') control.btnLength.click();
    control.draw.appendCoordinates([[0, 0], [100, 0]]);
    rightClick();
};

describe('a measurement that is made', () => {
    it('has an id and the next reference: each new one the next, and not the same twice', () => {
        drawLine();
        drawLine();
        const features = control.source.getFeatures();
        expect(refs()).toEqual(['1', '2']);
        expect(new Set(features.map(f => f.get('id'))).size).toBe(2);
        features.forEach(f => expect(f.get('id')).toBeTruthy());
    });

    it('takes its reference from the sequence of the file the host gives, which knows the refs of the other view', () => {
        sequence = new RefSequence();
        const distance = { type: 'Feature', geometry: null, properties: { measurementType: 'distance', id: 'd', ref: '5' } };
        // The counter an older file kept does not count
        sequence.observe({ metadata: { lastRef: 457 }, features: [distance] }, () => true);
        drawLine();
        expect(refs()).toEqual(['6']);
    });

    it('is 1 plus the highest reference: the one of a deleted annotation comes back only when it was the highest', () => {
        drawLine();
        drawLine();
        control.deleteMeasurement(control.source.getFeatures().find(f => f.get('ref') === '2'));
        drawLine();
        expect(refs()).toEqual(['1', '2']);
        control.deleteMeasurement(control.source.getFeatures().find(f => f.get('ref') === '1'));
        drawLine();
        expect(refs()).toEqual(['2', '3']);
    });

    // A file an older Hub saved: its contours were numbered up to 457, and the map shows them with those refs until
    // its next save takes them away
    it('does not count the reference of a contour line, and never gets one that is used', () => {
        const contour = new Feature(new LineString([[0, 0], [10, 0]]));
        contour.setProperties({ measurementType: 'contour', id: 'c1', ref: '457' });
        control.source.addFeature(contour);
        drawLine();
        const line = control.source.getFeatures().find(f => f.get('measurementType') === 'length');
        expect(line.get('ref')).toBe('1');
        expect(control.isRefTaken('1', line)).toBe(false);
        expect(control.isRefTaken('457', line)).toBe(false);
    });
});

describe('a point annotation that is drawn', () => {
    afterEach(() => vi.useRealTimers());

    it('gets its id and reference when it is typed, and its dialog opens as a new point; Discard gives the reference back', () => {
        vi.useFakeTimers();
        control.btnPoint.click();
        const feature = new Feature(new Point([0, 0]));
        control.source.addFeature(feature);
        control.draw.dispatchEvent({ type: 'drawend', feature });
        vi.advanceTimersByTime(20);
        expect(feature.get('measurementType')).toBe('point');
        expect(feature.get('id')).toBeTruthy();
        expect(feature.get('ref')).toBe('1');
        expect(dialogs.at(-1)).toMatchObject({ isNew: true, feature });

        dialogs.at(-1).onDiscard();
        const next = new Feature(new Point([5, 5]));
        control.source.addFeature(next);
        control.draw.dispatchEvent({ type: 'drawend', feature: next });
        vi.advanceTimersByTime(20);
        expect(next.get('ref')).toBe('1');
    });
});

describe('the reference of a point annotation just placed', () => {
    it('is given again to the next point when the first is discarded', () => {
        const point = () => {
            const f = new Feature(new Point([0, 0]));
            f.set('measurementType', 'point');
            control.source.addFeature(f);
            control.identify(f);
            return f;
        };
        const first = point();
        expect(first.get('ref')).toBe('1');
        control.openPropertiesDialog(first, { isNew: true });
        dialogs.at(-1).onDiscard();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(point().get('ref')).toBe('1');
    });

    it('is given again when the measurement that had it is deleted before it was saved', () => {
        const kept = new Feature(new Point([0, 0]));
        kept.set('measurementType', 'point');
        control.source.addFeature(kept);
        control.identify(kept);
        control.deleteMeasurement(kept);
        const next = new Feature(new Point([1, 1]));
        next.set('measurementType', 'point');
        control.source.addFeature(next);
        control.identify(next);
        expect(next.get('ref')).toBe('1');
    });

    it('is not kept when a second point is placed before its dialog was answered: only the second one stays', () => {
        vi.useFakeTimers();
        try {
            control.btnPoint.click();
            const place = at => {
                const feature = new Feature(new Point(at));
                control.source.addFeature(feature);
                control.draw.dispatchEvent({ type: 'drawend', feature });
                return feature;
            };
            // A double click: both points are placed before the first dialog opens
            const first = place([0, 0]);
            const second = place([1, 1]);
            vi.advanceTimersByTime(20);
            expect(control.source.getFeatures()).toEqual([second]);
            // Numbered once the first was gone: no gap
            expect(second.get('ref')).toBe('1');
            expect(dialogs.at(-1)).toMatchObject({ isNew: true, feature: second });
            expect(dialogs.at(-1).isRefTaken('1')).toBe(false);
            expect(first.get('ref')).toBe('1');
        } finally {
            vi.useRealTimers();
        }
    });

    it('stays when its dialog was saved, and a dialog of another measurement opens after it', () => {
        const point = new Feature(new Point([0, 0]));
        point.set('measurementType', 'point');
        control.source.addFeature(point);
        control.identify(point);
        control.openPropertiesDialog(point, { isNew: true });
        dialogs.at(-1).onSave({ name: 'Gate' });
        const line = new Feature(new LineString([[0, 0], [10, 0]]));
        line.setProperties({ measurementType: 'length', id: 'l1', ref: '2' });
        control.source.addFeature(line);
        control.openPropertiesDialog(line);
        expect(control.source.getFeatures()).toContain(point);
    });
});

describe('a measurement that another tool adds', () => {
    it('gets an id and a reference when it is added with a type and no id; one that has them keeps them', () => {
        const profile = new Feature(new LineString([[0, 0], [10, 0]]));
        profile.set('measurementType', 'profile');
        control.source.addFeature(profile);
        expect(profile.get('id')).toBeTruthy();
        expect(profile.get('ref')).toBe('1');

        const saved = new Feature(new LineString([[0, 0], [10, 0]]));
        saved.setProperties({ measurementType: 'length', id: 'kept-id' });
        control.source.addFeature(saved);
        expect(saved.get('id')).toBe('kept-id');
        expect(saved.get('ref')).toBeUndefined();

        // The sketch of a tool has no type yet
        control.source.addFeature(new Feature(new Point([5, 5])));
        expect(control.source.getFeatures().filter(f => f.get('ref'))).toHaveLength(1);
    });
});

describe('a file that was loaded', () => {
    const doc = () => read({
        type: 'FeatureCollection',
        metadata: { version: '2.0', kind: 'measurements', application: 'DroneDB Registry', views: {} },
        features: [{
            type: 'Feature', geometry: { type: 'LineString', coordinates: [[9.1, 45.1], [9.1005, 45.1005]] },
            properties: { measurementType: 'length', name: 'Fence', createdAt: '2026-01-01T00:00:00.000Z' }
        }]
    });

    it('has an id and no reference in the map, and does not make the map unsaved', () => {
        control.importFromGeoJSON(doc());
        control.markSaved();
        expect(control.isDirty()).toBe(false);
        const [feature] = control.source.getFeatures();
        expect(feature.get('id')).toMatch(/^[0-9a-f]{64}$/);
        expect(feature.get('ref')).toBeUndefined();
        expect(control.isSaved(feature.get('id'))).toBe(true);
    });

    it('is unsaved once a measurement is made, and saved again when the save is taken', () => {
        control.importFromGeoJSON(doc());
        control.markSaved();
        drawLine();
        expect(control.isDirty()).toBe(true);
        const id = control.source.getFeatures()[0].get('id');
        control.applyRefs({ [id]: '1', unknown: '9' });
        expect(control.source.getFeatures()[0].get('ref')).toBe('1');
        control.markSaved();
        expect(control.isDirty()).toBe(false);
    });

    it('takes the references a save wrote for its measurements, and renumbered ones', () => {
        const [a] = control.importFromGeoJSON(doc()).features;
        control.applyRefs({ [a.get('id')]: '4' });
        expect(a.get('ref')).toBe('4');
        control.applyRefs({ [a.get('id')]: '5' });
        expect(a.get('ref')).toBe('5');
        control.applyRefs();
        expect(a.get('ref')).toBe('5');
    });

    it('takes away the reference of a contour line after a save, and gives none to one', () => {
        const [a] = control.importFromGeoJSON(doc()).features;
        a.set('measurementType', 'contour');
        a.set('ref', '7');
        control.applyRefs({ [a.get('id')]: '8' });
        expect(a.get('ref')).toBeUndefined();
        const drawn = new Feature(new LineString([[0, 0], [5, 0]]));
        drawn.set('measurementType', 'contour');
        control.identify(drawn);
        expect(drawn.get('id')).toBeTruthy();
        expect(drawn.get('ref')).toBeUndefined();
    });
});

describe('the reference on the map', () => {
    const styleOf = feature => [control.createFeatureStyle(feature)].flat();
    const badge = feature => styleOf(feature).find(style => style.getText());
    const line = ref => {
        const f = new Feature(new LineString([[0, 0], [100, 0]]));
        f.setProperties({ measurementType: 'length', ...(ref ? { ref } : {}) });
        return f;
    };

    it('is a badge on each annotation that has one: on a line, an area and a point', () => {
        const area = new Feature(new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]));
        area.setProperties({ measurementType: 'area', ref: '2' });
        const point = new Feature(new Point([3, 4]));
        point.setProperties({ measurementType: 'point', ref: '3' });
        expect(badge(line('1')).getText().getText()).toBe('1');
        expect(badge(area).getText().getText()).toBe('2');
        expect(badge(point).getText().getText()).toBe('3');
        // On a line it is at its middle
        expect(badge(line('1')).getGeometry().getCoordinates()).toEqual([50, 0]);
    });

    it('is not drawn for an annotation without a reference, and is drawn with the style of an analysis overlay too', () => {
        expect(badge(line())).toBeUndefined();
        const profile = line('4');
        profile.set('measurementType', 'profile');
        expect(styleOf(profile)).toHaveLength(3);
        expect(badge(profile).getText().getText()).toBe('4');
    });

    it('is not drawn for a contour line, which is no annotation (one that an older Hub numbered)', () => {
        const contour = line('12');
        contour.set('measurementType', 'contour');
        expect(badge(contour)).toBeUndefined();
    });

    it('is on by default, and the button hides it and shows it again', () => {
        expect(control.showReferences).toBe(true);
        expect(control.btnReferences.getAttribute('aria-pressed')).toBe('true');
        control.btnReferences.click();
        expect(control.showReferences).toBe(false);
        expect(control.btnReferences.getAttribute('aria-pressed')).toBe('false');
        expect(badge(line('1'))).toBeUndefined();
        expect(control.createFeatureStyle(line('1'))).toBeInstanceOf(Style);
        control.btnReferences.click();
        expect(badge(line('1'))).toBeTruthy();
    });

    it('has a button in the manage toolbar once there is a measurement', () => {
        expect(control.btnReferences.style.display).toBe('none');
        drawLine();
        control.refreshButtons();
        expect(control.btnReferences.style.display).toBe('block');
        expect(control.btnReferences.getAttribute('aria-label')).toBe('Show References');
    });
});

describe('the properties dialog of an annotation', () => {
    const feature = () => {
        const f = new Feature(new LineString([[0, 0], [10, 0]]));
        f.setProperties({ measurementType: 'length', id: 'a', ref: '1', category: 'defect' });
        control.source.addFeature(f);
        return f;
    };

    it('is given the schema of the organization, the default one until it is known', () => {
        control.openPropertiesDialog(feature());
        expect(dialogs.at(-1).schema).toBe(DEFAULT_SCHEMA);
        const schema = { categories: [{ id: 'c', name: 'C', colour: '#000000' }], severities: [], statuses: [{ id: 's', name: 'S', closed: false }] };
        control.setAnnotationSchema(schema);
        control.openPropertiesDialog(feature());
        expect(dialogs.at(-1).schema).toBe(schema);
        control.setAnnotationSchema(null);
        expect(control.annotationSchema).toBe(DEFAULT_SCHEMA);
    });

    it('asks the control whether a reference is used by another measurement, and not by itself', () => {
        const a = feature();
        const b = new Feature(new LineString([[0, 0], [10, 0]]));
        b.setProperties({ measurementType: 'length', id: 'b', ref: '2' });
        control.source.addFeature(b);
        control.openPropertiesDialog(a);
        const { isRefTaken } = dialogs.at(-1);
        expect(isRefTaken('2')).toBe(true);
        expect(isRefTaken('1')).toBe(false);
        expect(isRefTaken('3')).toBe(false);
    });

    it('knows the references of the other view that the file had', () => {
        sequence = new RefSequence();
        sequence.observe({ metadata: {}, features: [{ properties: { id: 'c', ref: 'P-1', localCoordinates: [[0, 0, 0]] } }] }, f => !!f.properties.localCoordinates);
        expect(control.isRefTaken('P-1')).toBe(true);
    });

    it('saves the fields on the measurement, a cleared one removed', () => {
        const f = feature();
        control.openPropertiesDialog(f);
        dialogs.at(-1).onSave({ name: '', groupId: '', category: undefined, status: 'open', ref: '9', assignee: 'Anna' });
        expect(f.get('category')).toBeUndefined();
        expect(f.get('status')).toBe('open');
        expect(f.get('ref')).toBe('9');
        expect(f.get('assignee')).toBe('Anna');
    });

    it('has New group only when the host can make a group', () => {
        control.openPropertiesDialog(feature());
        expect(dialogs.at(-1).canCreateGroup).toBe(false);
        control.createGroup = vi.fn();
        control.openPropertiesDialog(feature());
        expect(dialogs.at(-1).canCreateGroup).toBe(true);
    });

    it('makes the group made in the dialog when the measurement is saved, and puts the measurement in it', () => {
        control.createGroup = vi.fn(() => 'g-new');
        const f = feature();
        control.openPropertiesDialog(f);
        dialogs.at(-1).onSave({ name: 'A', groupId: '', newGroup: { name: 'South', color: '#123456' } });
        expect(control.createGroup).toHaveBeenCalledExactlyOnceWith({ name: 'South', color: '#123456' });
        expect(f.get('groupId')).toBe('g-new');
        expect(f.get('newGroup')).toBeUndefined();
    });
});

describe('the list of measurements', () => {
    it('has the reference, category, severity and status of each, with the names of the schema ("Unknown" for an id it lacks)', () => {
        const f = new Feature(new LineString([[0, 0], [10, 0]]));
        f.setProperties({ measurementType: 'length', id: 'f', ref: '4', category: 'defect', severity: 'high', status: 'open' });
        const g = new Feature(new LineString([[0, 0], [10, 0]]));
        g.setProperties({ measurementType: 'length', id: 'g', category: 'gone' });
        control.source.addFeatures([f, g]);
        const list = control.getMeasurementsList();
        const first = list.find(m => m.ref === '4');
        const second = list.find(m => m.ref === '');
        expect(first).toMatchObject({ ref: '4', category: 'defect', categoryLabel: 'Defect', severity: 'high', severityLabel: 'High', status: 'open', statusLabel: 'Open' });
        expect(second).toMatchObject({ ref: '', category: 'gone', categoryLabel: 'Unknown (gone)', status: '', statusLabel: '' });
    });
});

/**
 * Guards of the measure control: the keys of edit mode leave the fields of a dialog alone, the eraser deletes the one
 * measurement it points at (not a hidden one, not every one under the click), a measurement is degenerate below 1 cm
 * or 1 cm2, and what a read gave is the file's until the map changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { LineString, Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import MeasureControls, { isDegenerateMeasurement } from './measureControl';
import { isTypingTarget } from './typingTarget';
import { _resetPrefListenersForTests } from '@/libs/preferences';

let control;
let map;

const polygonAt = (id, [x, y], groupId) => {
    const f = new Feature(new Polygon([[[x, y], [x + 50, y], [x + 50, y + 50], [x, y + 50], [x, y]]]));
    f.setProperties({ id, measurementType: 'area', groupId });
    return f;
};

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    control = new MeasureControls({});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [0, 0], resolution: 1 }) });
    map.setSize([400, 300]);
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
    document.body.innerHTML = '';
    _resetPrefListenersForTests();
});

describe('the keys of edit mode', () => {
    const key = (target, init) => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    };

    it('leave Ctrl+Z and Escape to a text field of a dialog', () => {
        control.enableEditMode(map);
        const undo = vi.spyOn(control, 'undo');
        const field = document.body.appendChild(document.createElement('input'));
        const area = document.body.appendChild(document.createElement('textarea'));
        for (const target of [field, area]) {
            const z = key(target, { key: 'z', ctrlKey: true });
            const esc = key(target, { key: 'Escape' });
            expect(z.defaultPrevented).toBe(false);
            expect(esc.defaultPrevented).toBe(false);
        }
        expect(undo).not.toHaveBeenCalled();
        expect(control.isEditMode).toBe(true);
    });

    it('still undo and leave edit mode from the map', () => {
        control.enableEditMode(map);
        const undo = vi.spyOn(control, 'undo').mockImplementation(() => {});
        key(document.body, { key: 'z', ctrlKey: true });
        expect(undo).toHaveBeenCalledTimes(1);
        key(document.body, { key: 'Escape' });
        expect(control.isEditMode).toBe(false);
    });
});

describe('isTypingTarget', () => {
    it('is true inside a field, a select or an editable element, false elsewhere', () => {
        const make = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
        expect(isTypingTarget(make('<input>'))).toBe(true);
        expect(isTypingTarget(make('<div contenteditable="true"><span>x</span></div>').firstElementChild)).toBe(true);
        expect(isTypingTarget(make('<select></select>'))).toBe(true);
        expect(isTypingTarget(make('<button></button>'))).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
        expect(isTypingTarget(document)).toBe(false);
    });
});

describe('the eraser', () => {
    it('deletes the measurement the pointer is on, and no other that contains the click', () => {
        const small = polygonAt('small', [0, 0]);
        const big = polygonAt('big', [-100, -100]);
        control.source.addFeatures([small, big]);
        vi.spyOn(control, '_measurementAt').mockReturnValue(small);
        const erased = control.eraseAt(map, [10, 10]);
        expect(erased).toBe(small);
        expect(control.source.getFeatures()).toEqual([big]);
    });

    it('does not delete a measurement of a hidden group, drawn or not', () => {
        const hidden = polygonAt('hidden', [0, 0], 'g1');
        control.source.addFeature(hidden);
        control.setGroupVisibility('g1', false);
        expect(control.isFeatureVisible(hidden)).toBe(false);
        vi.spyOn(control, '_measurementAt').mockReturnValue(hidden);
        expect(control.eraseAt(map, [10, 10])).toBeNull();
        expect(control.source.getFeatures()).toEqual([hidden]);
    });

    it('deletes nothing when nothing is under the pointer', () => {
        const far = polygonAt('far', [100, 100]);
        control.source.addFeature(far);
        vi.spyOn(control, '_measurementAt').mockReturnValue(null);
        expect(control.eraseAt(map, [10, 10])).toBeNull();
        expect(control.source.getFeatures()).toEqual([far]);
    });

    it('asks for the measurement at the pixel of the click', () => {
        const at = vi.spyOn(control, '_measurementAt').mockReturnValue(null);
        control.eraseAt(map, [10, 10]);
        expect(at).toHaveBeenCalledWith(map, map.getPixelFromCoordinate([10, 10]));
    });
});

describe('isDegenerateMeasurement', () => {
    const metres = (w, h) => {
        // A rectangle of about w x h metres at the equator, in Web Mercator
        const [x, y] = fromLonLat([9, 0]);
        return new Polygon([[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]);
    };

    it('keeps a 5 cm x 5 cm area (25 cm2), which an earlier limit of 100 cm2 threw away silently', () => {
        expect(isDegenerateMeasurement(metres(0.05, 0.05))).toBe(false);
    });

    it('drops an area below 1 cm2 and a line below 1 cm', () => {
        expect(isDegenerateMeasurement(metres(0.005, 0.005))).toBe(true);
        const [x, y] = fromLonLat([9, 0]);
        expect(isDegenerateMeasurement(new LineString([[x, y], [x + 0.005, y]]))).toBe(true);
        expect(isDegenerateMeasurement(new LineString([[x, y], [x + 0.5, y]]))).toBe(false);
    });
});

describe('the snapshot of what a read gave', () => {
    it('leaves out what was drawn since: that is not in the file', () => {
        const fromFile = polygonAt('file', [0, 0]);
        control.source.addFeature(fromFile);
        const only = new Set([fromFile]);
        control.markSaved(control.snapshot(only));
        expect(control.isDirty()).toBe(false);
        control.source.addFeature(polygonAt('drawn', [100, 100]));
        expect(control.isDirty()).toBe(true);
        // The snapshot of the file alone is still the saved one
        expect(control.snapshot(only)).toBe(control._savedSnapshot);
    });

    it('is the saved state given to markSaved when the map changed since it was exported', () => {
        const a = polygonAt('a', [0, 0]);
        control.source.addFeature(a);
        const exported = control.snapshot();
        a.set('name', 'edited while saving');
        control.markSaved(exported);
        expect(control.isDirty()).toBe(true);
        control.markSaved();
        expect(control.isDirty()).toBe(false);
    });
});

describe('clearing the map', () => {
    const foreign = { type: 'Feature', geometry: null, properties: { id: 'k1', name: 'note' } };
    const load = () => control.importFromGeoJSON({ type: 'FeatureCollection', features: [foreign] });

    it('keeps the features it cannot draw through Clear all, and lets go of them when another file is shown', () => {
        load();
        expect(control.carried).toEqual([foreign]);
        expect(control.exportToGeoJSON('ortho.tif').features).toContainEqual(foreign);
        control.confirmClearAll();
        expect(control.exportToGeoJSON('ortho.tif').features).toContainEqual(foreign);
        control.clearAllMeasurements();
        expect(control.exportToGeoJSON('ortho.tif').features).toEqual([]);
    });
});

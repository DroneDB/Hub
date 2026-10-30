/**
 * The management buttons follow the map and the saved file: Save makes the file match the
 * map, so it stays while a saved file exists, and Delete saved stays until the file is gone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import MeasureControls from './measureControl';

let control;
let map;

const line = () => {
    const f = new Feature(new LineString([[0, 0], [100, 0]]));
    f.set('measurementType', 'length');
    f.set('createdAt', '2026-10-30T10:00:00.000Z');
    return f;
};
const shown = btn => btn.style.display === 'block';

beforeEach(() => {
    control = new MeasureControls({});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

describe('MeasureControls buttons', () => {
    it('keeps Save and Delete saved when the last measurement of a saved file is deleted', () => {
        const f = line();
        control.source.addFeature(f);
        control.setSavedState(true);
        control.deleteMeasurement(f);
        expect(shown(control.btnSave)).toBe(true);
        expect(shown(control.btnDelete)).toBe(true);
        expect(control.toolbar2.style.display).toBe('block');
        expect(shown(control.btnList)).toBe(false);
        expect(shown(control.btnExport)).toBe(false);
    });

    it('keeps Save and Delete saved after Clear all', () => {
        control.source.addFeature(line());
        control.setSavedState(true);
        control.clearAllMeasurements();
        expect(shown(control.btnSave)).toBe(true);
        expect(shown(control.btnDelete)).toBe(true);
    });

    it('hides everything with nothing on the map and no file', () => {
        control.setSavedState(false);
        expect(control.toolbar2.style.display).toBe('none');
        expect(shown(control.btnSave)).toBe(false);
        expect(shown(control.btnDelete)).toBe(false);
    });

    it('an import does not make the measurements saved', () => {
        control.importFromGeoJSON({ type: 'FeatureCollection', features: [] });
        expect(control.hasSaved).toBe(false);
    });

    it('follows the permissions', () => {
        const readOnly = new MeasureControls({ canWrite: false, canDelete: false });
        readOnly.source.addFeature(line());
        readOnly.setSavedState(true);
        expect(shown(readOnly.btnSave)).toBe(false);
        expect(shown(readOnly.btnDelete)).toBe(false);
    });

    it('tells unsaved changes from the saved measurements', () => {
        const f = line();
        control.source.addFeature(f);
        control.markSaved();
        expect(control.isDirty()).toBe(false);
        f.set('name', 'Fence');
        expect(control.isDirty()).toBe(true);
        control.markSaved();
        control.deleteMeasurement(f);
        expect(control.isDirty()).toBe(true);
    });
});

/**
 * The measure control follows the measurement unit preference while it is on a map
 * (the Preferences page, another tab, the account) and stops when it leaves it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import MeasureControls from './measureControl';
import { PREF, setPref, applyAccountValue, onPrefChange, _resetPrefListenersForTests } from '@/libs/preferences';

let control;
let map;
let events;
let off;

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    events = [];
    off = onPrefChange((key, value, origin) => events.push({ key, origin }));
    control = new MeasureControls({});
    vi.spyOn(control, 'updateMeasurementValue').mockImplementation(() => {});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target });
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
    off();
    _resetPrefListenersForTests();
    vi.restoreAllMocks();
});

const localMeasureWrites = () => events.filter(e => e.key === PREF.MEASURE_UNIT && e.origin === 'local');

describe('MeasureControls unit preference', () => {
    it('starts from the stored unit', () => {
        expect(control.unitPref).toBe('metric');
        setPref(PREF.MEASURE_UNIT, 'imperial');
        expect(new MeasureControls({}).unitPref).toBe('imperial');
    });

    it.each([
        ['an account change', () => applyAccountValue(PREF.MEASURE_UNIT, 'imperial')],
        ['a change of another tab', () => {
            localStorage.setItem(PREF.MEASURE_UNIT, 'imperial');
            window.dispatchEvent(new StorageEvent('storage', { key: PREF.MEASURE_UNIT, storageArea: localStorage }));
        }],
        ['a change of the Preferences page (a local write of another view)', () => setPref(PREF.MEASURE_UNIT, 'imperial')]
    ])('%s changes the unit and recalculates the tooltips', (_name, change) => {
        control.setMap(map);
        control.source.getFeatures = () => [{}, {}];
        events.length = 0;
        change();
        expect(control.unitPref).toBe('imperial');
        expect(control.updateMeasurementValue).toHaveBeenCalledTimes(2);
    });

    it('an external change does not write the preference back', () => {
        control.setMap(map);
        applyAccountValue(PREF.MEASURE_UNIT, 'imperial');
        expect(localMeasureWrites()).toHaveLength(0);
        expect(events.filter(e => e.origin === 'account')).toHaveLength(1);
    });

    it('a removal of the preference puts the default unit back without writing', () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        control.setMap(map);
        control.showUnit('imperial');
        events.length = 0;
        applyAccountValue(PREF.MEASURE_UNIT, null);
        expect(control.unitPref).toBe('metric');
        expect(localMeasureWrites()).toHaveLength(0);
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBeNull();
    });

    it('the control\'s own unit change is stored once and not recalculated twice', () => {
        control.setMap(map);
        control.source.getFeatures = () => [{}];
        control.applyUnitsChange('imperial');
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBe('imperial');
        expect(localMeasureWrites()).toHaveLength(1);
        expect(control.updateMeasurementValue).toHaveBeenCalledTimes(1);
    });

    it('ignores other preferences', () => {
        control.setMap(map);
        control.source.getFeatures = () => [{}];
        applyAccountValue(PREF.BASEMAP, 'osm');
        expect(control.updateMeasurementValue).not.toHaveBeenCalled();
    });

    it('does not follow before it is on a map, nor after it leaves it', () => {
        applyAccountValue(PREF.MEASURE_UNIT, 'imperial');
        expect(control.unitPref).toBe('metric');
        control.setMap(map);
        control.setMap(null);
        applyAccountValue(PREF.MEASURE_UNIT, 'metric');
        expect(control.unitPref).toBe('metric');
        control.setMap(map);
        control.setMap(null);
        control.setMap(map);
        // one subscription at a time: re-adding to a map does not stack listeners
        control.source.getFeatures = () => [{}];
        applyAccountValue(PREF.MEASURE_UNIT, 'imperial');
        expect(control.updateMeasurementValue).toHaveBeenCalledTimes(1);
    });
});

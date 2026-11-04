import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getDatasetTablePreferences, saveDatasetTablePreferences, followDatasetTablePreferences,
    getOpenAfterCreatePreference, saveOpenAfterCreatePreference,
    getOrgPageSettings, saveOrgPageSettings, followOrgPageSettings, getOrgPagePosition, saveOrgPagePosition, orgPageChoice
} from './storageUtils';
import { PREF, setPref, applyAccountValue, onPrefChange, _resetPrefListenersForTests } from './preferences';

let events;
let off;
beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    events = [];
    off = onPrefChange((key, value, origin) => events.push({ key, value, origin }));
});
afterEach(() => { off(); _resetPrefListenersForTests(); });

const ORG_DEFAULTS = { itemsPerPage: 10, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc', view: 'list' };

describe('organisation page settings and position', () => {
    it('defaults when nothing is stored', () => {
        expect(getOrgPageSettings()).toEqual(ORG_DEFAULTS);
        expect(getOrgPagePosition()).toEqual({ currentPage: undefined, scrollTop: undefined });
    });

    it('reads an old combined value as settings and as position', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 25, ownedOnly: false });
        expect(getOrgPagePosition()).toEqual({ currentPage: 3, scrollTop: 120 });
    });

    it('a stored position wins over the position inside an old combined value', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        localStorage.setItem(PREF.ORG_PAGE_POSITION, JSON.stringify({ currentPage: 7, scrollTop: 1 }));
        expect(getOrgPagePosition()).toEqual({ currentPage: 7, scrollTop: 1 });
    });

    it('saving values equal to the stored ones writes nothing', () => {
        saveOrgPageSettings({ itemsPerPage: 25, ownedOnly: false });
        events.length = 0;
        saveOrgPageSettings({ itemsPerPage: 25, ownedOnly: false });
        expect(events).toEqual([]);
    });

    it('saving the defaults over nothing stored writes nothing (a page that only read them)', () => {
        saveOrgPageSettings(ORG_DEFAULTS);
        expect(localStorage.getItem(PREF.ORG_PAGE)).toBeNull();
        expect(events).toEqual([]);
    });

    it('saving a changed value writes every setting, as local', () => {
        saveOrgPageSettings({ itemsPerPage: 50 });
        const expected = { ...ORG_DEFAULTS, itemsPerPage: 50 };
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual(expected);
        expect(events).toEqual([{ key: PREF.ORG_PAGE, value: expected, origin: 'local' }]);
    });

    it('saving the sort keeps the other settings, the view included', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, view: 'map' }));
        saveOrgPageSettings({ sortColumn: 'lastModified', sortDirection: 'desc' });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({
            itemsPerPage: 25, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc', view: 'map'
        });
    });

    it('saving the settings over an old combined value rewrites it without the position', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        saveOrgPageSettings({ itemsPerPage: 50 });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 50, ownedOnly: false });
    });

    it('saving the position writes only ORG_PAGE_POSITION', () => {
        saveOrgPageSettings({ itemsPerPage: 25, ownedOnly: false });
        events.length = 0;
        const before = localStorage.getItem(PREF.ORG_PAGE);
        saveOrgPagePosition(4, 300);
        expect(localStorage.getItem(PREF.ORG_PAGE)).toBe(before);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE_POSITION))).toEqual({ currentPage: 4, scrollTop: 300 });
        expect(events.map(e => e.key)).toEqual([PREF.ORG_PAGE_POSITION]);
    });

    it('ignores fields of the wrong type', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 'many', ownedOnly: 'yes', sortColumn: 3, view: false }));
        expect(getOrgPageSettings()).toEqual(ORG_DEFAULTS);
        localStorage.setItem(PREF.ORG_PAGE, '[1,2]');
        expect(getOrgPageSettings()).toEqual(ORG_DEFAULTS);
    });

    it('a sort column, direction or view the list does not know reads as the default', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'size', sortDirection: 'sideways', view: 'globe', itemsPerPage: 25 }));
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 25 });
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'datasetCount', sortDirection: 'desc', view: 'map' }));
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, sortColumn: 'datasetCount', sortDirection: 'desc', view: 'map' });
    });

    it('orgPageChoice accepts the values of the list and gives the default for others', () => {
        expect(orgPageChoice('sortColumn', 'creationDate')).toBe('creationDate');
        expect(orgPageChoice('sortColumn', 'entries')).toBe('name');
        expect(orgPageChoice('sortDirection', 'desc')).toBe('desc');
        expect(orgPageChoice('sortDirection', undefined)).toBe('asc');
        expect(orgPageChoice('view', 'map')).toBe('map');
        expect(orgPageChoice('view', 'grid')).toBe('list');
    });

    it('follow* calls back with the settings after an account change, and stops after the unsubscribe', () => {
        const apply = vi.fn();
        const stop = followOrgPageSettings(apply);
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 100, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc' });
        expect(apply).toHaveBeenCalledWith({ ...ORG_DEFAULTS, itemsPerPage: 100, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc' });
        applyAccountValue(PREF.ORG_PAGE, null);
        expect(apply).toHaveBeenLastCalledWith(ORG_DEFAULTS);
        apply.mockClear();
        setPref(PREF.MEASURE_UNIT, 'imperial'); // another key
        expect(apply).not.toHaveBeenCalled();
        stop();
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 5, ownedOnly: true });
        expect(apply).not.toHaveBeenCalled();
    });
});

describe('dataset table preferences', () => {
    const DEFAULTS = { sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10, view: 'list' };

    it('returns the defaults over a partial stored value', () => {
        expect(getDatasetTablePreferences()).toEqual(DEFAULTS);
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 50 }));
        expect(getDatasetTablePreferences()).toEqual({ ...DEFAULTS, itemsPerPage: 50 });
    });

    it('takes the stored view only when it is one of the views', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view: 'map' }));
        expect(getDatasetTablePreferences().view).toBe('map');
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view: 'globe' }));
        expect(getDatasetTablePreferences().view).toBe('list');
    });

    it('saving what is already effective writes nothing', () => {
        saveDatasetTablePreferences({ sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10 });
        expect(events).toEqual([]);
        saveDatasetTablePreferences({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25 });
        expect(events).toHaveLength(1);
        events.length = 0;
        saveDatasetTablePreferences({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25 });
        expect(events).toEqual([]);
    });

    it('saving one setting keeps the others, the view included', () => {
        saveDatasetTablePreferences({ view: 'map' });
        saveDatasetTablePreferences({ sortColumn: 'size' });
        expect(getDatasetTablePreferences()).toEqual({ ...DEFAULTS, sortColumn: 'size', view: 'map' });
    });

    it('follows changes', () => {
        const apply = vi.fn();
        const stop = followDatasetTablePreferences(apply);
        applyAccountValue(PREF.DATASET_TABLE, { sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25, view: 'map' });
        expect(apply).toHaveBeenCalledWith({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25, view: 'map' });
        stop();
    });
});

describe('open dataset after create', () => {
    it('is false by default and round-trips', () => {
        expect(getOpenAfterCreatePreference()).toBe(false);
        saveOpenAfterCreatePreference(true);
        expect(getOpenAfterCreatePreference()).toBe(true);
        saveOpenAfterCreatePreference(false);
        expect(getOpenAfterCreatePreference()).toBe(false);
    });

    it('only the boolean true opens', () => {
        localStorage.setItem(PREF.OPEN_AFTER_CREATE, '"true"');
        expect(getOpenAfterCreatePreference()).toBe(false);
    });
});

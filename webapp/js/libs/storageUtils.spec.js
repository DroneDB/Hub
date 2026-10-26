import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getDatasetTablePreferences, saveDatasetTablePreferences, followDatasetTablePreferences,
    getOpenAfterCreatePreference, saveOpenAfterCreatePreference,
    getOrgPageSettings, saveOrgPageSettings, followOrgPageSettings, getOrgPagePosition, saveOrgPagePosition
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

describe('organisation page settings and position', () => {
    it('defaults when nothing is stored', () => {
        expect(getOrgPageSettings()).toEqual({ itemsPerPage: 10, ownedOnly: true });
        expect(getOrgPagePosition()).toEqual({ currentPage: undefined, scrollTop: undefined });
    });

    it('reads an old combined value as settings and as position', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        expect(getOrgPageSettings()).toEqual({ itemsPerPage: 25, ownedOnly: false });
        expect(getOrgPagePosition()).toEqual({ currentPage: 3, scrollTop: 120 });
    });

    it('a stored position wins over the position inside an old combined value', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        localStorage.setItem(PREF.ORG_PAGE_POSITION, JSON.stringify({ currentPage: 7, scrollTop: 1 }));
        expect(getOrgPagePosition()).toEqual({ currentPage: 7, scrollTop: 1 });
    });

    it('saving values equal to the stored ones writes nothing', () => {
        saveOrgPageSettings(25, false);
        events.length = 0;
        saveOrgPageSettings(25, false);
        expect(events).toEqual([]);
    });

    it('saving the defaults over nothing stored writes nothing (a page that only read them)', () => {
        saveOrgPageSettings(10, true);
        expect(localStorage.getItem(PREF.ORG_PAGE)).toBeNull();
        expect(events).toEqual([]);
    });

    it('saving a changed value writes {itemsPerPage, ownedOnly} only, as local', () => {
        saveOrgPageSettings(50, true);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({ itemsPerPage: 50, ownedOnly: true });
        expect(events).toEqual([{ key: PREF.ORG_PAGE, value: { itemsPerPage: 50, ownedOnly: true }, origin: 'local' }]);
    });

    it('saving the settings over an old combined value rewrites it without the position', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        saveOrgPageSettings(50, false);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({ itemsPerPage: 50, ownedOnly: false });
    });

    it('saving the position writes only ORG_PAGE_POSITION', () => {
        saveOrgPageSettings(25, false);
        events.length = 0;
        const before = localStorage.getItem(PREF.ORG_PAGE);
        saveOrgPagePosition(4, 300);
        expect(localStorage.getItem(PREF.ORG_PAGE)).toBe(before);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE_POSITION))).toEqual({ currentPage: 4, scrollTop: 300 });
        expect(events.map(e => e.key)).toEqual([PREF.ORG_PAGE_POSITION]);
    });

    it('ignores fields of the wrong type', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 'many', ownedOnly: 'yes' }));
        expect(getOrgPageSettings()).toEqual({ itemsPerPage: 10, ownedOnly: true });
        localStorage.setItem(PREF.ORG_PAGE, '[1,2]');
        expect(getOrgPageSettings()).toEqual({ itemsPerPage: 10, ownedOnly: true });
    });

    it('follow* calls back with the settings after an account change, and stops after the unsubscribe', () => {
        const apply = vi.fn();
        const stop = followOrgPageSettings(apply);
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 100, ownedOnly: false });
        expect(apply).toHaveBeenCalledWith({ itemsPerPage: 100, ownedOnly: false });
        applyAccountValue(PREF.ORG_PAGE, null);
        expect(apply).toHaveBeenLastCalledWith({ itemsPerPage: 10, ownedOnly: true });
        apply.mockClear();
        setPref(PREF.MEASURE_UNIT, 'imperial'); // another key
        expect(apply).not.toHaveBeenCalled();
        stop();
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 5, ownedOnly: true });
        expect(apply).not.toHaveBeenCalled();
    });
});

describe('dataset table preferences', () => {
    it('returns the defaults over a partial stored value', () => {
        expect(getDatasetTablePreferences()).toEqual({ sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10 });
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 50 }));
        expect(getDatasetTablePreferences()).toEqual({ sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 50 });
    });

    it('saving what is already effective writes nothing', () => {
        saveDatasetTablePreferences('name', 'asc', 10);
        expect(events).toEqual([]);
        saveDatasetTablePreferences('size', 'desc', 25);
        expect(events).toHaveLength(1);
        events.length = 0;
        saveDatasetTablePreferences('size', 'desc', 25);
        expect(events).toEqual([]);
    });

    it('follows changes', () => {
        const apply = vi.fn();
        const stop = followDatasetTablePreferences(apply);
        applyAccountValue(PREF.DATASET_TABLE, { sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25 });
        expect(apply).toHaveBeenCalledWith({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25 });
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getDatasetTablePreferences, saveDatasetTablePreferences, followDatasetTablePreferences,
    getOpenAfterCreatePreference, saveOpenAfterCreatePreference,
    getOrgPageSettings, saveOrgPageSettings, followOrgPageSettings, getOrgPagePosition, saveOrgPagePosition, orgPageChoice,
    getAdminPageSize, saveAdminPageSize
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

const ORG_DEFAULTS = { itemsPerPage: null, pageSizeChosen: false, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc', view: 'list' };

describe('organisation page settings and position', () => {
    it('defaults when nothing is stored', () => {
        expect(getOrgPageSettings()).toEqual(ORG_DEFAULTS);
        expect(getOrgPagePosition()).toEqual({ currentPage: undefined, scrollTop: undefined });
    });

    it('reads an old combined value as settings and as position (its page size of 25, without the mark, as chosen)', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 25, pageSizeChosen: true, ownedOnly: false });
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
        const expected = { ...ORG_DEFAULTS, itemsPerPage: 50, pageSizeChosen: true };
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual(expected);
        expect(events).toEqual([{ key: PREF.ORG_PAGE, value: expected, origin: 'local' }]);
    });

    it('saving the sort keeps the other settings, the view included', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true, ownedOnly: false, view: 'map' }));
        saveOrgPageSettings({ sortColumn: 'lastModified', sortDirection: 'desc' });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({
            itemsPerPage: 25, pageSizeChosen: true, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc', view: 'map'
        });
    });

    it('saving the settings over an old combined value rewrites it without the position', () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 3, scrollTop: 120 }));
        saveOrgPageSettings({ itemsPerPage: 50 });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 50, pageSizeChosen: true, ownedOnly: false });
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
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'size', sortDirection: 'sideways', view: 'globe', itemsPerPage: 25, pageSizeChosen: true }));
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 25, pageSizeChosen: true });
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
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 100, pageSizeChosen: true, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc' });
        expect(apply).toHaveBeenCalledWith({ ...ORG_DEFAULTS, itemsPerPage: 100, pageSizeChosen: true, ownedOnly: false, sortColumn: 'lastModified', sortDirection: 'desc' });
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
    const DEFAULTS = { sortColumn: 'name', sortDirection: 'asc', itemsPerPage: null, pageSizeChosen: false, view: 'list' };

    it('returns the defaults over a partial stored value', () => {
        expect(getDatasetTablePreferences()).toEqual(DEFAULTS);
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 50, pageSizeChosen: true }));
        expect(getDatasetTablePreferences()).toEqual({ ...DEFAULTS, itemsPerPage: 50, pageSizeChosen: true });
    });

    it('takes the stored view only when it is one of the views', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view: 'map' }));
        expect(getDatasetTablePreferences().view).toBe('map');
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view: 'globe' }));
        expect(getDatasetTablePreferences().view).toBe('list');
    });

    it('saving what is already effective writes nothing', () => {
        saveDatasetTablePreferences({ sortColumn: 'name', sortDirection: 'asc', itemsPerPage: null });
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
        applyAccountValue(PREF.DATASET_TABLE, { sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25, pageSizeChosen: true, view: 'map' });
        expect(apply).toHaveBeenCalledWith({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25, pageSizeChosen: true, view: 'map' });
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

describe('the page size the user chose (FR-XC-34)', () => {
    it('is none until the user chooses one: the sort changes store no size', () => {
        saveDatasetTablePreferences({ sortColumn: 'size' });
        expect(JSON.parse(localStorage.getItem(PREF.DATASET_TABLE)).itemsPerPage).toBeNull();
        saveOrgPageSettings({ view: 'map' });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE)).itemsPerPage).toBeNull();
    });

    it('reads a whole number of rows from 1 to 100, and a stored value that is not one as none', () => {
        for (const [stored, read] of [[25, 25], [100, 100], [1, 1], [0, null], [101, null], [2.5, null], ['25', null], [false, null], [-10, null]]) {
            localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: stored, pageSizeChosen: true }));
            expect(getDatasetTablePreferences().itemsPerPage).toBe(read);
        }
    });

    it('is kept for each admin list apart, and forgotten with null', () => {
        expect(getAdminPageSize(PREF.ADMIN_USERS)).toBeNull();
        saveAdminPageSize(PREF.ADMIN_USERS, 25);
        saveAdminPageSize(PREF.ADMIN_TASKS, 50);
        expect(getAdminPageSize(PREF.ADMIN_USERS)).toBe(25);
        expect(getAdminPageSize(PREF.ADMIN_TASKS)).toBe(50);
        expect(JSON.parse(localStorage.getItem(PREF.ADMIN_USERS))).toEqual({ itemsPerPage: 25, pageSizeChosen: true });
        saveAdminPageSize(PREF.ADMIN_USERS, null);
        expect(getAdminPageSize(PREF.ADMIN_USERS)).toBeNull();
        expect(getAdminPageSize(PREF.ADMIN_TASKS)).toBe(50);
    });

    it('reads the 10 that an older Hub stored with the other settings (no mark) as no choice, for both lists', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 10, sortColumn: 'x' }));
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, sortColumn: 'name', ownedOnly: false }));
        expect(getDatasetTablePreferences()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false, sortColumn: 'x' });
        expect(getOrgPageSettings()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false, ownedOnly: false });
        // A mark that is not true is no mark either
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: 'yes' }));
        expect(getDatasetTablePreferences().itemsPerPage).toBeNull();
    });

    it('reads a 10 stored with the mark as chosen', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: true }));
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: true }));
        expect(getDatasetTablePreferences().itemsPerPage).toBe(10);
        expect(getOrgPageSettings().itemsPerPage).toBe(10);
    });

    it('stores the mark with a size, and takes it away with the size; another change rewrites an old 10 as none', () => {
        saveDatasetTablePreferences({ itemsPerPage: 10 });
        expect(JSON.parse(localStorage.getItem(PREF.DATASET_TABLE))).toMatchObject({ itemsPerPage: 10, pageSizeChosen: true });
        saveDatasetTablePreferences({ itemsPerPage: null });
        expect(JSON.parse(localStorage.getItem(PREF.DATASET_TABLE))).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, sortColumn: 'name' }));
        saveOrgPageSettings({ sortColumn: 'lastModified' });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toMatchObject({ itemsPerPage: null, pageSizeChosen: false, sortColumn: 'lastModified' });
    });

    it('keeps any other size that an older Hub stored (no mark) as chosen, for every list', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, sortColumn: 'size' }));
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 50, ownedOnly: false }));
        localStorage.setItem(PREF.ADMIN_USERS, JSON.stringify({ itemsPerPage: 5 }));
        expect(getDatasetTablePreferences()).toEqual({ sortColumn: 'size', sortDirection: 'asc', itemsPerPage: 25, pageSizeChosen: true, view: 'list' });
        expect(getOrgPageSettings()).toEqual({ ...ORG_DEFAULTS, itemsPerPage: 50, pageSizeChosen: true, ownedOnly: false });
        expect(getAdminPageSize(PREF.ADMIN_USERS)).toBe(5);
        // Not a page size: none, as with the mark
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 250 }));
        expect(getDatasetTablePreferences()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('a sort change writes an old unmarked 25 back as chosen, with the mark', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, sortColumn: 'name' }));
        saveDatasetTablePreferences({ sortColumn: 'size', sortDirection: 'desc' });
        expect(JSON.parse(localStorage.getItem(PREF.DATASET_TABLE)))
            .toEqual({ sortColumn: 'size', sortDirection: 'desc', itemsPerPage: 25, pageSizeChosen: true, view: 'list' });
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false }));
        saveOrgPageSettings({ sortColumn: 'lastModified' });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE)))
            .toEqual({ ...ORG_DEFAULTS, itemsPerPage: 25, pageSizeChosen: true, ownedOnly: false, sortColumn: 'lastModified' });
    });

    it('reads the mark as stored: false is none whatever the size, true keeps a 10', () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: false }));
        expect(getDatasetTablePreferences()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: true }));
        expect(getOrgPageSettings()).toMatchObject({ itemsPerPage: 10, pageSizeChosen: true });
    });

    it('reads an account copy of an older Hub (no mark) by the same rule', () => {
        const apply = vi.fn();
        const stop = followOrgPageSettings(apply);
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 25, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc' });
        expect(apply).toHaveBeenLastCalledWith({ ...ORG_DEFAULTS, itemsPerPage: 25, pageSizeChosen: true });
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc' });
        expect(apply).toHaveBeenLastCalledWith(ORG_DEFAULTS);
        applyAccountValue(PREF.DATASET_TABLE, { itemsPerPage: 50, sortColumn: 'size' });
        expect(getDatasetTablePreferences()).toMatchObject({ itemsPerPage: 50, pageSizeChosen: true, sortColumn: 'size' });
        stop();
    });

    it('writes nothing for no size over nothing stored (a page that only read it)', () => {
        saveAdminPageSize(PREF.ADMIN_TASKS, null);
        expect(events).toEqual([]);
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    PREF, ACCOUNT_SECTIONS, PREF_DEFAULTS, onPrefChange, applyAccountValue, setPref, removePref, getPref,
    _resetPrefListenersForTests
} from './preferences';

const KEY = PREF.MEASURE_UNIT;
let listener;
let off;

/** What another tab does: writes the storage behind this tab's back, then the browser fires the event here. */
function otherTabWrites(key, text, area = window.localStorage) {
    if (text === null) area.removeItem(key); else area.setItem(key, text);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: text, storageArea: area }));
}

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    sessionStorage.clear();
    listener = vi.fn();
    off = onPrefChange(listener);
});
afterEach(() => _resetPrefListenersForTests());

describe('onPrefChange: local writes', () => {
    it('fires once per real change with origin local', () => {
        setPref(KEY, 'imperial');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(KEY, 'imperial', 'local');
        setPref(KEY, 'metric');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('does not fire for a write of the same text, strings or JSON', () => {
        setPref(KEY, 'imperial');
        setPref(PREF.SHOW_FLIGHT_PATH, false);
        listener.mockClear();
        setPref(KEY, 'imperial');
        setPref(PREF.SHOW_FLIGHT_PATH, false);
        expect(listener).not.toHaveBeenCalled();
    });

    it('fires with null for removePref of a stored value and not for a missing one', () => {
        setPref(KEY, 'imperial');
        listener.mockClear();
        removePref(KEY);
        expect(listener).toHaveBeenCalledWith(KEY, null, 'local');
        removePref(KEY);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not fire for session writes', () => {
        setPref(KEY, 'imperial', { session: true });
        removePref(KEY, { session: true });
        expect(listener).not.toHaveBeenCalled();
    });

    it('stops after the unsubscribe, and other listeners keep working', () => {
        const other = vi.fn();
        onPrefChange(other);
        off();
        setPref(KEY, 'imperial');
        expect(listener).not.toHaveBeenCalled();
        expect(other).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not stop the others', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        onPrefChange(() => { throw new Error('boom'); });
        const last = vi.fn();
        onPrefChange(last);
        setPref(KEY, 'imperial');
        expect(last).toHaveBeenCalledTimes(1);
        error.mockRestore();
    });
});

describe('onPrefChange: other tabs (storage event)', () => {
    it('reports origin tab for a PREF key of localStorage, with the value re-read from storage', () => {
        otherTabWrites(KEY, 'imperial');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(KEY, 'imperial', 'tab');
    });

    it('reads the current storage, never event.newValue', () => {
        localStorage.setItem(KEY, 'imperial');
        window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'STALE', storageArea: localStorage }));
        expect(listener).toHaveBeenCalledWith(KEY, 'imperial', 'tab');
    });

    it('decodes JSON values and reports null when the key was removed', () => {
        otherTabWrites(PREF.SHOW_FLIGHT_PATH, 'false');
        expect(listener).toHaveBeenLastCalledWith(PREF.SHOW_FLIGHT_PATH, false, 'tab');
        otherTabWrites(PREF.SHOW_FLIGHT_PATH, null);
        expect(listener).toHaveBeenLastCalledWith(PREF.SHOW_FLIGHT_PATH, null, 'tab');
    });

    it('ignores sessionStorage events', () => {
        otherTabWrites(KEY, 'imperial', window.sessionStorage);
        expect(listener).not.toHaveBeenCalled();
    });

    it('ignores keys that are not preferences, and storage.clear() events without a key', () => {
        otherTabWrites('some-other-app-key', '1');
        window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
        expect(listener).not.toHaveBeenCalled();
    });

    it('is not delivered after the unsubscribe', () => {
        off();
        otherTabWrites(KEY, 'imperial');
        expect(listener).not.toHaveBeenCalled();
    });

    it('adds one window listener however many subscribers there are', () => {
        _resetPrefListenersForTests();
        const add = vi.spyOn(window, 'addEventListener');
        onPrefChange(() => {});
        onPrefChange(() => {});
        onPrefChange(() => {});
        expect(add.mock.calls.filter(c => c[0] === 'storage')).toHaveLength(1);
        add.mockRestore();
    });
});

describe('applyAccountValue', () => {
    it('writes the value and reports origin account', () => {
        applyAccountValue(PREF.SHOW_FLIGHT_PATH, false);
        expect(getPref(PREF.SHOW_FLIGHT_PATH, true)).toBe(false);
        expect(listener).toHaveBeenCalledWith(PREF.SHOW_FLIGHT_PATH, false, 'account');
    });

    it('null removes the key', () => {
        setPref(KEY, 'imperial');
        listener.mockClear();
        applyAccountValue(KEY, null);
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(listener).toHaveBeenCalledWith(KEY, null, 'account');
    });

    it('does not fire when the account value is what is stored', () => {
        setPref(KEY, 'imperial');
        listener.mockClear();
        applyAccountValue(KEY, 'imperial');
        expect(listener).not.toHaveBeenCalled();
    });

    it('stores objects as JSON', () => {
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 25, ownedOnly: false });
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toEqual({ itemsPerPage: 25, ownedOnly: false });
    });
});

describe('catalog', () => {
    it('PREF_DEFAULTS has exactly the ACCOUNT_SECTIONS keys', () => {
        expect(Object.keys(PREF_DEFAULTS).sort()).toEqual(Object.keys(ACCOUNT_SECTIONS).sort());
    });

    it('ACCOUNT_SECTIONS keys are PREF values, and the device-only keys are not mapped', () => {
        const known = new Set(Object.values(PREF));
        for (const key of Object.keys(ACCOUNT_SECTIONS)) expect(known.has(key)).toBe(true);
        for (const local of [PREF.PANEL_SIZES, PREF.ORG_PAGE_POSITION, PREF.HUB_UPDATE_NOTICE, PREF.CLIPBOARD, PREF.HUB_UPDATE_ATTEMPTED]) {
            expect(ACCOUNT_SECTIONS).not.toHaveProperty(local);
        }
    });

    it('maps each key to a unique [section, field]', () => {
        const pairs = Object.values(ACCOUNT_SECTIONS).map(([s, f]) => `${s}.${f}`);
        expect(new Set(pairs).size).toBe(pairs.length);
        expect(ACCOUNT_SECTIONS[PREF.MEASURE_UNIT]).toEqual(['units', 'measurement']);
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { usePreference } from './usePreference';
import * as prefs from '@/libs/preferences';

const { PREF, safeStorage, setPref, getPref, removePref, applyAccountValue, onPrefChange, _resetPrefListenersForTests } = prefs;
const KEY = PREF.SHOW_FLIGHT_PATH;

let scope;
const run = fn => { scope = effectScope(); return scope.run(fn); };
let events;
let off;

beforeEach(() => {
    _resetPrefListenersForTests();
    safeStorage.removeItem(KEY); safeStorage.removeItem(PREF.ORG_PAGE);
    events = [];
    off = onPrefChange((key, value, origin) => events.push({ key, value, origin }));
});
afterEach(() => { scope?.stop(); off(); _resetPrefListenersForTests(); });

const locals = () => events.filter(e => e.origin === 'local');

describe('usePreference', () => {
    it('reads the stored value, or the fallback', () => {
        expect(run(() => usePreference(KEY, true)).value).toBe(true);
        setPref(KEY, false);
        expect(run(() => usePreference(KEY, true)).value).toBe(false);
    });

    it('persists its own change once', async () => {
        const spy = vi.spyOn(prefs, 'setPref');
        const flag = run(() => usePreference(KEY, true));
        flag.value = false;
        await nextTick();
        expect(getPref(KEY, true)).toBe(false);
        expect(locals()).toHaveLength(1);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('follows a change from the account with no local notification', async () => {
        const flag = run(() => usePreference(KEY, true));
        applyAccountValue(KEY, false);
        await nextTick();
        expect(flag.value).toBe(false);
        expect(locals()).toHaveLength(0);
        expect(events.filter(e => e.origin === 'account')).toHaveLength(1);
    });

    it('follows a change from another tab with no local notification', async () => {
        const flag = run(() => usePreference(KEY, true));
        safeStorage.setItem(KEY, 'false');
        window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: globalThis.localStorage }));
        await nextTick();
        expect(flag.value).toBe(false);
        expect(locals()).toHaveLength(0);
    });

    it('goes back to the fallback on removePref and does not write the fallback back', async () => {
        setPref(KEY, false);
        const flag = run(() => usePreference(KEY, true));
        events.length = 0;
        removePref(KEY);
        await nextTick();
        expect(flag.value).toBe(true);
        expect(safeStorage.getItem(KEY)).toBeNull();
        // the one local event is the removal itself; the ref must not add a write
        expect(locals()).toEqual([{ key: KEY, value: null, origin: 'local' }]);
    });

    it('an object preference removed by the account is not written back as a default', async () => {
        const settings = run(() => usePreference(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true }));
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 50, ownedOnly: false });
        expect(settings.value).toEqual({ itemsPerPage: 50, ownedOnly: false });
        applyAccountValue(PREF.ORG_PAGE, null);
        expect(settings.value).toEqual({ itemsPerPage: 10, ownedOnly: true });
        expect(safeStorage.getItem(PREF.ORG_PAGE)).toBeNull();
        expect(locals()).toHaveLength(0);
    });

    it('ignores changes of other keys', () => {
        const flag = run(() => usePreference(KEY, true));
        applyAccountValue(PREF.BASEMAP, 'osm');
        expect(flag.value).toBe(true);
    });

    it('two refs of one key stay equal and a change of one is written once', async () => {
        const a = run(() => usePreference(KEY, true));
        const b = effectScope().run(() => usePreference(KEY, true));
        a.value = false;
        await nextTick();
        expect(b.value).toBe(false);
        expect(locals()).toHaveLength(1);
    });

    it('stops listening when its scope is disposed', async () => {
        const flag = run(() => usePreference(KEY, true));
        scope.stop();
        applyAccountValue(KEY, false);
        await nextTick();
        expect(flag.value).toBe(true);
    });

    it('a session preference is not notified and not followed', async () => {
        const v = run(() => usePreference('hubUpdateAttempted', '', { session: true }));
        v.value = 'x';
        await nextTick();
        expect(safeStorage.getItem('hubUpdateAttempted', { session: true })).toBe('x');
        expect(events).toHaveLength(0);
    });
});

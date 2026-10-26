import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useViewerSettings } from './useViewerSettings';
import { getPref, setPref, removePref, applyAccountValue, safeStorage, PREF, onPrefChange, _resetPrefListenersForTests } from '@/libs/preferences';

const KEY = 'test-viewer-settings';
const run = fn => effectScope().run(fn);

describe('useViewerSettings', () => {
    beforeEach(() => removePref(KEY));

    it('starts from the defaults and persists changes', async () => {
        const { settings } = run(() => useViewerSettings(KEY, { a: 1, b: 2 }));
        expect({ ...settings }).toEqual({ a: 1, b: 2 });
        settings.a = 5;
        await nextTick();
        expect(getPref(KEY)).toEqual({ a: 5, b: 2 });
    });

    it('merges stored values over the defaults, ignoring unknown keys', () => {
        setPref(KEY, { a: 9, old: true });
        const { settings } = run(() => useViewerSettings(KEY, { a: 1, b: 2 }));
        expect({ ...settings }).toEqual({ a: 9, b: 2 });
    });

    it('resets to the defaults', async () => {
        setPref(KEY, { a: 9 });
        const { settings, resetSettings } = run(() => useViewerSettings(KEY, { a: 1 }));
        resetSettings();
        await nextTick();
        expect(settings.a).toBe(1);
        expect(getPref(KEY)).toEqual({ a: 1 });
    });
});

describe('useViewerSettings: changes from elsewhere', () => {
    // Keys of the catalog notify; a free key does too (only the storage event filters by catalog)
    let events;
    let off;
    let scope;
    const start = (defaults = { a: 1, b: 2 }) => {
        scope = effectScope();
        return scope.run(() => useViewerSettings(KEY, defaults));
    };
    const locals = () => events.filter(e => e.origin === 'local');

    beforeEach(() => {
        _resetPrefListenersForTests();
        removePref(KEY);
        events = [];
        off = onPrefChange((key, value, origin) => events.push({ key, value, origin }));
    });
    afterEach(() => { scope?.stop(); off(); _resetPrefListenersForTests(); });

    it('an account change updates the settings and writes nothing back', async () => {
        const { settings } = start();
        applyAccountValue(KEY, { a: 7 });
        await nextTick();
        expect({ ...settings }).toEqual({ a: 7, b: 2 });
        expect(locals()).toHaveLength(0);
    });

    it('a change from another tab updates the settings with no local notification', async () => {
        const nexus = PREF.NEXUS_LIGHTING;
        scope = effectScope();
        const { settings } = scope.run(() => useViewerSettings(nexus, { a: 1, b: 2 }));
        safeStorage.setItem(nexus, JSON.stringify({ a: 3, b: 4 }));
        window.dispatchEvent(new StorageEvent('storage', { key: nexus, newValue: 'STALE', storageArea: globalThis.localStorage }));
        await nextTick();
        expect({ ...settings }).toEqual({ a: 3, b: 4 });
        expect(locals()).toHaveLength(0);
        safeStorage.removeItem(nexus);
    });

    it('removePref puts the defaults back and does not store them', async () => {
        setPref(KEY, { a: 9, b: 9 });
        const { settings } = start();
        events.length = 0;
        removePref(KEY);
        await nextTick();
        expect({ ...settings }).toEqual({ a: 1, b: 2 });
        expect(safeStorage.getItem(KEY)).toBeNull();
        expect(locals()).toEqual([{ key: KEY, value: null, origin: 'local' }]);
    });

    it('an own change is stored once', async () => {
        const { settings } = start();
        settings.a = 5;
        await nextTick();
        expect(locals()).toHaveLength(1);
        expect(getPref(KEY)).toEqual({ a: 5, b: 2 });
    });

    it('a null field in the account value falls back to the default', async () => {
        const { settings } = start();
        applyAccountValue(KEY, { a: null, b: 8 });
        await nextTick();
        expect({ ...settings }).toEqual({ a: 1, b: 8 });
    });

    it('stops following when its scope is disposed', async () => {
        const { settings } = start();
        scope.stop();
        applyAccountValue(KEY, { a: 7 });
        await nextTick();
        expect(settings.a).toBe(1);
    });

    it('resetSettings stores the defaults once', async () => {
        setPref(KEY, { a: 9, b: 9 });
        const { resetSettings } = start();
        events.length = 0;
        resetSettings();
        await nextTick();
        expect(locals()).toHaveLength(1);
    });
});

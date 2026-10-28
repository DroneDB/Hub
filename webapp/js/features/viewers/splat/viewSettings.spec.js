import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PREF, getPref } from '@/libs/preferences';
import {
    createViewSettingsStore, sanitizeViewSettings, openingViewSettings, viewSettingsStore, VIEW_DEFAULTS, MAX_ENTRIES, TILT_LIMIT, POINT_SCALE_RANGE
} from './viewSettings';

// A store over a plain array, so the tests see exactly what would be stored
function memoryStore(options = {}) {
    const state = { stored: null };
    const store = createViewSettingsStore({ load: () => state.stored, save: list => { state.stored = list; }, ...options });
    return { state, store };
}

describe('sanitizeViewSettings', () => {
    it('keeps the usable fields and clamps the numbers into their ranges', () => {
        expect(sanitizeViewSettings({ upAxis: '+z', tiltRoll: 3, tiltPitch: -2.5, pointScale: 1.5 })).toEqual({ upAxis: '+z', tiltRoll: 3, tiltPitch: -2.5, pointScale: 1.5 });
        expect(sanitizeViewSettings({ tiltRoll: 90, tiltPitch: -90, pointScale: 99 })).toEqual({ tiltRoll: TILT_LIMIT, tiltPitch: -TILT_LIMIT, pointScale: POINT_SCALE_RANGE.max });
        expect(sanitizeViewSettings({ pointScale: 0 })).toEqual({ pointScale: POINT_SCALE_RANGE.min });
    });

    it('leaves out what is missing or of the wrong type', () => {
        expect(sanitizeViewSettings({ upAxis: 'sideways', tiltRoll: '3', tiltPitch: NaN, pointScale: Infinity })).toEqual({});
        expect(sanitizeViewSettings(null)).toEqual({});
        expect(sanitizeViewSettings('x')).toEqual({});
    });
});

describe('openingViewSettings', () => {
    it('puts what is remembered over the defaults', () => {
        expect(openingViewSettings({})).toEqual(VIEW_DEFAULTS);
        expect(openingViewSettings({ upAxis: '+z', pointScale: 2 })).toEqual({ ...VIEW_DEFAULTS, upAxis: '+z', pointScale: 2 });
    });
});

describe('the store', () => {
    it('knows nothing of an entry it has not seen', () => {
        expect(memoryStore().store.get('ddb://h/o/d/a.spz')).toEqual({});
    });

    it('remembers per entry and merges the fields changed one at a time', () => {
        const { store } = memoryStore();
        store.set('a', { upAxis: '+z' });
        store.set('b', { pointScale: 2 });
        store.set('a', { tiltRoll: 5, tiltPitch: -5 });
        expect(store.get('a')).toEqual({ upAxis: '+z', tiltRoll: 5, tiltPitch: -5 });
        expect(store.get('b')).toEqual({ pointScale: 2 });
    });

    it('drops the least recently changed entries past the cap', () => {
        const { store, state } = memoryStore({ cap: 3 });
        for (const key of ['a', 'b', 'c']) store.set(key, { pointScale: 2 });
        // Changing "a" again makes it the most recent: "b" is the oldest
        store.set('a', { pointScale: 1.5 });
        store.set('d', { pointScale: 2 });
        expect(state.stored.map(([key]) => key)).toEqual(['c', 'a', 'd']);
        expect(store.get('b')).toEqual({});
        expect(store.get('a')).toEqual({ pointScale: 1.5 });
    });

    it('has a cap of 200 entries by default', () => {
        expect(MAX_ENTRIES).toBe(200);
        const { store, state } = memoryStore();
        for (let i = 0; i < MAX_ENTRIES + 30; i++) store.set(`entry-${i}`, { pointScale: 2 });
        expect(state.stored).toHaveLength(MAX_ENTRIES);
        expect(store.get('entry-0')).toEqual({});
        expect(store.get(`entry-${MAX_ENTRIES + 29}`)).toEqual({ pointScale: 2 });
    });

    it('trims a list stored by a build with a larger cap on the next change', () => {
        const { store, state } = memoryStore({ cap: 2 });
        state.stored = [['a', { pointScale: 2 }], ['b', { pointScale: 2 }], ['c', { pointScale: 2 }]];
        store.set('d', { pointScale: 1 });
        expect(state.stored.map(([key]) => key)).toEqual(['c', 'd']);
    });

    it('stores only sanitised fields', () => {
        const { store, state } = memoryStore();
        store.set('a', { upAxis: 'bad', tiltRoll: 500 });
        expect(state.stored).toEqual([['a', { tiltRoll: TILT_LIMIT }]]);
    });

    it('treats storage that holds something else, or has damaged entries, as having nothing there', () => {
        for (const stored of ['text', 42, { a: 1 }, [null, 5, ['x'], [7, {}]]]) {
            const { store, state } = memoryStore();
            state.stored = stored;
            expect(store.get('a')).toEqual({});
            expect(() => store.set('a', { pointScale: 2 })).not.toThrow();
            expect(store.get('a')).toEqual({ pointScale: 2 });
        }
        const { store, state } = memoryStore();
        state.stored = [['a', 'oops'], ['b', { upAxis: '-x', junk: 1 }]];
        expect(store.get('a')).toEqual({});
        expect(store.get('b')).toEqual({ upAxis: '-x' });
    });

    it('tolerates storage that throws on read or on write', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const broken = createViewSettingsStore({ load: () => { throw new Error('denied'); }, save: () => { throw new Error('quota'); } });
        expect(broken.get('a')).toEqual({});
        expect(() => broken.set('a', { pointScale: 2 })).not.toThrow();
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('the store on the preferences', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('keeps the entries on this device under its own key, in no account section', () => {
        viewSettingsStore.set('ddb://h/o/d/a.spz', { upAxis: '+z', pointScale: 2 });
        expect(getPref(PREF.SPLAT_VIEW_SETTINGS, null)).toEqual([['ddb://h/o/d/a.spz', { upAxis: '+z', pointScale: 2 }]]);
        expect(viewSettingsStore.get('ddb://h/o/d/a.spz')).toEqual({ upAxis: '+z', pointScale: 2 });
    });

    it('survives a localStorage that refuses writes (the settings last for the page)', async () => {
        vi.resetModules();
        const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
        try {
            const { viewSettingsStore: fresh } = await import('./viewSettings');
            expect(() => fresh.set('a', { upAxis: '-z' })).not.toThrow();
            expect(fresh.get('a')).toEqual({ upAxis: '-z' });
        } finally {
            denied.mockRestore();
        }
    });

    it('survives a stored value that is not JSON', () => {
        localStorage.setItem(PREF.SPLAT_VIEW_SETTINGS, '{not json');
        expect(viewSettingsStore.get('a')).toEqual({});
        viewSettingsStore.set('a', { pointScale: 2 });
        expect(viewSettingsStore.get('a')).toEqual({ pointScale: 2 });
    });
});

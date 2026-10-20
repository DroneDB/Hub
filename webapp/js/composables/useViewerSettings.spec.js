import { describe, it, expect, beforeEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useViewerSettings } from './useViewerSettings';
import { getPref, setPref, removePref } from '@/libs/preferences';

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

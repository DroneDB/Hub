/**
 * HQ-02 acceptance: shared helpers exist and behave consistently.
 * Fails today: libs/format.js, libs/download.js, libs/ids.js, libs/preferences.js,
 * composables/useCopyText.js and pathutils.extname/stem do not exist.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';

describe('libs/format', () => {
    it('formats dates with the browser locale and returns "" for empty input', async () => {
        const f = await import('@/libs/format');
        const d = new Date(2026, 9, 20, 14, 5, 9);
        expect(f.formatDate(d)).toBe(d.toLocaleDateString());
        expect(f.formatDate(null)).toBe('');
        expect(f.formatDate(undefined, { placeholder: '--' })).toBe('--');
        expect(f.formatDateTime(d)).toContain(d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }));
    });

    it('formats bytes, durations, numbers and coordinates', async () => {
        const f = await import('@/libs/format');
        expect(f.formatBytes(1536)).toBe('1.5 KB');
        expect(f.formatDuration(3723000)).toBe('1h 2m 3s');
        expect(f.formatDuration(5000)).toBe('5s');
        expect(f.formatDurationSeconds(125)).toBe('2m 5s');
        expect(f.formatLatLon(45.1234567, 9.7654321)).toBe('45.123457, 9.765432');
        expect(f.toDms(45.5, 'lat')).toBe(`45\u00B030'00.00" N`);
        expect(f.toDms(-9.25, 'lon')).toBe(`9\u00B015'00.00" W`);
    });

    it('formats measured areas and lengths in the chosen units', async () => {
        const f = await import('@/libs/format');
        expect(f.formatArea(5000, 'metric')).toBe('5000 m²');
        expect(f.formatArea(2500000, 'metric')).toBe('2.5 km²');
        expect(f.formatArea(4046.8564224, 'imperial')).toBe('1 acres');
        expect(f.formatLength(50, 'metric')).toBe('50 m');
        expect(f.formatLength(1500, 'metric')).toBe('1.5 km');
        expect(f.lengthParts(1, 'imperial')).toEqual({ value: 3.28, unit: 'ft', text: '3.28 ft' });
    });
});

describe('pathutils', () => {
    it('has extname and stem', async () => {
        const { pathutils: p } = await import('ddb');
        expect(p.extname('a/b/Photo.JPG')).toBe('.jpg');
        expect(p.extname('a/b/noext')).toBe('');
        expect(p.stem('a/b/ortho.tif')).toBe('ortho');
        expect(p.stem('a/b/archive.tar.gz')).toBe('archive.tar');
        expect(p.dropExtension('a/b.c/ortho.tif')).toBe('a/b.c/ortho');
        expect(p.dropExtension('a/b.c/noext')).toBe('a/b.c/noext');
    });
});

describe('libs/download', () => {
    it('downloads a blob through a temporary link and revokes the URL', async () => {
        vi.useFakeTimers();
        const { downloadBlob, filenameFromDisposition } = await import('@/libs/download');
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        downloadBlob(new Blob(['a']), 'f.tif');
        expect(create).toHaveBeenCalledOnce();
        expect(click).toHaveBeenCalledOnce();
        vi.runAllTimers();
        expect(revoke).toHaveBeenCalledWith('blob:x');
        vi.useRealTimers();
        expect(filenameFromDisposition('attachment; filename="r.tif"', 'x')).toBe('r.tif');
        expect(filenameFromDisposition(null, 'x.tif')).toBe('x.tif');
    });
});

describe('libs/ids', () => {
    it('returns unique ids', async () => {
        const { newId } = await import('@/libs/ids');
        expect(newId()).not.toBe(newId());
        expect(newId()).toMatch(/^[\w-]{8,}$/);
    });
});

describe('libs/preferences + usePreference', () => {
    afterEach(() => localStorage.clear());

    it('round-trips JSON and survives a throwing storage', async () => {
        const { getPref, setPref } = await import('@/libs/preferences');
        setPref('hq02.test', { a: 1 });
        expect(getPref('hq02.test')).toEqual({ a: 1 });
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        expect(() => getPref('hq02.other', 5)).not.toThrow();
        expect(getPref('hq02.other', 5)).toBe(5);
        spy.mockRestore();
    });

    it('reads values written as raw strings by older versions', async () => {
        const { getPref } = await import('@/libs/preferences');
        localStorage.setItem('hq02.unit', 'imperial');
        localStorage.setItem('hq02.flag', 'true');
        expect(getPref('hq02.unit', 'metric')).toBe('imperial');
        expect(getPref('hq02.flag', false)).toBe(true);
    });

    it('usePreference persists changes', async () => {
        const { usePreference } = await import('@/composables/usePreference');
        const scope = effectScope();
        const unit = scope.run(() => usePreference('hq02.unit', 'metric'));
        expect(unit.value).toBe('metric');
        unit.value = 'imperial';
        await nextTick();
        expect(localStorage.getItem('hq02.unit')).toBe('imperial'); // strings are stored as they are
        scope.stop();
    });
});

describe('useCopyText', () => {
    it('sets copied and resets it after the delay, clearing the timer on dispose', async () => {
        vi.useFakeTimers();
        vi.doMock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }));
        const { useCopyText } = await import('@/composables/useCopyText');
        const scope = effectScope();
        const { copy, copied } = scope.run(() => useCopyText({ resetMs: 2000 }));
        await copy('hello');
        expect(copied.value).toBe(true);
        vi.advanceTimersByTime(2000);
        expect(copied.value).toBe(false);
        await copy('again');
        scope.stop();
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });
});

describe('escapeHtml + point popup', () => {
    it('escapes names and descriptions in the popup', async () => {
        const { pointPopupHtml } = await import('@/libs/map/pointPopup');
        const html = pointPopupHtml({ lat: 45.5, lon: 9.25, name: '<b>x</b>', description: '"q"' });
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
        expect(html).toContain('&quot;q&quot;');
        expect(html).toContain(`45\u00B030'00.00" N`);
        expect(html).not.toContain('ol-point-popup-actions');
        expect(pointPopupHtml({ lat: 0, lon: 0, actions: true })).toContain('ol-point-popup-actions');
    });
});

/**
 * The shared helpers (libs/format.js, libs/download.js, libs/ids.js, libs/preferences.js,
 * composables/useCopyText.js, pathutils.extname/stem) behave consistently.
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

    it('formats durations and coordinates', async () => {
        const f = await import('@/libs/format');
        expect(f.formatDuration(3723000)).toBe('1h 2m 3s');
        expect(f.formatDuration(5000)).toBe('5s');
        expect(f.formatDurationSeconds(125)).toBe('2m 5s');
        expect(f.toDms(45.5, 'lat')).toBe(`45\u00B030'00.00" N`);
        expect(f.toDms(-9.25, 'lon')).toBe(`9\u00B015'00.00" W`);
    });

    it('formats measured areas and lengths in the chosen units', async () => {
        const f = await import('@/libs/format');
        expect(f.formatArea(5000, 'metric')).toBe('5000 m²');
        expect(f.formatLength(50, 'metric')).toBe('50 m');
        expect(f.formatLength(1500, 'metric')).toBe('1.5 km');
        expect(f.lengthParts(1, 'imperial')).toEqual({ value: 3.28, unit: 'ft', text: '3.28 ft' });
    });

    it('formats lengths that keep their unit, with fixed decimals', async () => {
        const f = await import('@/libs/format');
        expect(f.fixedLengthParts(300.456)).toEqual({ value: '300.46', unit: 'm', text: '300.46 m' });
        expect(f.fixedLengthParts(1, 'imperial')).toEqual({ value: '3.28', unit: 'ft', text: '3.28 ft' });
        expect(f.fixedLengthParts(1.5, 'metric', 1).text).toBe('1.5 m');
    });

    it('formats the ground size of a raster pixel in cm or m, in or ft', async () => {
        const f = await import('@/libs/format');
        expect(f.formatPixelSize(0.05, 0.05)).toBe('5.0 cm/px');
        expect(f.formatPixelSize(0.005, 0.005)).toBe('0.50 cm/px');
        expect(f.formatPixelSize(0.043, 0.062)).toBe('4.3 x 6.2 cm/px');
        expect(f.formatPixelSize(10, 10)).toBe('10.0 m/px');
        expect(f.formatPixelSize(0.05, 0.05, 'imperial')).toBe('2.0 in/px');
        expect(f.formatPixelSize(0.01, 0.01, 'imperial')).toBe('0.39 in/px');
        expect(f.formatPixelSize(0.5, 0.5, 'imperial')).toBe('1.6 ft/px');
    });

    it('formats the ground extent of a raster in m or km, ft or mi', async () => {
        const f = await import('@/libs/format');
        expect(f.formatExtent(90, 88)).toBe('90 x 88 m');
        expect(f.formatExtent(5, 4)).toBe('5.0 x 4.0 m');
        expect(f.formatExtent(2000, 1500)).toBe('2.00 x 1.50 km');
        expect(f.formatExtent(90, 88, 'imperial')).toBe('295 x 289 ft');
        expect(f.formatExtent(2, 1.5, 'imperial')).toBe('6.6 x 4.9 ft');
        expect(f.formatExtent(2000, 1500, 'imperial')).toBe('1.24 x 0.93 mi');
    });

    it('shows a measured area in m², ha or km², or in ft² below 1 acre and acres from it', async () => {
        const f = await import('@/libs/format');
        // A 1,200 ft² roof is readable, not "0.03 acres"
        expect(f.formatArea(111.4836, 'imperial')).toBe('1200 ft²');
        expect(f.areaParts(1000, 'imperial')).toEqual({ value: 10763.91, unit: 'ft²', text: '10763.91 ft²' });
        expect(f.formatArea(4046.8564224, 'imperial')).toBe('1 acres');
        expect(f.formatArea(15000, 'imperial')).toBe('3.71 acres');
        expect(f.formatArea(9999, 'metric')).toBe('9999 m²');
        // Hectares between 1 ha and 100 km², not km² rounded to 2 decimals ("0.02 km²")
        expect(f.formatArea(15000, 'metric')).toBe('1.5 ha');
        expect(f.formatArea(2500000, 'metric')).toBe('250 ha');
        expect(f.formatArea(2e8, 'metric')).toBe('200 km²');
    });

    it('chooses one area unit for every view, from the size and the units', async () => {
        const f = await import('@/libs/format');
        const unitOf = (m2, units) => f.areaScale(m2, units).unit;
        expect([unitOf(9999.99), unitOf(1e4), unitOf(1e8 - 1), unitOf(1e8)]).toEqual(['m²', 'ha', 'ha', 'km²']);
        expect([unitOf(4046, 'imperial'), unitOf(4046.8564224, 'imperial'), unitOf(1e9, 'imperial')])
            .toEqual(['ft²', 'acres', 'acres']);
        expect(f.areaScale(1, 'imperial').factor).toBeCloseTo(10.7639104, 6);
    });

    it('formats land areas with hectares, or ft² and acres for imperial', async () => {
        const f = await import('@/libs/format');
        expect(f.formatLandArea(7920)).toBe('7920 m²');
        expect(f.formatLandArea(3e6)).toBe('300.0 ha');
        expect(f.formatLandArea(4e8)).toBe('400 km²');
        expect(f.formatLandArea(7920, 'imperial')).toBe('1.96 acres');
        expect(f.formatLandArea(1000, 'imperial')).toBe('10764 ft²');
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

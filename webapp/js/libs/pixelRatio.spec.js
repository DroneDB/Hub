import { describe, it, expect, vi, afterEach } from 'vitest';
import { appliedPixelRatio, watchPixelRatio, MAX_PIXEL_RATIO } from './pixelRatio';
import { QUALITY_PRESETS } from '@/features/viewers/splat/qualityPresets';

describe('appliedPixelRatio', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is min(devicePixelRatio, 2, presetCap)', () => {
        expect(appliedPixelRatio(2, 3)).toBe(2);
        expect(appliedPixelRatio(2, 1.5)).toBe(1.5);
        expect(appliedPixelRatio(1.5, 2)).toBe(1.5);
        expect(appliedPixelRatio(1, 2)).toBe(1);
        expect(appliedPixelRatio(1, 1)).toBe(1);
    });

    it('uses the cap of each quality preset: High 2, Medium 1.5, Low 1', () => {
        expect(appliedPixelRatio(QUALITY_PRESETS.high.pixelRatio, 2)).toBe(2);
        expect(appliedPixelRatio(QUALITY_PRESETS.medium.pixelRatio, 2)).toBe(1.5);
        expect(appliedPixelRatio(QUALITY_PRESETS.low.pixelRatio, 2)).toBe(1);
    });

    it('caps a renderer without a preset at 2', () => {
        expect(MAX_PIXEL_RATIO).toBe(2);
        expect(appliedPixelRatio(undefined, 3)).toBe(2);
        expect(appliedPixelRatio(undefined, 1)).toBe(1);
        expect(appliedPixelRatio(10, 3)).toBe(2);
    });

    it('reads the window ratio by default and falls back to 1', () => {
        vi.stubGlobal('devicePixelRatio', 1.25);
        expect(appliedPixelRatio(2)).toBe(1.25);
        vi.stubGlobal('devicePixelRatio', 0);
        expect(appliedPixelRatio(2)).toBe(1);
    });
});

describe('watchPixelRatio', () => {
    // The media query that matches the ratio of the moment: it fires when the ratio leaves it
    function fakeWindow(ratio) {
        const win = { devicePixelRatio: ratio, queries: [] };
        win.matchMedia = vi.fn(text => {
            const query = {
                text, listeners: new Set(),
                addEventListener: (type, fn) => query.listeners.add(fn),
                removeEventListener: (type, fn) => query.listeners.delete(fn)
            };
            win.queries.push(query);
            return query;
        });
        return win;
    }

    it('asks the media query of the current ratio and calls back with the new ratio, then follows that one', () => {
        const win = fakeWindow(1);
        const onChange = vi.fn();
        watchPixelRatio(onChange, win);
        expect(win.queries[0].text).toBe('(resolution: 1dppx)');

        win.devicePixelRatio = 2;
        [...win.queries[0].listeners][0]();
        expect(onChange).toHaveBeenCalledWith(2);
        expect(win.queries[1].text).toBe('(resolution: 2dppx)');
        expect(win.queries[0].listeners.size).toBe(0);
        expect(win.queries[1].listeners.size).toBe(1);

        win.devicePixelRatio = 1.5;
        [...win.queries[1].listeners][0]();
        expect(onChange).toHaveBeenLastCalledWith(1.5);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('stops when asked', () => {
        const win = fakeWindow(2);
        const onChange = vi.fn();
        const stop = watchPixelRatio(onChange, win);
        stop();
        expect(win.queries[0].listeners.size).toBe(0);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('does nothing in a browser without matchMedia', () => {
        expect(() => watchPixelRatio(() => {}, {})()).not.toThrow();
    });
});

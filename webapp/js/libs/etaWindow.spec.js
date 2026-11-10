import { describe, it, expect } from 'vitest';
import { createEtaEstimator } from './etaWindow';

describe('createEtaEstimator', () => {
    it('has no estimate before the progress moved', () => {
        const eta = createEtaEstimator();
        expect(eta.add(0, 0)).toBeNull();
        expect(eta.add(5000, 0)).toBeNull();
    });

    it('from the start, it is the time at the average rate', () => {
        const eta = createEtaEstimator();
        eta.add(0, 0);
        // 10 % in 10 s: 90 % more takes 90 s
        expect(eta.add(10_000, 10)).toBe(90);
    });

    it('follows the recent rate: a slow start does not make the estimate too long when the transfer speeds up', () => {
        const eta = createEtaEstimator({ windowMs: 30_000 });
        eta.add(0, 0);
        eta.add(60_000, 6);            // 6 % in the first minute: the average since the start says 940 s
        eta.add(70_000, 16);           // then 1 % per second
        const seconds = eta.add(90_000, 36);
        // the window is the last 30 s: 6 % at 60 s to 36 % at 90 s, 1 % per second: 64 s left
        expect(seconds).toBe(64);
    });

    it('a transfer that slows down gets a longer estimate than its average', () => {
        const eta = createEtaEstimator({ windowMs: 10_000 });
        eta.add(0, 0);
        eta.add(10_000, 50);           // 5 % per second
        eta.add(20_000, 51);           // then 0.1 % per second
        expect(eta.add(30_000, 52)).toBe(480);
    });

    it('is 0 when the progress is complete, and starts a new window when the progress goes back', () => {
        const eta = createEtaEstimator();
        eta.add(0, 0);
        expect(eta.add(10_000, 100)).toBe(0);
        eta.add(20_000, 20);
        // the window starts again at 20 %: 10 % in 10 s, 70 % more takes 70 s
        expect(eta.add(30_000, 30)).toBe(70);
    });

    it('ignores a progress that is not a number', () => {
        const eta = createEtaEstimator();
        expect(eta.add(0, Number.NaN)).toBeNull();
        expect(eta.add(1000, /** @type {any} */ (undefined))).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { MAX_RETRIES, shouldRetry, retryDelayMs, stripRetryParam } from '@/libs/build/thumbRetryPolicy';

/**
 * thumbRetryPolicy.spec - bounded thumbnail retry contract shared by
 * Thumbnail.vue, TableView.vue and the Map image popup.
 */
describe('thumbRetryPolicy', () => {
    it('allows retries below the cap and stops at/above it', () => {
        expect(shouldRetry(0)).toBe(true);
        expect(shouldRetry(MAX_RETRIES - 1)).toBe(true);
        // Boundary: retryNumber == MAX_RETRIES must stop the loop.
        expect(shouldRetry(MAX_RETRIES)).toBe(false);
        expect(shouldRetry(MAX_RETRIES + 5)).toBe(false);
    });

    it('escalates delays 5s -> 20s -> 60s and clamps beyond', () => {
        expect(retryDelayMs(0)).toBe(5000);
        expect(retryDelayMs(1)).toBe(20000);
        expect(retryDelayMs(2)).toBe(60000);
        // Past the table, keep the last delay (never undefined).
        expect(retryDelayMs(3)).toBe(60000);
        expect(retryDelayMs(99)).toBe(60000);
    });

    it('strips retry params, including repeated suffixes', () => {
        expect(stripRetryParam('/orgs/a/ds/b/thumb?path=x.png')).toBe('/orgs/a/ds/b/thumb?path=x.png');
        expect(stripRetryParam('/orgs/a/ds/b/thumb?path=x.png&retry=1')).toBe('/orgs/a/ds/b/thumb?path=x.png');
        // Repeated suffixes (accidental double-append) all removed.
        expect(stripRetryParam('/orgs/a/thumb?path=x.png&retry=1&retry=2&retry=3')).toBe('/orgs/a/thumb?path=x.png');
        // Only trailing retry params are stripped — query params before them stay.
        expect(stripRetryParam('/thumb?path=a.png&size=48&retry=2')).toBe('/thumb?path=a.png&size=48');
        // A retry param in the middle is left alone (only the trailing run is a cache-buster).
        expect(stripRetryParam('/thumb?path=a.png&retry=1&size=48')).toBe('/thumb?path=a.png&retry=1&size=48');
    });

    it('cap composition: total loads per tile is 1 initial + MAX_RETRIES retries', () => {
        // Simulate the Thumbnail.vue/Map.vue error loop: initial load failures
        // drive retries while shouldRetry(retryNumber) holds.
        let retryNumber = 0;
        let loads = 1; // initial <img> load
        while (shouldRetry(retryNumber)) {
            retryNumber += 1;
            loads += 1; // retry triggers a new src -> new request
        }
        expect(loads).toBe(1 + MAX_RETRIES); // 4 requests per tile, then fallback
    });
});

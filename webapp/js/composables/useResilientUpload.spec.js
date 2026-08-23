/**
 * Unit tests for composables/useResilientUpload.js
 * Run with: npx vitest run --reporter=verbose
 */
import { describe, it, expect } from 'vitest';
import {
    shouldRetryStatus,
    computeRetryDelayMs,
    parseRetryAfterSeconds,
    createAimdConcurrency,
    useResilientUpload,
    DEFAULT_MAX_RETRIES,
    DEFAULT_BASE_DELAY_MS,
    DEFAULT_MAX_DELAY_MS
} from './useResilientUpload';

describe('shouldRetryStatus', () => {
    it('retries on transient statuses', () => {
        for (const status of [0, 429, 502, 503, 504]) {
            expect(shouldRetryStatus(status)).toBe(true);
        }
    });

    it('treats network-level failures (status 0) as transient and computes a jittered backoff for them', () => {
        expect(shouldRetryStatus(0)).toBe(true);
        // status 0 comes with no Retry-After header -> exponential/jittered backoff, not the header branch
        const delay = computeRetryDelayMs(1, null, { rng: () => 0.5, baseDelayMs: 1000, maxDelayMs: 30000 });
        // backoff = min(30000, 1000 * 2^1) = 2000; delay = 0.5 * 2000
        expect(delay).toBe(1000);
    });

    it('does not retry on permanent statuses', () => {
        for (const status of [400, 401, 403, 404, 409, 413, 500, 507]) {
            expect(shouldRetryStatus(status)).toBe(false);
        }
    });
});

describe('parseRetryAfterSeconds', () => {
    it('parses a numeric header value', () => {
        expect(parseRetryAfterSeconds('5')).toBe(5);
    });

    it('returns null for missing/invalid values', () => {
        expect(parseRetryAfterSeconds(null)).toBeNull();
        expect(parseRetryAfterSeconds(undefined)).toBeNull();
        expect(parseRetryAfterSeconds('not-a-number')).toBeNull();
        expect(parseRetryAfterSeconds('-1')).toBeNull();
    });
});

describe('computeRetryDelayMs', () => {
    it('honours Retry-After when present, ignoring backoff/jitter', () => {
        expect(computeRetryDelayMs(0, 3)).toBe(3000);
        expect(computeRetryDelayMs(5, 0)).toBe(0);
    });

    it('caps the Retry-After-derived delay at 300 seconds (5 minutes)', () => {
        expect(computeRetryDelayMs(0, 999999)).toBe(300000);
        expect(computeRetryDelayMs(0, 301)).toBe(300000);
        expect(computeRetryDelayMs(0, 300)).toBe(300000);
        expect(computeRetryDelayMs(0, 299)).toBe(299000);
    });

    it('applies the Retry-After cap inside the useResilientUpload bundle too', () => {
        const resilience = useResilientUpload();
        expect(resilience.computeRetryDelayMs(0, 999999)).toBe(300000);
    });

    it('is bounded and jittered when Retry-After is absent (deterministic RNG)', () => {
        const rng = () => 0.5;
        const delay0 = computeRetryDelayMs(0, null, { rng, baseDelayMs: 1000, maxDelayMs: 30000 });
        // attempt 0 -> backoff = min(30000, 1000*2^0) = 1000; delay = rng()*1000 = 500
        expect(delay0).toBe(500);

        const delay10 = computeRetryDelayMs(10, null, { rng, baseDelayMs: 1000, maxDelayMs: 30000 });
        // backoff capped at maxDelayMs
        expect(delay10).toBe(15000);
    });

    it('never exceeds maxDelayMs', () => {
        const rng = () => 0.999999;
        const delay = computeRetryDelayMs(20, null, { rng, baseDelayMs: 1000, maxDelayMs: 30000 });
        expect(delay).toBeLessThanOrEqual(30000);
    });

    it('uses sane defaults', () => {
        expect(DEFAULT_MAX_RETRIES).toBe(5);
        expect(DEFAULT_BASE_DELAY_MS).toBe(1000);
        expect(DEFAULT_MAX_DELAY_MS).toBe(30000);
    });
});

describe('createAimdConcurrency', () => {
    it('halves concurrency on failure, floored at 2', () => {
        const aimd = createAimdConcurrency(8);
        expect(aimd.current).toBe(8);
        expect(aimd.onFailure()).toBe(4);
        expect(aimd.onFailure()).toBe(2);
        expect(aimd.onFailure()).toBe(2); // floor
    });

    it('grows back by 1 after N consecutive successes, capped at configured', () => {
        const aimd = createAimdConcurrency(8, { successesToGrow: 3 });
        aimd.onFailure(); // -> 4
        expect(aimd.current).toBe(4);

        aimd.onSuccess();
        aimd.onSuccess();
        expect(aimd.current).toBe(4); // not yet grown
        aimd.onSuccess();
        expect(aimd.current).toBe(5); // grown by 1

        // Growing further never exceeds the originally configured value
        for (let i = 0; i < 20; i++) aimd.onSuccess();
        expect(aimd.current).toBe(8);
    });

    it('resets consecutive-success counter on a failure', () => {
        const aimd = createAimdConcurrency(8, { successesToGrow: 2 });
        aimd.onFailure(); // -> 4
        aimd.onSuccess();
        aimd.onFailure(); // resets counter, -> 2
        aimd.onSuccess();
        expect(aimd.current).toBe(2); // needs 2 consecutive successes, only had 1
    });

    it('reset() restores the configured value', () => {
        const aimd = createAimdConcurrency(8);
        aimd.onFailure();
        aimd.reset();
        expect(aimd.current).toBe(8);
    });
});

describe('useResilientUpload', () => {
    it('bundles policy with the given defaults', () => {
        const resilience = useResilientUpload({ parallelUploads: 4, maxRetries: 3 });
        expect(resilience.maxRetries).toBe(3);
        expect(resilience.aimd.current).toBe(4);
        expect(resilience.shouldRetryStatus(503)).toBe(true);
        expect(resilience.shouldRetryStatus(404)).toBe(false);
    });
});

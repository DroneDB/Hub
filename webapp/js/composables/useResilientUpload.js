/**
 * useResilientUpload - Shared retry/backoff/backpressure policy for Dropzone-based uploads.
 *
 * Consumed by DatasetUpload.vue and Upload.vue, which previously duplicated ad-hoc retry
 * logic. This composable does not touch Dropzone itself (it is a vendored file); callers
 * wire its decisions into their own Dropzone "error"/"complete" handlers.
 *
 * Exposes:
 *   - shouldRetryStatus(status): whether an HTTP status is transient for this purpose
 *   - computeRetryDelayMs(attempt, retryAfterSeconds, rng): capped, full-jitter backoff
 *   - createAimdConcurrency(configured): additive-increase/multiplicative-decrease controller
 */

/** HTTP statuses treated as transient/retryable. status === 0 covers network-level failures. */
const RETRYABLE_STATUSES = new Set([0, 429, 502, 503, 504]);

export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_BASE_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 30000;
// Misbehaving proxies/servers can demand absurd Retry-After values; cap the per-file
// wait at 5 minutes
export const DEFAULT_RETRY_AFTER_CAP_SECONDS = 300;

/**
 * Whether an HTTP status code returned by the server warrants a retry.
 * @param {number} status HTTP status code (0 for a network-level failure).
 * @returns {boolean}
 */
export function shouldRetryStatus(status) {
    return RETRYABLE_STATUSES.has(status);
}

/**
 * Computes the delay before the next retry attempt.
 *
 * Honours the server's `Retry-After` (seconds) when present; otherwise uses bounded
 * exponential backoff with full jitter (`rand(0, min(maxDelay, base * 2^attempt))`),
 * matching the core's RetryPolicy so client and server backoff do not resonate.
 *
 * The `Retry-After`-derived delay is capped (default 300 seconds) so a bad proxy
 * cannot stall the queue for hours; the exponential-backoff path is unchanged.
 *
 * @param {number} attempt 0-based retry attempt number.
 * @param {number|null} retryAfterSeconds Value of the `Retry-After` response header, if any.
 * @param {object} [opts]
 * @param {number} [opts.baseDelayMs]
 * @param {number} [opts.maxDelayMs]
 * @param {number} [opts.retryAfterCapSeconds] Hard cap (seconds) for the header-derived delay.
 * @param {() => number} [opts.rng] Injectable RNG (returns [0,1)) for deterministic tests.
 * @returns {number} Delay in milliseconds.
 */
export function computeRetryDelayMs(attempt, retryAfterSeconds, opts = {}) {
    if (retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        const retryAfterCapSeconds = opts.retryAfterCapSeconds ?? DEFAULT_RETRY_AFTER_CAP_SECONDS;
        return Math.round(Math.min(retryAfterSeconds, retryAfterCapSeconds) * 1000);
    }

    const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const rng = opts.rng ?? Math.random;

    const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt)));
    return Math.round(rng() * backoff);
}

/**
 * Parses the `Retry-After` header value (seconds, per RFC 7231; HTTP-date form is not
 * supported here since the server only ever sends a numeric value - see ApiExceptionFilter).
 * @param {string|null} headerValue
 * @returns {number|null}
 */
export function parseRetryAfterSeconds(headerValue) {
    if (!headerValue) return null;
    const n = Number(headerValue);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Additive-increase / multiplicative-decrease concurrency controller.
 *
 * on503(): halves concurrency (floor 2).
 * onSuccess(): after `successesToGrow` consecutive successes, grows by 1 up to `configured`.
 * Concurrency never exceeds the originally configured value - the goal is cooperating with
 * server backpressure, not permanently raising throughput above what was asked for.
 */
export function createAimdConcurrency(configuredValue, opts = {}) {
    const configured = Math.max(1, configuredValue | 0);
    const successesToGrow = opts.successesToGrow ?? 5;
    let current = configured;
    let consecutiveSuccesses = 0;

    return {
        get current() {
            return current;
        },
        onFailure() {
            consecutiveSuccesses = 0;
            // Floor at 2 but never above `configured` - the docstring guarantees
            // concurrency stays at or below the configured value for any input.
            current = Math.min(configured, Math.max(2, Math.floor(current / 2)));
            return current;
        },
        onSuccess() {
            consecutiveSuccesses++;
            if (consecutiveSuccesses >= successesToGrow && current < configured) {
                current = Math.min(configured, current + 1);
                consecutiveSuccesses = 0;
            }
            return current;
        },
        reset() {
            current = configured;
            consecutiveSuccesses = 0;
        }
    };
}

/**
 * Convenience composable entry point: bundles the policy pieces with the given defaults.
 * @param {object} [opts]
 * @param {number} [opts.maxRetries]
 * @param {number} [opts.baseDelayMs]
 * @param {number} [opts.maxDelayMs]
 * @param {number} [opts.parallelUploads]
 */
export function useResilientUpload(opts = {}) {
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const aimd = createAimdConcurrency(opts.parallelUploads ?? 8);

    return {
        maxRetries,
        aimd,
        shouldRetryStatus,
        computeRetryDelayMs: (attempt, retryAfterSeconds) =>
            computeRetryDelayMs(attempt, retryAfterSeconds, { baseDelayMs, maxDelayMs }),
        parseRetryAfterSeconds
    };
}

/**
 * thumbRetryPolicy - bounded retry policy for failed thumbnail loads.
 *
 * Single source of truth shared by Thumbnail.vue, TableView.vue and the Map
 * image popup so every thumbnail surface caps retries the same way: an
 * unbounded retry loop turns a server-side outage into a self-sustaining
 * request storm.
 *
 * MAX_RETRIES      - number of automatic retries after the initial load.
 * retryDelayMs(n)  - backoff for retry n (0-based retryNumber): 5s, 20s, 60s.
 */
const MAX_RETRIES = 3;
const DELAYS_MS = [5000, 20000, 60000];

function shouldRetry(retryNumber) {
    return retryNumber < MAX_RETRIES;
}

function retryDelayMs(retryNumber) {
    // index = number of retries already performed (retryNumber)
    return DELAYS_MS[Math.min(retryNumber, DELAYS_MS.length - 1)];
}

/**
 * Removes trailing &retry=N cache-buster suffix(es) from a thumbnail URL.
 * Used only from the error path when composing the next retry URL.
 */
function stripRetryParam(url) {
    return url.replace(/(&retry=\d+)+$/, "");
}

export { MAX_RETRIES, shouldRetry, retryDelayMs, stripRetryParam };

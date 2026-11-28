/** Helpers shared by the upload views. */

/**
 * A GET with the session token of `registry` whose HTTP statuses are results, not
 * exceptions (the upload requests poll receipts and chunk states that may be 202 or 404).
 * `signal` aborts the request (the answer is then status 0, as for a network failure).
 * @returns {(url: string, init?: { signal?: AbortSignal }) => Promise<{status: number, body: any}>}
 */
export function authorizedGetJson(registry) {
    return async (url, { signal } = {}) => {
        try {
            const res = await registry.fetchRaw(url, { cache: 'no-store', signal });
            let body = null;
            try {
                body = await res.json();
            } catch {
                /* no JSON body */
            }
            return { status: res.status, body };
        } catch {
            return { status: 0, body: null };
        }
    };
}

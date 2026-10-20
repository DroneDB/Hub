/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Helpers shared by the upload views. */

/**
 * A GET with the session token of `registry` whose HTTP statuses are results, not
 * exceptions (the upload requests poll receipts and chunk states that may be 202 or 404).
 * @returns {(url: string) => Promise<{status: number, body: any}>}
 */
export function authorizedGetJson(registry) {
    return async url => {
        const token = registry.getAuthToken();
        try {
            const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
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

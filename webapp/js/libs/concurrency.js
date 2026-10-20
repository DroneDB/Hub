/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A limiter for asynchronous work: `run(fn)` starts `fn` when fewer than `limit` calls are
 * running, otherwise when one of them settles (first come, first served).
 * @param {number} limit
 * @returns {{ run: <T>(fn: () => Promise<T>) => Promise<T>, readonly active: number }}
 */
export function createLimiter(limit) {
    const max = Math.max(1, limit | 0);
    const waiting = [];
    let active = 0;

    const next = () => {
        if (active >= max || waiting.length === 0) return;
        active++;
        const { fn, resolve, reject } = waiting.shift();
        Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
                active--;
                next();
            });
    };

    return {
        run(fn) {
            return new Promise((resolve, reject) => {
                waiting.push({ fn, resolve, reject });
                next();
            });
        },
        get active() {
            return active;
        }
    };
}

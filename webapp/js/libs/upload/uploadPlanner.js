/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * uploadPlanner - groups queued files into requests.
 *
 * Each request costs a round trip and a server commit, so files below 1 MB go in bundles
 * of up to 32 files / 8 MB in one request. Files above 256 MB go as resumable chunks, so a
 * failure resends one chunk instead of the whole file. Everything else is one request
 * per file. Bundles take consecutive files only, so the queue order (companions before
 * 3D models) is kept.
 */

export const SMALL_FILE_BYTES = 1024 * 1024;
export const BUNDLE_MAX_FILES = 32;
export const BUNDLE_MAX_BYTES = 8 * 1024 * 1024;
export const CHUNKED_FILE_BYTES = 256 * 1024 * 1024;

/**
 * The next request for the head of `ready` (files that can start now, in queue order).
 * @param {Array<{size: number}>} ready
 * @param {object} [limits]
 * @returns {{kind: 'single'|'bundle'|'chunked', items: Array}|null}
 */
export function planNextJob(ready, limits = {}) {
    if (!ready || ready.length === 0) return null;

    const small = limits.smallFileBytes ?? SMALL_FILE_BYTES;
    const maxFiles = limits.bundleMaxFiles ?? BUNDLE_MAX_FILES;
    const maxBytes = limits.bundleMaxBytes ?? BUNDLE_MAX_BYTES;
    const chunked = limits.chunkedFileBytes ?? CHUNKED_FILE_BYTES;

    const first = ready[0];
    if (first.size > chunked) return { kind: 'chunked', items: [first] };
    if (first.size >= small || maxFiles < 2) return { kind: 'single', items: [first] };

    const items = [first];
    let bytes = first.size;
    for (let i = 1; i < ready.length && items.length < maxFiles; i++) {
        const next = ready[i];
        if (next.size >= small || bytes + next.size > maxBytes) break;
        items.push(next);
        bytes += next.size;
    }

    return { kind: items.length > 1 ? 'bundle' : 'single', items };
}

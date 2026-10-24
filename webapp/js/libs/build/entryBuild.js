// @ts-check
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Hub knows about the build of an entry comes from the entry itself: Registry lists the
 * artifacts that exist (libddb's build manifest) and the build status it could not leave out
 * ("queued", "building", "pending", "failed"; a complete build has none). The Hangfire job of a
 * build says how far it is and why it failed, not whether its output exists (see buildManager.js).
 */

/**
 * The entry as the server reports it now. A listing is a snapshot: a build that finished after it
 * is not in it. A snapshot that already answers (`isEnough`) is used as it is; otherwise the entry
 * is listed again, once: one request however many artifacts the caller wants, where each used to
 * cost a probe.
 * @template {{ path: string }} T
 * @param {{ listOne: (path: string) => Promise<any> }} dataset
 * @param {T} entry
 * @param {(entry: T) => boolean} isEnough
 * @returns {Promise<T>}
 */
export async function currentEntry(dataset, entry, isEnough) {
    return isEnough(entry) ? entry : dataset.listOne(entry.path);
}

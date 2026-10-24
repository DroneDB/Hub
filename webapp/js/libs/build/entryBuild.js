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

import { artifactsOf } from '@/libs/ddb/buildArtifacts';
import { isActiveState } from '@/libs/tasks/taskStates';

/** The build fields Registry puts on an entry DTO (the ones a finished build changes). */
const BUILD_FIELDS = Object.freeze(['artifacts', 'buildStatus', 'buildMissingDependencies']);

/**
 * Whether the entry's build is complete: it has artifacts and the server reports no build state
 * for it (a build that is queued, running, on hold or failed always has one).
 * @param {{ artifacts?: any[], buildStatus?: string } | null | undefined} entry
 * @returns {boolean}
 */
export function isBuilt(entry) {
    return artifactsOf(entry).length > 0 && !entry?.buildStatus;
}

/**
 * The status of an entry's build that is worth a badge: queued, on hold (pending) or failed. A
 * complete build, a running one (the spinner shows it) and an entry that is not built by libddb
 * have none.
 * @param {{ buildStatus?: string } | null | undefined} entry
 * @returns {'queued' | 'pending' | 'failed' | null}
 */
export function entryBuildStatus(entry) {
    const status = entry?.buildStatus;
    return status === 'queued' || status === 'pending' || status === 'failed' ? status : null;
}

/**
 * The build status to show for an entry: its job's failure, nothing while the job runs (the
 * spinner is shown), and otherwise what the entry says: a job that succeeded says nothing about
 * whether the build's output exists.
 * @param {{ currentState: string } | null | undefined} job  the build job of the entry, if any
 * @param {{ buildStatus?: string } | null | undefined} entry
 * @returns {'queued' | 'pending' | 'failed' | null}
 */
export function shownBuildStatus(job, entry) {
    if (job?.currentState === 'Failed') return 'failed';
    if (job && isActiveState(job.currentState)) return null;
    return entryBuildStatus(entry);
}

/**
 * Copies the build fields of a fresh listing of an entry onto a held one (a field the server
 * omits is cleared), so what a build produced shows on the entry the page already has.
 * @param {Record<string, any>} held
 * @param {Record<string, any>} fresh
 */
export function applyBuildFields(held, fresh) {
    for (const field of BUILD_FIELDS) {
        if (fresh[field] === undefined) delete held[field];
        else held[field] = fresh[field];
    }
}

/**
 * The entry as the server reports it now. A listing is a snapshot: a build that finished after it
 * is not in it. A snapshot that already answers (`isEnough`) is used as it is; otherwise the entry
 * is listed again, once: one request however many artifacts the caller wants.
 * @template {{ path: string }} T
 * @param {{ listOne: (path: string) => Promise<any> }} dataset
 * @param {T} entry
 * @param {(entry: T) => boolean} isEnough
 * @returns {Promise<T>}
 */
export async function currentEntry(dataset, entry, isEnough) {
    return isEnough(entry) ? entry : dataset.listOne(entry.path);
}

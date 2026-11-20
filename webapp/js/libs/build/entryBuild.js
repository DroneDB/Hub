// @ts-check
/**
 * What the Hub knows about the build of an entry comes from the entry itself: Registry lists the
 * artifacts that exist (libddb's build manifest) and the build status it could not leave out
 * ("queued", "building", "pending", "failed"; a complete build has none). The Hangfire job of a
 * build says how far it is and why it failed, not whether its output exists (see buildManager.js).
 */

import { artifactsOf } from '@/libs/ddb/buildArtifacts';
import { isActiveState } from '@/libs/tasks/taskStates';

/** The build fields Registry puts on an entry DTO (the ones a finished build changes). */
const BUILD_FIELDS = Object.freeze(['artifacts', 'buildStatus', 'buildMissingDependencies', 'buildAwaitingFiles']);

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
 * The words of the build states, in one table keyed by the state `shownBuildState` gives: the badge, the caption of a tile
 * that builds (FR-EXP-07) and the tile's tooltip (FR-EXP-21) read it, so a state has one name everywhere.
 */
export const BUILD_WORDS = Object.freeze({
    built: 'Built',
    building: 'Building\u2026',
    queued: 'Queued',
    pending: 'On hold',
    failed: 'Failed'
});

/**
 * The state of the entry's build to put in words: 'failed' (the job failed, or the entry says so), 'building' (a job is
 * active, or the server says the build runs), 'queued', 'pending' (on hold), 'built' (the entry has its build), or null
 * for an entry with no build to speak of.
 * @param {{ currentState: string } | null | undefined} job  the build job of the entry, if any
 * @param {{ buildStatus?: string, artifacts?: any[] } | null | undefined} entry
 * @returns {'failed' | 'building' | 'queued' | 'pending' | 'built' | null}
 */
export function shownBuildState(job, entry) {
    if (job?.currentState === 'Failed') return 'failed';
    if (job && isActiveState(job.currentState)) return 'building';
    if (entry?.buildStatus === 'building') return 'building';
    return entryBuildStatus(entry) ?? (isBuilt(entry) ? 'built' : null);
}

/**
 * The word for the entry's build state ('Built', 'Building…', 'Queued', 'On hold', 'Failed'), or '' when there is none.
 * @param {{ currentState: string } | null | undefined} job
 * @param {{ buildStatus?: string, artifacts?: any[] } | null | undefined} entry
 */
export function buildWord(job, entry) {
    const state = shownBuildState(job, entry);
    return state ? BUILD_WORDS[state] : '';
}

/**
 * Whether no build of the entry is under way or coming: it failed, or it is on hold until the
 * user adds what it needs. What the build makes (a thumbnail, tiles) does not appear by itself.
 * @param {{ currentState: string } | null | undefined} job  the build job of the entry, if any
 * @param {{ buildStatus?: string } | null | undefined} entry
 * @returns {boolean}
 */
export function isBuildStopped(job, entry) {
    const status = shownBuildStatus(job, entry);
    return status === 'failed' || status === 'pending';
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

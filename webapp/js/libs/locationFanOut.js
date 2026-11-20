// @ts-check
/**
 * locationFanOut - asks for the dataset locations of a set of organizations, a few at a time, and
 * hands each organization's answer over as it arrives, so a map can show pins progressively.
 *
 * The set changes as the user filters it: each change asks only for the organizations it brings
 * in, keeps the answers (and the requests in flight) of those still in it, and ends the request of
 * each organization it leaves out, which then starts no request if it was still queued and whose
 * answer is dropped if it arrives after, so a stale organization never reaches the map.
 */
import { createLimiter } from '@/libs/concurrency';
import { isAbort } from '@/composables/useRequestScope';

/** Organizations asked at the same time. */
export const LOCATION_REQUESTS = 4;

/**
 * @typedef {object} LocationGroupFound
 * @property {string} org
 * @property {string} orgName
 * @property {Array<{slug: string, name: string|null, bbox: number[]|null}>} datasets
 *
 * @typedef {object} LocationFanOut
 * @property {(orgs: Array<{slug: string, name?: string|null}>) => void} update
 *   makes `orgs` the set: asks for those not asked yet, drops the others
 * @property {(orgs: Array<{slug: string, name?: string|null}>) => void} keepOnly
 *   drops the organizations not in `orgs`, and asks for none
 * @property {() => void} stop  drops every organization
 * @property {readonly LocationGroupFound[]} groups  the answers of the set, in the order they arrived
 * @property {boolean} loading  an organization of the set is not answered yet
 */

/**
 * @param {object} options
 * @param {(org: string, opts: {signal: AbortSignal}) => Promise<LocationGroupFound['datasets']>} options.fetchLocations
 * @param {() => void} options.onChange  called after each change of the set and each answer of it
 * @param {number} [options.limit]
 * @returns {LocationFanOut}
 */
export function createLocationFanOut({ fetchLocations, onChange, limit = LOCATION_REQUESTS }) {
    const limiter = createLimiter(limit);
    /** The organizations of the set, by slug. @type {Map<string, {controller: AbortController, settled: boolean}>} */
    const asked = new Map();
    /** @type {LocationGroupFound[]} */
    let groups = [];
    let unanswered = 0;

    /** @param {{settled: boolean}} entry */
    const settle = entry => {
        if (entry.settled) return;
        entry.settled = true;
        unanswered--;
    };

    /** @param {{slug: string, name?: string|null}} org */
    function ask(org) {
        const controller = new AbortController();
        const { signal } = controller;
        const entry = { controller, settled: false };
        asked.set(org.slug, entry);
        unanswered++;
        limiter.run(async () => {
            if (signal.aborted) return;
            /** @type {LocationGroupFound|null} */
            let group = null;
            try {
                group = { org: org.slug, orgName: org.name || org.slug, datasets: await fetchLocations(org.slug, { signal }) };
            } catch (e) {
                // An organization the user cannot read (403, 404) or that fails does not stop the others
                if (!signal.aborted && !isAbort(e)) {
                    console.warn(`No locations for organization "${org.slug}":`, e instanceof Error ? e.message : e);
                }
            }
            // An organization left out of the set meanwhile was settled when it was dropped
            if (signal.aborted) return;
            settle(entry);
            if (group) groups = [...groups, group];
            onChange();
        });
    }

    /** Drops the organizations not in `slugs`. @param {Set<string>} slugs */
    function dropAbsent(slugs) {
        for (const [slug, entry] of asked) {
            if (slugs.has(slug)) continue;
            asked.delete(slug);
            settle(entry);
            entry.controller.abort();
        }
        if (groups.some(group => !slugs.has(group.org))) groups = groups.filter(group => slugs.has(group.org));
    }

    /** @param {Array<{slug: string}>} orgs */
    const slugsOf = orgs => new Set(orgs.map(org => org.slug));

    return {
        update(orgs) {
            dropAbsent(slugsOf(orgs));
            for (const org of orgs) if (!asked.has(org.slug)) ask(org);
            onChange();
        },
        keepOnly(orgs) {
            dropAbsent(slugsOf(orgs));
            onChange();
        },
        stop() {
            dropAbsent(new Set());
            onChange();
        },
        get groups() { return groups; },
        get loading() { return unanswered > 0; }
    };
}

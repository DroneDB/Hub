/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When the task list of a dataset is fetched again (HUB-05).
 *
 * - hidden page: never (one refresh when it shows again);
 * - tasks running: every 2.5 s;
 * - nothing running: 15 s, doubling while nothing changes, up to 2 minutes;
 * - change notifications connected (server-sent events): only the 2-minute safety net.
 */
export const POLL_ACTIVE_MS = 2500;
export const POLL_IDLE_MS = 15000;
export const POLL_MAX_MS = 120000;

/**
 * @param {object} s
 * @param {boolean} s.hidden the page is not visible
 * @param {boolean} s.active a task is running
 * @param {number} s.idleStreak polls in a row that changed nothing
 * @param {boolean} [s.pushed] change notifications are connected
 * @returns {number|null} delay in ms, or null for no poll
 */
export function nextPollDelay({ hidden, active, idleStreak, pushed = false }) {
    if (hidden) return null;
    if (active) return POLL_ACTIVE_MS;
    if (pushed) return POLL_MAX_MS;
    return Math.min(POLL_MAX_MS, POLL_IDLE_MS * Math.pow(2, Math.max(0, idleStreak | 0)));
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One shared 1-second ticker (HUB-05) instead of one interval per task row or table:
 * runs while someone listens and the page is visible.
 */
const listeners = new Set();
let timer = null;
let visibilityHooked = false;

const isHidden = () => typeof document !== 'undefined' && document.hidden === true;

function update() {
    const shouldRun = listeners.size > 0 && !isHidden();
    if (shouldRun && timer == null) {
        timer = setInterval(() => {
            const now = Date.now();
            for (const fn of listeners) fn(now);
        }, 1000);
    } else if (!shouldRun && timer != null) {
        clearInterval(timer);
        timer = null;
    }
}

function onVisibility() {
    update();
    // Back to visible: show the right time at once
    if (!isHidden()) for (const fn of listeners) fn(Date.now());
}

/**
 * Calls `fn(now)` every second until the returned function is called.
 * @param {(now: number) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onTick(fn) {
    listeners.add(fn);
    if (!visibilityHooked && typeof document !== 'undefined') {
        // lifetime: app (one listener for the whole page)
        document.addEventListener('visibilitychange', onVisibility);
        visibilityHooked = true;
    }
    update();
    return () => {
        listeners.delete(fn);
        update();
    };
}

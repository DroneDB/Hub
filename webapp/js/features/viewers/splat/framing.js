/**
 * Framing of a splat that is not ready to be framed yet. A paged .rad has no bounds until its first
 * chunks arrive, so the framing is tried again until it finds a real box. The first framing always
 * happens (the splat has not been seen before it), but the retries stop once the user took the camera:
 * a late framing would pull the view away from where they went, the same rule the unified viewer
 * keeps with its `userInteracted` flag.
 */

export const FRAME_RETRY_MS = 250;
// About ten seconds
export const FRAME_ATTEMPTS = 40;

/**
 * @param {object} options
 * @param {() => boolean} options.frame            frames the camera; returns whether a real box was framed
 * @param {() => boolean} options.userInteracted   whether the user moved the camera
 * @param {number} [options.attempts]
 * @param {number} [options.intervalMs]
 */
export function createFrameRetry({ frame, userInteracted, attempts = FRAME_ATTEMPTS, intervalMs = FRAME_RETRY_MS }) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;

    function cancel() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    }

    function attempt(n) {
        timer = null;
        if ((n > 0 && userInteracted()) || frame() || n + 1 >= attempts) return;
        // lifetime: paired (cancel() on unmount)
        timer = setTimeout(() => attempt(n + 1), intervalMs);
    }

    return {
        /** Frames now, and again until it worked, the attempts ran out or the user took the camera. */
        start() {
            cancel();
            attempt(0);
        },
        cancel
    };
}

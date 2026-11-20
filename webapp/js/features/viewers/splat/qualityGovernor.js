// @ts-check
/**
 * The "Auto" quality of the splat viewer: a pure step from the measured frame times to the level
 * to draw at. Below 30 frames per second for about 2 s the level goes down one step; above 55 for
 * about 5 s it goes up one. Going up needs the longer wait, so a scene that only just fits is not
 * pushed back and forth; and when a level that was just raised proves too slow the governor does
 * not try it again (its ceiling is lowered), because trying it would repeat the same drop every
 * few seconds for as long as the page is open.
 *
 * The frame time is smoothed and a single long frame is clamped, so a lone hitch (a chunk
 * uploading, a garbage collection) is not a slow scene; a frame that lasted a second or more is a
 * page that was not drawing (a hidden tab) and measures nothing. The state is plain data and the
 * step takes no clock: the caller feeds the time each frame took.
 *
 *   let state = initialGovernor(2);                       // starts at the highest level
 *   ({ state, change } = stepGovernor(state, frameMs));   // change: -1 (down), 0, +1 (up)
 */

/** The thresholds and hold times of the governor; `stepGovernor` takes them as an optional argument. */
export const GOVERNOR_DEFAULTS = Object.freeze({
    /** Under this many frames per second the scene is slow */
    slowFps: 30,
    /** Over this many frames per second the scene has room for more */
    fastFps: 55,
    /** How long the scene has to stay slow before the level goes down (ms) */
    downAfterMs: 2000,
    /** How long the scene has to stay fast before the level goes up (ms) */
    upAfterMs: 5000,
    /** A frame counts as at most this long: one hitch moves the average only a little (ms) */
    spikeMs: 100,
    /** A frame this long or longer was not a frame of the scene (hidden tab, suspended page) (ms) */
    pauseMs: 1000,
    /** Weight of a new frame in the smoothed frame time */
    smoothing: 0.1,
    /** A drop this soon after a rise means the higher level is too much for the device (ms) */
    retryUpMs: 30000
});

/**
 * @typedef {object} GovernorState
 * @property {number} level       the level to draw at (0 = lowest)
 * @property {number} ceiling     the highest level the governor will go up to
 * @property {number | null} frameMs  smoothed frame time at this level, null until a frame was seen
 * @property {number} slowMs      how long the frame time has been over the slow threshold, without a break
 * @property {number} fastMs      how long it has been under the fast threshold, without a break
 * @property {number} sinceRiseMs how long ago the level last went up (Infinity: it has not)
 */

/**
 * @param {number} maxLevel  the highest level (levels are 0 to maxLevel)
 * @returns {GovernorState}
 */
export function initialGovernor(maxLevel) {
    return { level: maxLevel, ceiling: maxLevel, frameMs: null, slowMs: 0, fastMs: 0, sinceRiseMs: Infinity };
}

/**
 * The state after a frame that took `frameMs`, and whether the level changed.
 * @param {GovernorState} state
 * @param {number} frameMs
 * @param {Partial<typeof GOVERNOR_DEFAULTS>} [options]
 * @returns {{ state: GovernorState, change: -1 | 0 | 1 }}
 */
export function stepGovernor(state, frameMs, options = {}) {
    const o = { ...GOVERNOR_DEFAULTS, ...options };
    if (!(frameMs > 0)) return { state, change: 0 };
    // A pause measures nothing, and what came before it no longer describes the scene
    if (frameMs >= o.pauseMs) return { state: { ...state, frameMs: null, slowMs: 0, fastMs: 0 }, change: 0 };

    const sample = Math.min(frameMs, o.spikeMs);
    const smoothed = state.frameMs === null ? sample : state.frameMs + o.smoothing * (sample - state.frameMs);
    // Between the two thresholds the scene is fine as it is: neither wait advances (the hysteresis)
    const slowMs = smoothed > 1000 / o.slowFps ? state.slowMs + frameMs : 0;
    const fastMs = smoothed < 1000 / o.fastFps ? state.fastMs + frameMs : 0;
    const sinceRiseMs = state.sinceRiseMs + frameMs;
    const next = { ...state, frameMs: smoothed, slowMs, fastMs, sinceRiseMs };

    if (slowMs >= o.downAfterMs && state.level > 0) {
        const level = state.level - 1;
        // Too slow soon after going up: the level above is not for this device
        const ceiling = sinceRiseMs < o.retryUpMs ? level : state.ceiling;
        return { state: { ...next, level, ceiling, frameMs: null, slowMs: 0, fastMs: 0 }, change: -1 };
    }
    if (fastMs >= o.upAfterMs && state.level < state.ceiling) {
        return { state: { ...next, level: state.level + 1, frameMs: null, slowMs: 0, fastMs: 0, sinceRiseMs: 0 }, change: 1 };
    }
    return { state: next, change: 0 };
}

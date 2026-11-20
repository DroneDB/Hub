// @ts-check
/**
 * The time left of a transfer from how fast it went lately (FR-UPL-21): the rate of the last `windowMs` of progress,
 * not the average since the start. The average of a transfer that begins with its biggest files, or that waits for a slow
 * start, gives a time that is several times too long; the rate of the window follows the speed the transfer has now.
 *
 *   const eta = createEtaEstimator();
 *   eta.add(Date.now(), 0);                 // the start
 *   const seconds = eta.add(Date.now(), 37.5);   // progress in percent: seconds left, or null when it cannot tell
 */

/** How long a sample counts, in ms. */
export const ETA_WINDOW_MS = 30_000;

/**
 * @param {{ windowMs?: number }} [options]
 */
export function createEtaEstimator({ windowMs = ETA_WINDOW_MS } = {}) {
    /** @type {Array<{ time: number, percent: number }>} */
    let samples = [];

    return {
        /**
         * Records the progress at `time` and gives the seconds left.
         * @param {number} time  ms
         * @param {number} percent  0 to 100
         * @returns {number|null}  null until the progress has moved over some time, and when it is complete
         */
        add(time, percent) {
            if (!Number.isFinite(percent)) return null;
            // A progress that goes back (a second phase, a restart of the task) begins a new window
            if (samples.length && percent < samples[samples.length - 1].percent) samples = [];
            samples.push({ time, percent });

            // Keep one sample from before the window, so the window is covered whole
            while (samples.length > 2 && samples[1].time <= time - windowMs) samples.shift();

            if (percent >= 100) return 0;
            const first = samples[0];
            const seconds = (time - first.time) / 1000;
            const rate = seconds > 0 ? (percent - first.percent) / seconds : 0;
            return rate > 0 ? (100 - percent) / rate : null;
        },

        reset() {
            samples = [];
        }
    };
}

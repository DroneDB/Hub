// @ts-check
/**
 * The queue that limits how many snapshots are drawn at the same time. A snapshot holds a map, its tiles and a canvas of
 * 1600 x 1000 pixels: the live page (which draws each one as it comes into view) and the PDF (which draws them all) go
 * through one queue, so that neither can have more than `concurrency` in memory at once.
 */

/** How many renders run at the same time. */
export const RENDER_CONCURRENCY = 2;

/** The error of a render that was aborted before or while it ran. */
export function abortError() {
    return new DOMException('The render was aborted', 'AbortError');
}

/** @param {AbortSignal | undefined} signal */
export function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
}

/**
 * @typedef {object} RenderQueue
 * @property {(task: (signal: AbortSignal | undefined) => Promise<any>, options?: { signal?: AbortSignal }) => Promise<any>} run
 *   Runs the task when a place is free, and resolves to what it resolves to. A task that is aborted while it waits never
 *   runs and its promise rejects with an AbortError; one that runs gets the signal, and its place is free again when it
 *   settles, however it ends.
 * @property {() => { running: number, waiting: number }} stats
 */

/**
 * @param {{ concurrency?: number }} [options]
 * @returns {RenderQueue}
 */
export function createRenderQueue({ concurrency = RENDER_CONCURRENCY } = {}) {
    const limit = Math.max(1, Math.floor(concurrency));
    let running = 0;
    /** @type {{ start: () => void }[]} */
    const waiting = [];

    function next() {
        while (running < limit && waiting.length) /** @type {{ start: () => void }} */ (waiting.shift()).start();
    }

    return {
        run(task, { signal } = {}) {
            return new Promise((resolve, reject) => {
                if (signal && signal.aborted) {
                    reject(abortError());
                    return;
                }
                /** @type {() => void} */
                let onAbort = () => {};
                const entry = {
                    start() {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        running++;
                        Promise.resolve()
                            .then(() => task(signal))
                            .then(resolve, reject)
                            .finally(() => { running--; next(); });
                    }
                };
                onAbort = () => {
                    const index = waiting.indexOf(entry);
                    if (index < 0) return;
                    waiting.splice(index, 1);
                    reject(abortError());
                };
                if (signal) signal.addEventListener('abort', onAbort, { once: true });
                waiting.push(entry);
                next();
            });
        },
        stats: () => ({ running, waiting: waiting.length })
    };
}

/** The queue of the live page and of the PDF: at most RENDER_CONCURRENCY snapshots are drawn at once, whoever asks. */
export const sharedRenderQueue = createRenderQueue();

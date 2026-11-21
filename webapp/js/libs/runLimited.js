// @ts-check
/**
 * Runs a task for each item with at most `limit` of them in flight, and gives back how each one ended
 * (a map over the limiter of libs/concurrency).
 *
 * A failing task does not stop the others: its outcome says why, as Promise.allSettled does. The caller
 * that no longer wants the answers (the list it measures was replaced, the panel closed) says so with
 * `shouldContinue`, checked as each task is about to start: the tasks that did not start stay `undefined`
 * in the result, and the ones in flight end by themselves (the task drops its own answer when it is stale).
 *
 *   await runLimited(piles, 4, pile => measure(pile), { shouldContinue: () => turn === currentTurn });
 */
import { createLimiter } from '@/libs/concurrency';

/**
 * @template T, R
 * @param {Iterable<T>} items
 * @param {number} limit  the most tasks in flight at once (at least 1)
 * @param {(item: T, index: number) => Promise<R> | R} task
 * @param {{ shouldContinue?: () => boolean }} [options]
 * @returns {Promise<Array<PromiseSettledResult<R> | undefined>>}  one outcome per item, in the order of the items
 */
export function runLimited(items, limit, task, { shouldContinue = () => true } = {}) {
    const limiter = createLimiter(limit);
    return Promise.all(Array.from(items, (item, index) => limiter.run(async () => {
        if (!shouldContinue()) return undefined;
        try {
            return /** @type {PromiseFulfilledResult<R>} */ ({ status: 'fulfilled', value: await task(item, index) });
        } catch (reason) {
            return /** @type {PromiseRejectedResult} */ ({ status: 'rejected', reason });
        }
    })));
}

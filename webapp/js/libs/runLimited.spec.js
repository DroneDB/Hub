/**
 * runLimited: a task for each item with a cap on the tasks in flight, every outcome reported, and the
 * tasks that were not started once the caller says its answers are no longer wanted.
 */
import { describe, it, expect } from 'vitest';
import { runLimited } from './runLimited';

/** A task that stays in flight until `release()`, and counts how many are in flight at once. */
function gate() {
    const state = { inFlight: 0, peak: 0, started: [], releases: [] };
    state.task = item => {
        state.started.push(item);
        state.inFlight++;
        state.peak = Math.max(state.peak, state.inFlight);
        return new Promise(resolve => {
            state.releases.push(() => { state.inFlight--; resolve(item * 10); });
        });
    };
    return state;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('runLimited', () => {
    it('never has more tasks in flight than the limit, and starts the next as one ends', async () => {
        const g = gate();
        const done = runLimited([1, 2, 3, 4, 5, 6, 7], 3, g.task);
        await tick();
        expect(g.started).toEqual([1, 2, 3]);

        g.releases.shift()();
        await tick();
        expect(g.started).toEqual([1, 2, 3, 4]);

        while (g.releases.length) { g.releases.shift()(); await tick(); }
        const outcomes = await done;
        expect(g.peak).toBe(3);
        expect(outcomes.map(o => o.value)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    });

    it('gives each task its item and index, and the outcomes in the order of the items', async () => {
        const seen = [];
        const outcomes = await runLimited(['a', 'b', 'c'], 2, async (item, index) => {
            seen.push([item, index]);
            // The first item ends last
            await new Promise(resolve => setTimeout(resolve, item === 'a' ? 15 : 0));
            return item.toUpperCase();
        });
        expect(seen).toEqual([['a', 0], ['b', 1], ['c', 2]]);
        expect(outcomes).toEqual([
            { status: 'fulfilled', value: 'A' }, { status: 'fulfilled', value: 'B' }, { status: 'fulfilled', value: 'C' }
        ]);
    });

    it('reports a task that fails and carries on with the others', async () => {
        const boom = new Error('boom');
        const outcomes = await runLimited([1, 2, 3], 1, async n => {
            if (n === 2) throw boom;
            return n;
        });
        expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 1 });
        expect(outcomes[1]).toEqual({ status: 'rejected', reason: boom });
        expect(outcomes[2]).toEqual({ status: 'fulfilled', value: 3 });
    });

    it('starts no task once shouldContinue says no, and leaves their outcomes undefined', async () => {
        const g = gate();
        let wanted = true;
        const done = runLimited([1, 2, 3, 4, 5], 2, g.task, { shouldContinue: () => wanted });
        await tick();
        expect(g.started).toEqual([1, 2]);

        wanted = false;
        g.releases.shift()();
        g.releases.shift()();
        const outcomes = await done;

        expect(g.started).toEqual([1, 2]);
        expect(outcomes.map(o => o && o.status)).toEqual(['fulfilled', 'fulfilled', undefined, undefined, undefined]);
    });

    it('takes any iterable, an empty one and a limit that is not a positive number', async () => {
        expect(await runLimited([], 4, async () => 1)).toEqual([]);
        const outcomes = await runLimited(new Set([1, 2]), 0, async n => n);
        expect(outcomes.map(o => o.value)).toEqual([1, 2]);
        expect((await runLimited([1], NaN, async n => n))[0].value).toBe(1);
    });
});

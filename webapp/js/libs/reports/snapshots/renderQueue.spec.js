/**
 * The render queue: at most `concurrency` renders at a time, in order, and an abort that takes a waiting render out
 * without ever running it.
 */
import { describe, it, expect } from 'vitest';
import { createRenderQueue, RENDER_CONCURRENCY } from './renderQueue';

/** A task that ends when `finish` is called. */
function gate() {
    let finish;
    let started = false;
    const promise = new Promise(resolve => { finish = resolve; });
    return { task: () => { started = true; return promise; }, finish: value => finish(value), get started() { return started; } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('createRenderQueue', () => {
    it('runs two at a time by default and the next one when a place is free', async () => {
        expect(RENDER_CONCURRENCY).toBe(2);
        const queue = createRenderQueue();
        const gates = [gate(), gate(), gate(), gate()];
        const results = gates.map(g => queue.run(g.task));
        await tick();
        expect(gates.map(g => g.started)).toEqual([true, true, false, false]);
        expect(queue.stats()).toEqual({ running: 2, waiting: 2 });

        gates[0].finish('a');
        await tick();
        expect(gates.map(g => g.started)).toEqual([true, true, true, false]);
        gates[1].finish('b');
        gates[2].finish('c');
        gates[3].finish('d');
        expect(await Promise.all(results)).toEqual(['a', 'b', 'c', 'd']);
        expect(queue.stats()).toEqual({ running: 0, waiting: 0 });
    });

    it('never has more running than the concurrency, over many tasks', async () => {
        const queue = createRenderQueue({ concurrency: 2 });
        let running = 0;
        let peak = 0;
        const task = async () => {
            peak = Math.max(peak, ++running);
            await tick();
            running--;
        };
        await Promise.all(Array.from({ length: 12 }, () => queue.run(task)));
        expect(peak).toBe(2);
    });

    it('frees the place of a task that fails, and passes the failure on', async () => {
        const queue = createRenderQueue({ concurrency: 1 });
        const failing = queue.run(async () => { throw new Error('boom'); });
        const next = queue.run(async () => 'ok');
        await expect(failing).rejects.toThrow('boom');
        expect(await next).toBe('ok');
    });

    it('takes a waiting render out when its signal aborts, and never runs it', async () => {
        const queue = createRenderQueue({ concurrency: 1 });
        const first = gate();
        const second = gate();
        const controller = new AbortController();
        const running = queue.run(first.task);
        const waiting = queue.run(second.task, { signal: controller.signal });
        await tick();
        controller.abort();
        await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
        first.finish('a');
        await running;
        await tick();
        expect(second.started).toBe(false);
        expect(queue.stats()).toEqual({ running: 0, waiting: 0 });
    });

    it('rejects a render whose signal is aborted already, and gives a running one its signal', async () => {
        const queue = createRenderQueue();
        const aborted = new AbortController();
        aborted.abort();
        await expect(queue.run(async () => 'x', { signal: aborted.signal })).rejects.toMatchObject({ name: 'AbortError' });

        const live = new AbortController();
        let seen;
        await queue.run(async signal => { seen = signal; }, { signal: live.signal });
        expect(seen).toBe(live.signal);
    });
});

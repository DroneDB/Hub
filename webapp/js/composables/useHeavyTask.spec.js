/**
 * Unit tests for composables/useHeavyTask.js lifecycle:
 * - a tick that is mid-await when the host unmounts must not reschedule itself
 * - unmounting releases the shared taskMonitor reference
 * - tracking the same task twice reuses the in-flight poll
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useHeavyTask } from './useHeavyTask';
import taskMonitor from '@/libs/tasks/taskMonitor';

let dsSeq = 0;

function makeDataset(over = {}) {
    dsSeq += 1;
    return {
        baseApi: `orgA/heavy-${dsSeq}`,
        getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'build', state: 'Processing' }]),
        getTaskLog: vi.fn(async () => ({ lines: [], cursor: 0 })),
        getTask: vi.fn(async () => ({ error: null, artifact: null })),
        ...over,
    };
}

// The owning component is an effect scope: stopping it is the unmount
function makeHost() {
    const scope = effectScope();
    const api = scope.run(() => useHeavyTask());
    return { ...api, $unmount: () => scope.stop() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('unmount during an in-flight tick', () => {
    it('does not reschedule after the pending log fetch resolves', async () => {
        let releaseLog;
        const dataset = makeDataset({
            getTaskLog: vi.fn(() => new Promise(res => { releaseLog = () => res({ lines: [], cursor: 0 }); })),
        });
        const host = makeHost();

        host.trackHeavyTask(dataset, 't1').catch(() => { /* never settles on unmount */ });
        await vi.advanceTimersByTimeAsync(0);
        expect(dataset.getTaskLog).toHaveBeenCalledTimes(1);

        // Navigate away exactly while getTaskLog is still pending.
        host.$unmount();
        releaseLog();
        await vi.advanceTimersByTimeAsync(10000);

        expect(dataset.getTaskLog).toHaveBeenCalledTimes(1);
        expect(host.activeCount()).toBe(0);
    });

    it('releases the taskMonitor reference so no snapshot is left behind', async () => {
        const dataset = makeDataset();
        const host = makeHost();

        host.trackHeavyTask(dataset, 't1').catch(() => { /* never settles on unmount */ });
        await vi.advanceTimersByTimeAsync(0);

        host.$unmount();

        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
        expect(host.activeCount()).toBe(0);
    });

    it('never acquires when tracking starts after unmount', async () => {
        const dataset = makeDataset();
        const host = makeHost();

        host.$unmount();
        host.trackHeavyTask(dataset, 't1');
        await vi.advanceTimersByTimeAsync(10000);

        expect(dataset.getTasks).not.toHaveBeenCalled();
        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
    });
});

describe('duplicate tracking', () => {
    it('reuses the in-flight poll for the same task id', async () => {
        const dataset = makeDataset();
        const host = makeHost();

        const first = host.trackHeavyTask(dataset, 't1');
        const second = host.trackHeavyTask(dataset, 't1');
        first.catch(() => {});

        expect(second).toBe(first);

        host.$unmount();
        await vi.advanceTimersByTimeAsync(0);
    });
});

describe('terminal state', () => {
    it('stops polling and releases the monitor when the task succeeds', async () => {
        const dataset = makeDataset({
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'build', state: 'Succeeded' }]),
        });
        const host = makeHost();

        const result = host.trackHeavyTask(dataset, 't1', { notify: false });
        await vi.advanceTimersByTimeAsync(0);
        await expect(result).resolves.toMatchObject({ taskId: 't1', state: 'Succeeded' });

        const calls = dataset.getTaskLog.mock.calls.length;
        await vi.advanceTimersByTimeAsync(10000);

        expect(dataset.getTaskLog).toHaveBeenCalledTimes(calls);
        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
    });
});

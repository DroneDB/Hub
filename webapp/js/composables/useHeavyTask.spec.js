/**
 * Unit tests for composables/useHeavyTask.js lifecycle:
 * - a tick that is mid-await when the host unmounts must not reschedule itself
 * - unmounting releases the shared taskMonitor reference
 * - tracking the same task twice reuses the in-flight poll
 * - a task whose dataset is deleted (404) settles once, with "The dataset was deleted."
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, watch } from 'vue';
import { useHeavyTask } from './useHeavyTask';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { ApiError } from '@/libs/ddb/apiError';

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
        expect(vi.getTimerCount()).toBe(0);
    });

    it('releases the taskMonitor reference so no snapshot is left behind', async () => {
        const dataset = makeDataset();
        const host = makeHost();

        host.trackHeavyTask(dataset, 't1').catch(() => { /* never settles on unmount */ });
        await vi.advanceTimersByTimeAsync(0);

        host.$unmount();

        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
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
    it('reports the error message of a failed task while it polls, not its exception type', async () => {
        const message = 'The file is damaged or not a valid GeoTIFF';
        const seen = [];
        const dataset = makeDataset({
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'build', state: 'Failed', errorType: 'DdbException', error: message }]),
            getTask: vi.fn(async () => ({ error: message, artifact: null })),
        });
        const host = makeHost();

        const result = host.trackHeavyTask(dataset, 't1', { notify: false, onProgress: e => seen.push(e.error) });
        result.catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        await expect(result).rejects.toThrow(message);
        expect(seen[0]).toBe(message);
        host.$unmount();
    });

    it('puts the full error text of the task read on the reactive entry, so a status that shows it updates', async () => {
        const full = 'The raster could not be opened: the file is truncated after 1048576 bytes';
        const dataset = makeDataset({
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'build', state: 'Failed', errorType: 'DdbException', error: null }]),
            getTask: vi.fn(async () => ({ error: full, artifact: null })),
        });
        const host = makeHost();
        // What a dialog reads: a watcher runs again only when the write goes through the reactive entry
        const shown = [];
        const scope = effectScope();
        scope.run(() => watch(() => host.heavyTasks.value.t1?.error, error => shown.push(error), { flush: 'sync' }));

        const result = host.trackHeavyTask(dataset, 't1', { notify: false });
        result.catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        await expect(result).rejects.toMatchObject({ message: full });
        expect(host.heavyTasks.value.t1.error).toBe(full);
        expect(shown).toEqual([null, 'DdbException', full]);
        scope.stop();
        host.$unmount();
    });

    it('falls back to the exception type of a task without a message', async () => {
        const seen = [];
        const dataset = makeDataset({
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'build', state: 'Failed', errorType: 'DdbException', error: null }]),
            getTask: vi.fn(async () => ({ error: 'DdbException', artifact: null })),
        });
        const host = makeHost();

        const result = host.trackHeavyTask(dataset, 't1', { notify: false, onProgress: e => seen.push(e.error) });
        result.catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        await expect(result).rejects.toThrow('DdbException');
        expect(seen[0]).toBe('DdbException');
        host.$unmount();
    });

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

describe('a dataset deleted while its task runs (FR-UPL-05, D-004)', () => {
    const notFound = () => new ApiError('Not found', 404);

    it('rejects once with "The dataset was deleted." when the list answers 404 after a Processing summary', async () => {
        let deleted = false;
        const dataset = makeDataset({
            getTasks: vi.fn(async () => {
                if (deleted) throw notFound();
                return [{ taskId: 't1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40 }];
            }),
        });
        const host = makeHost();
        const seen = [];

        const result = host.trackHeavyTask(dataset, 't1', { notify: false, onProgress: e => seen.push(e.state) });
        const settled = vi.fn();
        result.then(settled, settled);
        await vi.advanceTimersByTimeAsync(0);
        expect(seen).toEqual(['Processing']);

        // The rollback deletes the dataset: the monitor's next poll answers 404
        deleted = true;
        await vi.advanceTimersByTimeAsync(20000);

        await expect(result).rejects.toMatchObject({ message: 'The dataset was deleted.', datasetGone: true });
        expect(settled).toHaveBeenCalledTimes(1);
        expect(host.heavyTasks.value.t1).toMatchObject({ error: 'The dataset was deleted.', datasetGone: true });

        // Polling stopped and the monitor was released
        const lists = dataset.getTasks.mock.calls.length;
        const logs = dataset.getTaskLog.mock.calls.length;
        await vi.advanceTimersByTimeAsync(130000);
        expect(dataset.getTasks).toHaveBeenCalledTimes(lists);
        expect(dataset.getTaskLog).toHaveBeenCalledTimes(logs);
        expect(vi.getTimerCount()).toBe(0);
        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
        host.$unmount();
    });

    it('rejects a task that was never listed when the dataset answers 404', async () => {
        const dataset = makeDataset({ getTasks: vi.fn(async () => { throw notFound(); }) });
        const host = makeHost();

        const result = host.trackHeavyTask(dataset, 't1', { notify: false });
        result.catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        await expect(result).rejects.toThrow('The dataset was deleted.');
        await vi.advanceTimersByTimeAsync(130000);
        expect(vi.getTimerCount()).toBe(0);
        host.$unmount();
    });

    it('keeps the terminal state that it saw before the dataset went: the task error, not the deletion', async () => {
        const message = 'The source is not reachable';
        let deleted = false;
        const dataset = makeDataset({
            getTasks: vi.fn(async () => {
                if (deleted) throw notFound();
                return [{ taskId: 't1', toolId: 'import-dataset', state: 'Failed', error: message }];
            }),
            getTask: vi.fn(async () => { throw notFound(); }),
        });
        const host = makeHost();
        const result = host.trackHeavyTask(dataset, 't1', { notify: false });
        result.catch(() => {});
        deleted = true;
        await vi.advanceTimersByTimeAsync(0);

        await expect(result).rejects.toThrow(message);
        host.$unmount();
    });

    it('does not end the task on another failure of the list, which keeps polling', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const dataset = makeDataset({
            getTasks: vi.fn(async () => { throw new ApiError('Server error', 500); }),
        });
        const host = makeHost();
        const settled = vi.fn();
        host.trackHeavyTask(dataset, 't1', { notify: false }).then(settled, settled);
        await vi.advanceTimersByTimeAsync(10000);

        expect(settled).not.toHaveBeenCalled();
        host.$unmount();
        log.mockRestore();
    });
});

describe('what a dialog reads of a task (FR-XC-15)', () => {
    it('tells the caller the task as soon as the submit is answered, before the first poll', async () => {
        const dataset = makeDataset({
            submitTask: vi.fn(async () => ({ taskId: 't1', toolId: 'merge-multispectral' })),
            // Never listed yet: the poll waits
            getTasks: vi.fn(async () => []),
        });
        const host = makeHost();
        const submitted = vi.fn();

        host.runHeavyTask(dataset, 'merge-multispectral', { notify: false, onSubmitted: submitted }).catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        expect(submitted).toHaveBeenCalledOnce();
        expect(submitted.mock.calls[0][0]).toMatchObject({ taskId: 't1', toolId: 'merge-multispectral', state: 'Enqueued', percent: 0 });
        expect(host.heavyTasks.value.t1).toMatchObject({ state: 'Enqueued' });
        host.$unmount();
    });

    it('does not let a failing onSubmitted break the run', async () => {
        const dataset = makeDataset({
            submitTask: vi.fn(async () => ({ taskId: 't1' })),
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'x', state: 'Succeeded' }]),
        });
        const host = makeHost();

        const result = host.runHeavyTask(dataset, 'x', { notify: false, onSubmitted: () => { throw new Error('boom'); } });
        await vi.advanceTimersByTimeAsync(0);
        await expect(result).resolves.toMatchObject({ taskId: 't1', state: 'Succeeded' });
    });

    it('carries the node wait and the canceller of the task into the live entry', async () => {
        const dataset = makeDataset({
            getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'x', state: 'Processing', waitingForNode: true, cancelledBy: 'ann' }]),
        });
        const host = makeHost();

        host.trackHeavyTask(dataset, 't1', { notify: false }).catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        expect(host.heavyTasks.value.t1).toMatchObject({ waitingForNode: true, cancelledBy: 'ann', state: 'Processing' });
        host.$unmount();
    });

    it('reads a summary without the flags as not waiting', async () => {
        const dataset = makeDataset({ getTasks: vi.fn(async () => [{ taskId: 't1', toolId: 'x', state: 'Processing' }]) });
        const host = makeHost();

        host.trackHeavyTask(dataset, 't1', { notify: false }).catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        expect(host.heavyTasks.value.t1).toMatchObject({ waitingForNode: false, cancelledBy: null });
        host.$unmount();
    });
});

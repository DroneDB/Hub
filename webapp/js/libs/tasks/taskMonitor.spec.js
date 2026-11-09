/**
 * Unit tests for libs/tasks/taskMonitor.js:
 * - datasetKey identity helper
 * - 'tasksUpdated' fires when a fetched snapshot changes, not when identical
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import taskMonitor, { datasetKey } from './taskMonitor';
import { ApiError } from '@/libs/ddb/apiError';

let dsSeq = 0;

// Fresh dataset per test (unique baseApi) so the module-level store Map never leaks across tests.
function makeDataset() {
    dsSeq += 1;
    return {
        baseApi: `orgA/ds-${dsSeq}`,
        getTasks: vi.fn(async () => []),
    };
}

function makeTask(over = {}) {
    return {
        taskId: 't1',
        toolId: 'build',
        state: 'Created',
        progressPercent: null,
        phaseMessage: null,
        path: '/flight1/IMG_0001.jpg',
        ...over,
    };
}

describe('datasetKey', () => {
    it('prefers baseApi when present', () => {
        expect(datasetKey({ baseApi: 'org/dsY', org: 'org', slug: 'dsX' })).toBe('org/dsY');
    });

    it('falls back to org/ds', () => {
        // Datasets carry `ds`, not `slug`: the old fallback produced "org/undefined"
        expect(datasetKey({ org: 'org', ds: 'dsX' })).toBe('org/dsX');
    });

    it('returns a string that is stable across dataset instances', () => {
        const d1 = makeDataset();
        const d2 = makeDataset();
        expect(typeof datasetKey(d1)).toBe('string');
        expect(datasetKey(d1)).not.toBe(datasetKey(d2));
    });
});

describe('tasksUpdated event', () => {
    const listeners = [];

    afterEach(() => {
        for (const [evt, fn] of listeners.splice(0)) taskMonitor.off(evt, fn);
    });

    function watch(event) {
        const seen = [];
        const fn = (d) => seen.push(d);
        taskMonitor.on(event, fn);
        listeners.push([event, fn]);
        return seen;
    }

    it('emits when a fetch populates an empty store', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockResolvedValueOnce([makeTask()]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(seen[0].dataset).toBe(dataset);
    });

    it('emits on the first fetch of a dataset with no tasks, which is then loaded', async () => {
        const dataset = makeDataset();
        const seen = watch('tasksUpdated');
        expect(taskMonitor.isLoaded(dataset)).toBe(false);

        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(taskMonitor.isLoaded(dataset)).toBe(true);
    });

    it('is not loaded after a fetch that failed', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockRejectedValueOnce(new Error('offline'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await taskMonitor.forceRefresh(dataset);

        expect(taskMonitor.isLoaded(dataset)).toBe(false);
        error.mockRestore();
    });

    it.each([
        ['actions', { actions: ['viewLog', 'cancel'] }, { actions: ['viewLog'] }],
        ['waitingForNode', { waitingForNode: false }, { waitingForNode: true }],
        ['cancelledBy', { cancelledBy: null }, { cancelledBy: 'alice' }],
        ['targetLabel', { targetLabel: 'a' }, { targetLabel: 'b' }],
    ])('emits when a poll changes only the %s of a task', async (_name, before, after) => {
        const dataset = makeDataset();
        dataset.getTasks.mockResolvedValueOnce([makeTask(before)]).mockResolvedValueOnce([makeTask(after)]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(2);
    });

    it('does not emit when the fetched snapshot is identical to the previous one', async () => {
        const dataset = makeDataset();
        const snapshot = [makeTask(), makeTask({ taskId: 't2', state: 'Succeeded' })];
        dataset.getTasks.mockResolvedValue(snapshot);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(dataset.getTasks).toHaveBeenCalledTimes(2);
        expect(seen).toHaveLength(1); // only the first fetch changed the store
    });

    it('emits when a mission task state, progress or phase changes', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([makeTask({ taskId: 'm1', toolId: 'extract' })])
            .mockResolvedValueOnce([makeTask({ taskId: 'm1', toolId: 'extract', state: 'Processing', progressPercent: 42 })])
            .mockResolvedValueOnce([makeTask({ taskId: 'm1', toolId: 'extract', state: 'Processing', progressPercent: 42, phaseMessage: 'CUT' })]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(3); // every change was detected
    });

    it('emits when a succeeded build starts or stops waiting for files', async () => {
        const dataset = makeDataset();
        const build = over => makeTask({ state: 'Succeeded', path: 'house.obj', ...over });
        dataset.getTasks
            .mockResolvedValueOnce([build({ waitingForFiles: true, missingFiles: ['house.mtl'] })])
            .mockResolvedValueOnce([build({ waitingForFiles: true, missingFiles: ['texture.png'] })])
            .mockResolvedValueOnce([build({ waitingForFiles: false, missingFiles: null })]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(3);
    });

    it('emits when tasks are added or removed', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([makeTask()])
            .mockResolvedValueOnce([]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(2);
    });

    it('scopes the event to its own dataset', async () => {
        const d1 = makeDataset();
        const d2 = makeDataset();
        d1.getTasks.mockResolvedValue([makeTask({ taskId: 'a' })]);
        d2.getTasks.mockResolvedValue([makeTask({ taskId: 'b' })]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(d1);
        await taskMonitor.forceRefresh(d2);

        const datasets = seen.map((d) => d.dataset);
        expect(datasets).toContain(d1);
        expect(datasets).toContain(d2);
        // each snapshot belongs to the dataset it was fetched from
        for (const d of seen) {
            expect(taskMonitor.getTasks(d.dataset)).not.toHaveLength(0);
        }
    });
});

describe('acquire/release refcounting', () => {
    it('keeps polling while a second consumer still holds a reference', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockResolvedValue([makeTask({ state: 'Processing' })]);

        taskMonitor.acquire(dataset);
        taskMonitor.acquire(dataset);
        await Promise.resolve();
        taskMonitor.release(dataset);

        expect(taskMonitor.getTask(dataset, 't1')).not.toBeNull();

        taskMonitor.release(dataset);
    });

    it('discards the snapshot on final release so stale state is never served', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockResolvedValue([makeTask({ state: 'Processing' })]);

        taskMonitor.acquire(dataset);
        await Promise.resolve();
        expect(taskMonitor.getTasks(dataset)).toHaveLength(1);

        taskMonitor.release(dataset);

        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
        expect(taskMonitor.getTask(dataset, 't1')).toBeNull();
        expect(taskMonitor.hasActiveTasks(dataset)).toBe(false);
    });

    it('stops fetching after release', async () => {
        vi.useFakeTimers();
        try {
            const dataset = makeDataset();
            dataset.getTasks.mockResolvedValue([makeTask({ state: 'Processing' })]);

            taskMonitor.acquire(dataset);
            // First tick is scheduled at the idle interval: the store is still empty.
            await vi.advanceTimersByTimeAsync(16000);
            const callsWhileLive = dataset.getTasks.mock.calls.length;
            expect(callsWhileLive).toBeGreaterThan(1);

            taskMonitor.release(dataset);
            await vi.advanceTimersByTimeAsync(10000);

            expect(dataset.getTasks).toHaveBeenCalledTimes(callsWhileLive);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reading an unknown dataset does not create a store entry', () => {
        const dataset = makeDataset();
        expect(taskMonitor.getTasks(dataset)).toHaveLength(0);
        // A resurrected entry would make the next release() a no-op and leak the timer.
        taskMonitor.release(dataset);
        expect(taskMonitor.getTask(dataset, 't1')).toBeNull();
    });
});

describe('datasetGone event (FR-UPL-05, D-004)', () => {
    const listeners = [];

    afterEach(() => {
        for (const [evt, fn] of listeners.splice(0)) taskMonitor.off(evt, fn);
    });

    function watch(event) {
        const seen = [];
        const fn = (d) => seen.push(d);
        taskMonitor.on(event, fn);
        listeners.push([event, fn]);
        return seen;
    }

    it('fires once when the task list answers 404, the dataset having been deleted by a rollback', async () => {
        const dataset = makeDataset();
        const error = new ApiError('Not found', 404);
        dataset.getTasks.mockRejectedValue(error);
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = watch('datasetGone');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({ dataset, error });
        // Not read again once it is gone, and not reported as a failed fetch
        expect(dataset.getTasks).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
        log.mockRestore();
    });

    it('does not fire for another failure, which keeps polling', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockRejectedValue(new ApiError('Server error', 500));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = watch('datasetGone');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(0);
        expect(dataset.getTasks).toHaveBeenCalledTimes(2);
        log.mockRestore();
    });

    it('ends the running tasks of a dataset that answers 404 after a Processing list, once', async () => {
        const dataset = makeDataset();
        dataset.getTasks.mockResolvedValueOnce([makeTask({ state: 'Processing' })]);
        const seen = watch('datasetGone');

        await taskMonitor.forceRefresh(dataset);
        expect(taskMonitor.hasActiveTasks(dataset)).toBe(true);
        expect(taskMonitor.isGone(dataset)).toBe(false);

        dataset.getTasks.mockRejectedValue(new ApiError('Not found', 404));
        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(taskMonitor.isGone(dataset)).toBe(true);
        // Nothing runs in a deleted dataset; the last list stays readable, frozen
        expect(taskMonitor.hasActiveTasks(dataset)).toBe(false);
        expect(taskMonitor.getTask(dataset, 't1')).toMatchObject({ state: 'Processing' });
        expect(dataset.getTasks).toHaveBeenCalledTimes(2);
    });

    it('is not gone for a dataset it does not know', () => {
        expect(taskMonitor.isGone(makeDataset())).toBe(false);
    });

    it('stops the polling of a dataset that is gone', async () => {
        vi.useFakeTimers();
        try {
            const dataset = makeDataset();
            dataset.getTasks.mockRejectedValue(new ApiError('Not found', 404));
            taskMonitor.acquire(dataset);
            await vi.advanceTimersByTimeAsync(130000);
            expect(dataset.getTasks).toHaveBeenCalledTimes(1);
            taskMonitor.release(dataset);
        } finally {
            vi.useRealTimers();
        }
    });
});

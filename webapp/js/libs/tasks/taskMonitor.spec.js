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

/**
 * Background imports (FR-UPL-10, FR-XC-16): the store tracks an import that outlives its dialog and page, tells once when it
 * ends, and lets the dataset's monitor go.
 */
describe('background imports', () => {
    const listeners = [];
    afterEach(() => {
        for (const [evt, fn] of listeners.splice(0)) taskMonitor.off(evt, fn);
    });
    function watch(event) {
        const seen = [];
        const fn = d => seen.push(d);
        taskMonitor.on(event, fn);
        listeners.push([event, fn]);
        return seen;
    }
    const importTask = over => makeTask({ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40, path: null, ...over });
    function datasetWith(listRef) {
        const dataset = makeDataset();
        dataset.getTasks.mockImplementation(async () => listRef.tasks);
        return dataset;
    }

    it('keeps the dataset followed while the import runs, and lists it with its progress', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);

        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.getImports(dataset)).toHaveLength(1));

        expect(taskMonitor.getImports(dataset)[0]).toMatchObject({ taskId: 'imp1', progressPercent: 40 });
        list.tasks = [importTask({ state: 'Succeeded', progressPercent: 100 })];
        await taskMonitor.forceRefresh(dataset);
    });

    it('says once when the import ends, with its last state, and lets the monitor go', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
        expect(ended).toHaveLength(0);

        list.tasks = [importTask({ state: 'Succeeded', progressPercent: 100 })];
        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ dataset, gone: false, task: { taskId: 'imp1', state: 'Succeeded' } });
        // The reference of the track is released: with no other holder the store is dropped
        expect(taskMonitor.getImports(dataset)).toEqual([]);
    });

    it('says a failed import ended, and tracks one task once', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');
        taskMonitor.trackImport(dataset, 'imp1');
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        list.tasks = [importTask({ state: 'Failed' })];
        await taskMonitor.forceRefresh(dataset);

        expect(dataset.getTasks).toHaveBeenCalled();
        expect(ended).toHaveLength(1);
        expect(ended[0].task.state).toBe('Failed');
    });

    it('says the import ended when its dataset is gone (the rollback of a failed import deletes it)', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        dataset.getTasks.mockRejectedValue(new ApiError('not found', 404));
        await taskMonitor.forceRefresh(dataset);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ gone: true, task: { taskId: 'imp1' } });
    });

    it('finds the imports that run after a reload with one task-list request, and tracks them', async () => {
        const list = { tasks: [makeTask({ taskId: 'b1', state: 'Succeeded' }), importTask(), importTask({ taskId: 'old', state: 'Succeeded' })] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');

        const running = await taskMonitor.findImports(dataset);

        expect(running.map(t => t.taskId)).toEqual(['imp1']);
        expect(dataset.getTasks.mock.calls.length).toBeGreaterThanOrEqual(1);
        await vi.waitFor(() => expect(taskMonitor.getImports(dataset)).toHaveLength(1));
        list.tasks = [importTask({ state: 'Succeeded' })];
        await taskMonitor.forceRefresh(dataset);
        expect(ended).toHaveLength(1);
    });

    // The list holds the newest 200 tasks: a run with many builds pushes the import out of it
    describe('an import the task list leaves out', () => {
        const builds = n => Array.from({ length: n }, (_, i) => makeTask({ taskId: `b${i}`, state: 'Processing' }));

        it('is asked for by id and ends when that says it ended', async () => {
            const list = { tasks: [importTask()] };
            const dataset = datasetWith(list);
            dataset.getTask = vi.fn(async () => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Succeeded', progress: { percent: 100 } }));
            const ended = watch('importEnded');
            taskMonitor.trackImport(dataset, 'imp1');
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
            expect(dataset.getTask).not.toHaveBeenCalled();

            list.tasks = builds(200);
            await taskMonitor.forceRefresh(dataset);
            await vi.waitFor(() => expect(ended).toHaveLength(1));

            expect(dataset.getTask).toHaveBeenCalledWith('imp1');
            expect(ended[0]).toMatchObject({ dataset, gone: false, task: { taskId: 'imp1', toolId: 'import-dataset', state: 'Succeeded' } });
            // Let go: the next poll does not ask again
            await taskMonitor.forceRefresh(dataset);
            expect(dataset.getTask).toHaveBeenCalledTimes(1);
        });

        it('keeps following it while it runs', async () => {
            const list = { tasks: [] };
            const dataset = datasetWith(list);
            dataset.getTask = vi.fn(async () => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing' }));
            const ended = watch('importEnded');
            taskMonitor.trackImport(dataset, 'imp1');
            await vi.waitFor(() => expect(dataset.getTask).toHaveBeenCalledTimes(1));
            await Promise.resolve();
            expect(ended).toHaveLength(0);

            dataset.getTask.mockResolvedValue({ taskId: 'imp1', toolId: 'import-dataset', state: 'Failed', error: 'Archive is corrupt' });
            await taskMonitor.forceRefresh(dataset);
            await vi.waitFor(() => expect(ended).toHaveLength(1));
            expect(ended[0].task).toMatchObject({ state: 'Failed', error: 'Archive is corrupt' });
        });

        it('ends, as it was last seen, when the task is not found any more', async () => {
            const list = { tasks: [importTask()] };
            const dataset = datasetWith(list);
            dataset.getTask = vi.fn(async () => { throw new ApiError('Not found', 404); });
            const ended = watch('importEnded');
            taskMonitor.trackImport(dataset, 'imp1');
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

            list.tasks = builds(3);
            await taskMonitor.forceRefresh(dataset);
            await vi.waitFor(() => expect(ended).toHaveLength(1));
            expect(ended[0]).toMatchObject({ gone: false, task: { taskId: 'imp1', state: 'Processing' } });
        });

        it('is asked for again on the next poll when the request failed', async () => {
            const list = { tasks: builds(2) };
            const dataset = datasetWith(list);
            dataset.getTask = vi.fn(async () => { throw new ApiError('Server error', 500); });
            const ended = watch('importEnded');
            taskMonitor.trackImport(dataset, 'imp1');
            await vi.waitFor(() => expect(dataset.getTask).toHaveBeenCalledTimes(1));

            dataset.getTask.mockResolvedValue({ taskId: 'imp1', state: 'Succeeded' });
            await taskMonitor.forceRefresh(dataset);
            await vi.waitFor(() => expect(ended).toHaveLength(1));
            expect(dataset.getTask).toHaveBeenCalledTimes(2);
        });
    });

    it('finds nothing, and tracks nothing, for a dataset with no import running or whose list cannot be read', async () => {
        const quiet = datasetWith({ tasks: [importTask({ state: 'Succeeded' })] });
        expect(await taskMonitor.findImports(quiet)).toEqual([]);
        expect(quiet.getTasks).toHaveBeenCalledTimes(1);

        const broken = makeDataset();
        broken.getTasks.mockRejectedValue(new Error('offline'));
        expect(await taskMonitor.findImports(broken)).toEqual([]);
    });
});

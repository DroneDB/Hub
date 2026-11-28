/**
 * Unit tests for libs/tasks/taskMonitor.js:
 * - datasetKey identity helper
 * - 'tasksUpdated' fires when a fetched snapshot changes, not when identical
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import taskMonitor, { datasetKey, toolOfBusy } from './taskMonitor';
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

// refreshing a dataset reads what the monitor follows: the datasets that a test refreshes are followed, as the page that
// shows them does. The first request of a followed dataset is left unanswered, so the test is the one that fills the store.
const followedDatasets = [];

function followed(dataset) {
    const getTasks = dataset.getTasks;
    dataset.getTasks = vi.fn(() => new Promise(() => { }));
    taskMonitor.acquire(dataset);
    dataset.getTasks = getTasks;
    followedDatasets.push(dataset);
    return dataset;
}

afterEach(() => {
    for (const dataset of followedDatasets.splice(0)) taskMonitor.release(dataset);
});

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

describe('toolOfBusy', () => {
    it('gives the tool of a busy kind, and null for a kind it does not know', () => {
        expect(toolOfBusy('importing')).toBe('import-dataset');
        expect(toolOfBusy('rescanning')).toBe('rescan-index');
        expect(toolOfBusy('compacting')).toBeNull();
        expect(toolOfBusy(null)).toBeNull();
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
        const dataset = followed(makeDataset());
        dataset.getTasks.mockResolvedValueOnce([makeTask()]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(seen[0].dataset).toBe(dataset);
    });

    it('emits on the first fetch of a dataset with no tasks, which is then loaded', async () => {
        const dataset = followed(makeDataset());
        const seen = watch('tasksUpdated');
        expect(taskMonitor.isLoaded(dataset)).toBe(false);

        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(taskMonitor.isLoaded(dataset)).toBe(true);
    });

    it('is not loaded after a fetch that failed', async () => {
        const dataset = followed(makeDataset());
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
        const dataset = followed(makeDataset());
        dataset.getTasks.mockResolvedValueOnce([makeTask(before)]).mockResolvedValueOnce([makeTask(after)]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(2);
    });

    it('does not emit when the fetched snapshot is identical to the previous one', async () => {
        const dataset = followed(makeDataset());
        const snapshot = [makeTask(), makeTask({ taskId: 't2', state: 'Succeeded' })];
        dataset.getTasks.mockResolvedValue(snapshot);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(dataset.getTasks).toHaveBeenCalledTimes(2);
        expect(seen).toHaveLength(1); // only the first fetch changed the store
    });

    it('emits when a mission task state, progress or phase changes', async () => {
        const dataset = followed(makeDataset());
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
        const dataset = followed(makeDataset());
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
        const dataset = followed(makeDataset());
        dataset.getTasks
            .mockResolvedValueOnce([makeTask()])
            .mockResolvedValueOnce([]);
        const seen = watch('tasksUpdated');

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(2);
    });

    it('scopes the event to its own dataset', async () => {
        const d1 = followed(makeDataset());
        const d2 = followed(makeDataset());
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

    it('tells every list it shows, changed or not, with the number of its request, and none that failed or came late', async () => {
        const dataset = followed(makeDataset());
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = watch('tasksListed');
        // The request of followed() is the first one
        expect(taskMonitor.listRequests(dataset)).toBe(1);

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset); // the same list again
        dataset.getTasks.mockRejectedValueOnce(new Error('offline'));
        await taskMonitor.forceRefresh(dataset);
        // A request answered after a later one was shown
        let late;
        dataset.getTasks.mockImplementationOnce(() => new Promise(resolve => { late = resolve; }));
        const slow = taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);
        late([]);
        await slow;

        expect(seen.map(d => d.request)).toEqual([2, 3, 6]);
        expect(seen.every(d => d.dataset === dataset)).toBe(true);
        expect(taskMonitor.listRequests(dataset)).toBe(6);
        // A dataset that is not followed gets no list
        expect(taskMonitor.listRequests(makeDataset())).toBeNull();
        error.mockRestore();
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

describe('datasetGone event', () => {
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
        const dataset = followed(makeDataset());
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
        const dataset = followed(makeDataset());
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
        const dataset = followed(makeDataset());
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
 * Busy datasets: the store tracks a task that keeps its dataset busy (an import, a rescan) and outlives its dialog and page,
 * tells once when it ends ('busyEnded', and 'importEnded' for an import), and lets the dataset's monitor go.
 */
describe('busy datasets', () => {
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

    it('keeps the dataset followed while the import runs, and gives it as the busy state with its progress', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);

        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
        await vi.waitFor(() => expect(taskMonitor.getBusy(dataset)).not.toBeNull());

        expect(taskMonitor.getBusy(dataset)).toEqual({ kind: 'importing', taskId: 'imp1', progress: 40 });
        list.tasks = [importTask({ state: 'Succeeded', progressPercent: 100 })];
        await taskMonitor.forceRefresh(dataset);
    });

    it('says once when the import ends, with its last state, and lets the monitor go', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');
        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
        expect(ended).toHaveLength(0);

        list.tasks = [importTask({ state: 'Succeeded', progressPercent: 100 })];
        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ dataset, gone: false, task: { taskId: 'imp1', state: 'Succeeded' } });
        // The reference of the track is released: with no other holder the store is dropped
        expect(taskMonitor.getBusy(dataset)).toBeNull();
    });

    it('says a failed import ended, and tracks one task once', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const ended = watch('importEnded');
        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
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
        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        dataset.getTasks.mockRejectedValue(new ApiError('not found', 404));
        await taskMonitor.forceRefresh(dataset);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ gone: true, task: { taskId: 'imp1' } });
    });

    // The list holds the newest 200 tasks: a run with many builds pushes the import out of it
    describe('an import the task list leaves out', () => {
        const builds = n => Array.from({ length: n }, (_, i) => makeTask({ taskId: `b${i}`, state: 'Processing' }));

        it('is asked for by id and ends when that says it ended', async () => {
            const list = { tasks: [importTask()] };
            const dataset = datasetWith(list);
            dataset.getTask = vi.fn(async () => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Succeeded', progress: { percent: 100 } }));
            const ended = watch('importEnded');
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
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
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
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
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
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
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
            await vi.waitFor(() => expect(dataset.getTask).toHaveBeenCalledTimes(1));

            dataset.getTask.mockResolvedValue({ taskId: 'imp1', state: 'Succeeded' });
            await taskMonitor.forceRefresh(dataset);
            await vi.waitFor(() => expect(ended).toHaveLength(1));
            expect(dataset.getTask).toHaveBeenCalledTimes(2);
        });
    });

    it('says a rescan ended with busyEnded and its kind, and gives no importEnded for it', async () => {
        const list = { tasks: [importTask({ taskId: 'r1', toolId: 'rescan-index', progressPercent: null })] };
        const dataset = datasetWith(list);
        const busyEnded = watch('busyEnded');
        const importEnded = watch('importEnded');
        taskMonitor.trackBusy(dataset, 'r1', 'rescanning');
        await vi.waitFor(() => expect(taskMonitor.getBusy(dataset)).toEqual({ kind: 'rescanning', taskId: 'r1', progress: null }));

        list.tasks = [importTask({ taskId: 'r1', toolId: 'rescan-index', state: 'Succeeded' })];
        await taskMonitor.forceRefresh(dataset);

        expect(busyEnded).toHaveLength(1);
        expect(busyEnded[0]).toMatchObject({ dataset, gone: false, kind: 'rescanning', task: { taskId: 'r1', state: 'Succeeded' } });
        expect(importEnded).toHaveLength(0);
    });

    it('reads the kind from the tool of the task when the caller does not know it', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const busyEnded = watch('busyEnded');
        const importEnded = watch('importEnded');
        taskMonitor.trackBusy(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        list.tasks = [importTask({ state: 'Failed' })];
        await taskMonitor.forceRefresh(dataset);

        expect(busyEnded[0].kind).toBe('importing');
        expect(importEnded).toHaveLength(1);
    });

    it('asks a store that is already followed for its list at once, so a task just started shows as busy', async () => {
        const list = { tasks: [] };
        const dataset = datasetWith(list);
        taskMonitor.acquire(dataset);
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
        const asked = dataset.getTasks.mock.calls.length;

        list.tasks = [importTask({ taskId: 'r2', toolId: 'rescan-index', progressPercent: 0 })];
        taskMonitor.trackBusy(dataset, 'r2', 'rescanning');
        await vi.waitFor(() => expect(taskMonitor.getBusy(dataset)).toMatchObject({ kind: 'rescanning', taskId: 'r2' }));

        expect(dataset.getTasks.mock.calls.length).toBe(asked + 1);
        list.tasks = [importTask({ taskId: 'r2', toolId: 'rescan-index', state: 'Succeeded' })];
        await taskMonitor.forceRefresh(dataset);
        taskMonitor.release(dataset);
    });

    it('lets the tracks of a dataset go without telling (its delete stops the task), and releases the monitor', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        const busyEnded = watch('busyEnded');
        const importEnded = watch('importEnded');
        taskMonitor.trackBusy(dataset, 'imp1', 'importing');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        taskMonitor.forgetBusy(dataset);
        taskMonitor.forgetBusy(dataset);

        expect(taskMonitor.isLoaded(dataset)).toBe(false);
        expect(busyEnded).toHaveLength(0);
        expect(importEnded).toHaveLength(0);
    });

    describe('a task the user cancelled', () => {
        it('ends an import cancelled, also when its dataset is gone before its list said so, and follows the dataset until it is', async () => {
            const list = { tasks: [importTask()] };
            const dataset = datasetWith(list);
            const importEnded = watch('importEnded');
            const gone = watch('datasetGone');
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

            expect(taskMonitor.followCancelled(dataset, { taskId: 'imp1', toolId: 'import-dataset' })).toBe(true);
            // The list still has it running: the dataset is being deleted meanwhile
            expect(taskMonitor.getBusy(dataset)).toEqual({ kind: 'importing', taskId: 'imp1', progress: 40 });
            list.tasks = [importTask({ state: 'Deleted' })];
            await taskMonitor.forceRefresh(dataset);
            expect(importEnded).toHaveLength(1);
            expect(importEnded[0].task.state).toBe('Deleted');
            expect(taskMonitor.getBusy(dataset)).toEqual({ kind: 'deleting', taskId: 'imp1', progress: null });

            dataset.getTasks.mockRejectedValue(new ApiError('Not found', 404));
            await taskMonitor.forceRefresh(dataset);
            expect(gone).toHaveLength(1);
            expect(importEnded).toHaveLength(1);
            // Let go: no store is kept for it
            expect(taskMonitor.isGone(dataset)).toBe(false);
        });

        it('says the import was cancelled when the dataset goes while its last list had it running', async () => {
            const list = { tasks: [importTask()] };
            const dataset = datasetWith(list);
            const importEnded = watch('importEnded');
            taskMonitor.trackBusy(dataset, 'imp1', 'importing');
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

            taskMonitor.followCancelled(dataset, { taskId: 'imp1', toolId: 'import-dataset' });
            dataset.getTasks.mockRejectedValue(new ApiError('Not found', 404));
            await taskMonitor.forceRefresh(dataset);

            expect(importEnded).toHaveLength(1);
            expect(importEnded[0]).toMatchObject({ gone: true, task: { taskId: 'imp1', toolId: 'import-dataset', state: 'Deleted' } });
        });

        it('ends a cancelled rescan with busyEnded, follows nothing after it, and asks the caller to say it', async () => {
            const list = { tasks: [importTask({ taskId: 'r1', toolId: 'rescan-index' })] };
            const dataset = datasetWith(list);
            const busyEnded = watch('busyEnded');

            expect(taskMonitor.followCancelled(dataset, { taskId: 'r1', toolId: 'rescan-index' })).toBe(false);
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
            list.tasks = [importTask({ taskId: 'r1', toolId: 'rescan-index', state: 'Deleted' })];
            await taskMonitor.forceRefresh(dataset);

            expect(busyEnded).toHaveLength(1);
            expect(busyEnded[0]).toMatchObject({ kind: 'rescanning', task: { state: 'Deleted' } });
            expect(taskMonitor.getBusy(dataset)).toBeNull();
        });

        it('does nothing for a task that keeps no dataset busy, and lets the dataset go when the user deletes it', async () => {
            const dataset = datasetWith({ tasks: [importTask()] });
            expect(taskMonitor.followCancelled(dataset, { taskId: 'b1', toolId: 'build' })).toBe(false);
            expect(taskMonitor.isLoaded(dataset)).toBe(false);

            taskMonitor.followCancelled(dataset, { taskId: 'imp1', toolId: 'import-dataset' });
            await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
            taskMonitor.forgetBusy(dataset);
            expect(taskMonitor.isLoaded(dataset)).toBe(false);
        });
    });

    it('gives no busy state for the other tools, for tasks that ended, or for a dataset it does not follow', async () => {
        const list = { tasks: [makeTask({ taskId: 'b1', state: 'Processing' }), importTask({ taskId: 'old', state: 'Succeeded' }),
            makeTask({ taskId: 'f1', toolId: 'import-file', state: 'Processing' })] };
        const dataset = datasetWith(list);
        taskMonitor.acquire(dataset);
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        expect(taskMonitor.getBusy(dataset)).toBeNull();
        expect(taskMonitor.getBusy(makeDataset())).toBeNull();
        taskMonitor.release(dataset);
    });
});

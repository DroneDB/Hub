/**
 * Unit tests for libs/tasks/taskMonitor.js:
 * - datasetKey identity helper
 * - 'tasksUpdated' fires when a fetched snapshot changes, not when identical
 * - 'buildStateChanged' regression: only for build tasks whose state changed
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import taskMonitor, { datasetKey } from './taskMonitor';

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

    it('falls back to org/slug', () => {
        expect(datasetKey({ org: 'org', slug: 'dsX' })).toBe('org/dsX');
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

describe('buildStateChanged event (regression)', () => {
    const listeners = [];

    afterEach(() => {
        for (const [evt, fn] of listeners.splice(0)) taskMonitor.off(evt, fn);
    });

    function watch() {
        const seen = [];
        const fn = (d) => seen.push(d);
        taskMonitor.on('buildStateChanged', fn);
        listeners.push(['buildStateChanged', fn]);
        return seen;
    }

    it('fires for a build task whose state changed', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([makeTask({ state: 'Enqueued' })])
            .mockResolvedValueOnce([makeTask({ state: 'Processing' })]);
        const seen = watch();

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(1);
        expect(seen[0].previousState).toBe('Enqueued');
        expect(seen[0].newState).toBe('Processing');
        expect(seen[0].filePath).toBe('/flight1/IMG_0001.jpg');
    });

    it('does not fire for non-build tasks', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([makeTask({ toolId: 'extract' })])
            .mockResolvedValueOnce([makeTask({ toolId: 'extract', state: 'Succeeded' })]);
        const seen = watch();

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(0);
    });

    it('does not fire for a brand-new build task (no previous snapshot)', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([makeTask({ state: 'Enqueued' })]);
        const seen = watch();

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(0);
    });

    it('does not fire when the state is unchanged', async () => {
        const dataset = makeDataset();
        dataset.getTasks
            .mockResolvedValueOnce([makeTask({ state: 'Enqueued' })])
            .mockResolvedValueOnce([makeTask({ state: 'Enqueued' })]);
        const seen = watch();

        await taskMonitor.forceRefresh(dataset);
        await taskMonitor.forceRefresh(dataset);

        expect(seen).toHaveLength(0);
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

/**
 * useBuildCompletion (FR-XC-16): the one wait for a build. onEnd runs when a build of one of the paths ends (a terminal
 * state), never for another file, another dataset or a state that is still active; the dataset's builds are followed
 * while the view lives, and the dataset page that follows the same dataset is not disturbed by a view that goes away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, nextTick, ref, watch } from 'vue';

vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), isLoaded: vi.fn(() => true),
        acquire: vi.fn(), release: vi.fn(), forceRefresh: vi.fn(), onFilesAdded: vi.fn()
    }
}));
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const { useBuildCompletion } = await import('./useBuildCompletion');

const PATH = 'model/OfficePlan.obj';
const dataset = { baseApi: '/orgs/o/ds/d', org: 'o', ds: 'd' };
const task = (state, extra = {}) => ({ taskId: 't1', toolId: 'build', path: PATH, state, createdAt: '2026-11-01T10:00:00Z', ...extra });

function listChanges(tasks, ds = dataset) {
    taskMonitor.getTasks.mockReturnValue(tasks);
    const handler = taskMonitor.on.mock.calls.filter(([event]) => event === 'tasksUpdated').map(c => c[1]).at(-1);
    handler({ dataset: ds });
}

describe('useBuildCompletion', () => {
    beforeEach(() => {
        BuildManager.cleanup();
        taskMonitor.on.mockClear();
        taskMonitor.acquire.mockClear();
        taskMonitor.release.mockClear();
        taskMonitor.getTasks.mockReturnValue([]);
    });

    it('calls onEnd once when the build of the path succeeds, not while it is queued or running', () => {
        const onEnd = vi.fn();
        const scope = effectScope();
        scope.run(() => useBuildCompletion(dataset, [PATH], onEnd));

        listChanges([task('Enqueued')]);
        listChanges([task('Processing')]);
        expect(onEnd).not.toHaveBeenCalled();

        listChanges([task('Succeeded')]);
        expect(onEnd).toHaveBeenCalledOnce();
        expect(onEnd).toHaveBeenCalledWith({ filePath: PATH, state: 'Succeeded', succeeded: true, dataset });
        scope.stop();
    });

    it('says when the build failed too, as not succeeded', () => {
        const onEnd = vi.fn();
        const scope = effectScope();
        scope.run(() => useBuildCompletion(dataset, [PATH], onEnd));
        listChanges([task('Processing')]);
        listChanges([task('Failed')]);

        expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ state: 'Failed', succeeded: false }));
        scope.stop();
    });

    it('ignores the build of another file and of another dataset', () => {
        const onEnd = vi.fn();
        const scope = effectScope();
        scope.run(() => useBuildCompletion(dataset, [PATH], onEnd));
        listChanges([task('Processing', { path: 'other.obj' })]);
        listChanges([task('Succeeded', { path: 'other.obj' })]);
        expect(onEnd).not.toHaveBeenCalled();
        scope.stop();
    });

    it('takes its dataset and its paths from refs and getters: a viewer has its dataset once the entry loaded', () => {
        const onEnd = vi.fn();
        const ds = ref(null);
        const path = ref(PATH);
        const scope = effectScope();
        scope.run(() => useBuildCompletion(() => ds.value, () => [path.value], onEnd));
        expect(taskMonitor.acquire).not.toHaveBeenCalled();

        ds.value = dataset;
        // Followed from the moment it has one (watch flush is sync for the first value only: let it run)
        return Promise.resolve().then(() => {
            expect(taskMonitor.acquire).toHaveBeenCalledOnce();
            listChanges([task('Processing')]);
            listChanges([task('Succeeded')]);
            expect(onEnd).toHaveBeenCalledOnce();
            scope.stop();
        });
    });

    it('gives the build it shows, reactively: its state, whether it runs and how far it is', () => {
        const scope = effectScope();
        const completion = scope.run(() => useBuildCompletion(dataset, [PATH]));
        expect(completion.buildState.value).toBeNull();
        expect(completion.building.value).toBe(false);

        listChanges([task('Processing', { progressPercent: 40 })]);
        expect(completion.buildState.value).toEqual({ path: PATH, currentState: 'Processing' });
        expect(completion.building.value).toBe(true);
        expect(completion.percent.value).toBe(40);

        listChanges([task('Succeeded', { progressPercent: 100 })]);
        expect(completion.building.value).toBe(false);
        scope.stop();
    });

    it('keeps the build it shows when a poll changes nothing: a view that shows it is not told again', async () => {
        const scope = effectScope();
        const completion = scope.run(() => useBuildCompletion(dataset, [PATH]));
        const seen = vi.fn();
        scope.run(() => watch(completion.buildState, seen));
        listChanges([task('Processing', { progressPercent: 40 })]);
        const shown = completion.buildState.value;
        await nextTick();
        expect(seen).toHaveBeenCalledTimes(1);

        // Two polls with the same state (each gives the BuildManager a new map of new objects)
        listChanges([task('Processing', { progressPercent: 40 })]);
        listChanges([task('Processing', { progressPercent: 40 })]);
        await nextTick();
        expect(completion.buildState.value).toBe(shown);
        expect(seen).toHaveBeenCalledTimes(1);

        listChanges([task('Succeeded')]);
        await nextTick();
        expect(seen).toHaveBeenCalledTimes(2);
        expect(completion.buildState.value).toEqual({ path: PATH, currentState: 'Succeeded' });
        scope.stop();
    });

    it('listens to the build events only while it has a dataset', async () => {
        const listeners = () => BuildManager.eventListeners.buildStateChanged?.size ?? 0;
        const ds = ref(null);
        const scope = effectScope();
        scope.run(() => useBuildCompletion(() => ds.value, [PATH], vi.fn()));
        expect(listeners()).toBe(0);

        ds.value = dataset;
        await nextTick();
        expect(listeners()).toBe(1);

        ds.value = null;
        await nextTick();
        expect(listeners()).toBe(0);

        ds.value = dataset;
        await nextTick();
        scope.stop();
        expect(listeners()).toBe(0);
    });

    it('stops listening and lets the dataset go when its scope ends, but not while the page follows it too', () => {
        const onEnd = vi.fn();
        BuildManager.registerDataset(dataset); // the dataset page
        const scope = effectScope();
        scope.run(() => useBuildCompletion(dataset, [PATH], onEnd));
        expect(taskMonitor.acquire).toHaveBeenCalledOnce();

        scope.stop();
        expect(taskMonitor.release).not.toHaveBeenCalled();
        listChanges([task('Processing')]);
        listChanges([task('Succeeded')]);
        expect(onEnd).not.toHaveBeenCalled();

        BuildManager.unregisterDataset(dataset);
        expect(taskMonitor.release).toHaveBeenCalledOnce();
    });
});

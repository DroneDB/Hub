/**
 * BuildManager: the jobs give progress and failures; whether new files still need a build is
 * what their entries list, not whether a job once succeeded.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';

vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), isLoaded: vi.fn(() => true), acquire: vi.fn(), release: vi.fn(), forceRefresh: vi.fn(), onFilesAdded: vi.fn() } }));
const { default: manager } = await import('./buildManager');

const T = ddb.entry.type;
const COG = { role: 'raster.cog', url: '/orgs/o/ds/d/build/h/cog/cog.tif' };
const dataset = { baseApi: '/orgs/o/ds/d' };

describe('hasNewBuildableFiles', () => {
    it('is false for entries that are not buildable', () => {
        expect(manager.hasNewBuildableFiles(dataset, [{ path: 'a.jpg', type: T.IMAGE }])).toBe(false);
    });

    it('is false when every buildable entry lists a complete build', () => {
        expect(manager.hasNewBuildableFiles(dataset, [{ path: 'a.tif', type: T.GEORASTER, artifacts: [COG] }])).toBe(false);
    });

    it('is true for a buildable entry with no build, on hold, queued or failed', () => {
        for (const extra of [{}, { buildStatus: 'queued' }, { buildStatus: 'pending' }, { buildStatus: 'failed' }, { artifacts: [COG], buildStatus: 'building' }]) {
            expect(manager.hasNewBuildableFiles(dataset, [{ path: 'a.tif', type: T.GEORASTER, ...extra }])).toBe(true);
        }
    });

    it('does not depend on a job: a job that succeeded does not make the entry built', () => {
        manager._buildByPath.set(manager.getDatasetKey(dataset), new Map([['a.tif', { path: 'a.tif', state: 'Succeeded' }]]));
        expect(manager.hasNewBuildableFiles(dataset, [{ path: 'a.tif', type: T.GEORASTER }])).toBe(true);
        manager._buildByPath.clear();
    });
});

describe('buildable types come from the server', () => {
    it('counts Tiles3D as buildable (the Hub list used to omit it) and follows a changed list', () => {
        const tiles = [{ path: 'city.3tz', type: T.TILES3D }];
        expect(manager.hasNewBuildableFiles(dataset, tiles)).toBe(true);
        reg.features.values = { entryTypes: [{ id: T.TILES3D, buildable: false, thumbnail: 'none' }] };
        expect(manager.hasNewBuildableFiles(dataset, tiles)).toBe(false);
        reg.features.clear();
    });
});

describe('the build state of a file follows the task list', async () => {
    const { computed } = await import('vue');
    const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
    const PATH = 'odm_texturing/model.obj';
    const task = (taskId, state, createdAt, path = PATH) => ({ taskId, toolId: 'build', state, path, createdAt });
    const failed = task('5264', 'Failed', '2026-10-26T01:34:31Z');
    const succeeded = task('5296', 'Succeeded', '2026-10-26T02:03:35Z');

    // A registered dataset and the 'tasksUpdated' notification of the task monitor
    function setup(initialTasks, { loaded = true } = {}) {
        manager.cleanup();
        taskMonitor.on.mockClear();
        taskMonitor.isLoaded.mockReturnValue(loaded);
        taskMonitor.getTasks.mockReturnValue(initialTasks);
        const ds = { baseApi: `/orgs/o/ds/${Math.random()}`, listOne: vi.fn(async () => ({ path: PATH, type: T.MODEL })), build: vi.fn(async () => true) };
        manager.registerDataset(ds);
        const [, onTasksUpdated] = taskMonitor.on.mock.calls.find(([event]) => event === 'tasksUpdated');
        const listChanges = tasks => { taskMonitor.getTasks.mockReturnValue(tasks); onTasksUpdated({ dataset: ds }); };
        const events = [];
        manager.on('buildStateChanged', e => events.push(e));
        return { ds, listChanges, events, state: () => manager.getBuildState(ds, PATH)?.currentState ?? null };
    }

    // A dataset opened as the page does it: the task monitor has not fetched its list yet
    function setupBeforeFetch() {
        const page = setup([], { loaded: false });
        const fetched = tasks => { taskMonitor.isLoaded.mockReturnValue(true); page.listChanges(tasks); };
        return { ...page, fetched };
    }

    it('is the newest build of the file, not an older one that failed (the list is newest first)', () => {
        const { state } = setup([succeeded, failed]);
        expect(state()).toBe('Succeeded');
    });

    it('drops a failed build once its task is deleted, and says so once', () => {
        const { listChanges, events, state } = setup([failed]);
        listChanges([]);
        expect(state()).toBeNull();
        expect(events).toEqual([expect.objectContaining({ filePath: PATH, previousState: 'Failed', newState: null })]);
    });

    it('shows a new build that succeeded between two looks at the list, and says so once', () => {
        const { listChanges, events, state } = setup([failed]);
        listChanges([succeeded, failed]);
        expect(state()).toBe('Succeeded');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ previousState: 'Failed', newState: 'Succeeded' });
    });

    it('says nothing when the first look at the list loads it', () => {
        const { events } = setup([failed]);
        expect(events).toHaveLength(0);
    });

    it('says nothing when the list is fetched after the dataset opened: past builds did not just end', () => {
        const { fetched, events, state } = setupBeforeFetch();
        fetched([succeeded, task('7', 'Failed', '2026-10-26T01:00:00Z', 'model.gltf')]);
        expect(state()).toBe('Succeeded');
        expect(events).toHaveLength(0);
    });

    it('reports the builds that change after the first fetched list', () => {
        const { fetched, listChanges, events } = setupBeforeFetch();
        fetched([failed]);
        listChanges([succeeded, failed]);
        expect(events).toEqual([expect.objectContaining({ previousState: 'Failed', newState: 'Succeeded' })]);
    });

    it('keeps a build that was just started shown until the list has its task', async () => {
        const { ds, listChanges, events, state } = setup([failed]);
        await manager.startBuild(ds, PATH, true);
        expect(state()).toBe('Enqueued');

        listChanges([failed]);
        expect(state()).toBe('Enqueued');

        listChanges([task('5296', 'Processing', '2026-10-26T02:03:35Z'), failed]);
        expect(state()).toBe('Processing');

        // The earlier failure is never reported as the outcome of the new build
        listChanges([succeeded, failed]);
        expect(events.map(e => e.newState)).toEqual(['Processing', 'Succeeded']);
    });

    it('is reactive: a view that reads it renders again when the list changes', () => {
        const { ds, listChanges } = setup([failed]);
        const shown = computed(() => manager.getBuildState(ds, PATH)?.currentState ?? null);
        expect(shown.value).toBe('Failed');
        listChanges([succeeded, failed]);
        expect(shown.value).toBe('Succeeded');
    });
});

describe('latestTaskByPath', async () => {
    const { latestTaskByPath } = await import('@/libs/tasks/taskStates');
    it('keeps the task created last for each path, in any order', () => {
        const a1 = { taskId: '1', path: 'a', createdAt: '2026-01-01T00:00:00Z' };
        const a2 = { taskId: '2', path: 'a', createdAt: '2026-01-02T00:00:00Z' };
        const b = { taskId: '3', path: 'b', createdAt: '2026-01-01T00:00:00Z' };
        for (const list of [[a1, a2, b], [a2, a1, b], [b, a2, a1]])
            expect(Object.fromEntries(latestTaskByPath(list))).toEqual({ a: a2, b });
        expect(latestTaskByPath([{ taskId: '4', path: null }]).size).toBe(0);
    });
});

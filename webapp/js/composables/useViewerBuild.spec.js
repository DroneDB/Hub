/**
 * useViewerBuild (FR-VWR-08, FR-XC-16): a viewer that cannot open its file yet shows the build state with Build / Rebuild
 * (for somebody who can write), 'Building… 40 %' while it runs, and loads the file again when the build ends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref } from 'vue';

vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), isLoaded: vi.fn(() => true),
        acquire: vi.fn(), release: vi.fn(), forceRefresh: vi.fn(), onFilesAdded: vi.fn()
    }
}));
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const { useViewerBuild, isBuildWait } = await import('./useViewerBuild');

const PATH = 'model/OfficePlan.obj';
const dataset = { baseApi: '/orgs/o/ds/d', org: 'o', ds: 'd' };
const task = (state, extra = {}) => ({ taskId: 't1', toolId: 'build', path: PATH, state, createdAt: '2026-11-01T10:00:00Z', ...extra });
const availability = (status, extra = {}) => ({ available: false, status, title: '', message: '', actions: [], ...extra });

function listChanges(tasks) {
    taskMonitor.getTasks.mockReturnValue(tasks);
    const handler = taskMonitor.on.mock.calls.filter(([event]) => event === 'tasksUpdated').map(c => c[1]).at(-1);
    handler({ dataset });
}

function setup({ canWrite = true, reload = vi.fn() } = {}) {
    const scope = effectScope();
    const wait = scope.run(() => useViewerBuild({ dataset, path: () => PATH, canWrite: ref(canWrite), reload }));
    return { wait, reload, scope };
}

describe('useViewerBuild', () => {
    beforeEach(() => {
        BuildManager.cleanup();
        taskMonitor.on.mockClear();
        taskMonitor.getTasks.mockReturnValue([]);
        vi.restoreAllMocks();
    });

    it('has no notice while the file opens', () => {
        const { wait, scope } = setup();
        expect(wait.notice.value).toBeNull();
        wait.setAvailability(availability('queued'));
        wait.setAvailability(null);
        expect(wait.notice.value).toBeNull();
        scope.stop();
    });

    it('offers Build for a file never built, to a writer only', () => {
        const writer = setup();
        writer.wait.setAvailability(availability('queued'));
        expect(writer.wait.notice.value).toMatchObject({ status: 'queued', title: 'Not built yet', canBuild: true, actionLabel: 'Build' });
        writer.scope.stop();

        const reader = setup({ canWrite: false });
        reader.wait.setAvailability(availability('queued'));
        expect(reader.wait.notice.value).toMatchObject({ status: 'queued', canBuild: false });
        expect(reader.wait.notice.value.text).toContain('Somebody who can write');
        reader.scope.stop();
    });

    it('offers Rebuild after a failed build', () => {
        const { wait, scope } = setup();
        wait.setAvailability(availability('failed'));
        expect(wait.notice.value).toMatchObject({ status: 'failed', title: 'The build failed', canBuild: true, actionLabel: 'Rebuild' });
        scope.stop();
    });

    // FR-VWR-08: a model built before 3D Tiles has its Nexus output only; libddb skips a build that is complete, so only a
    // forced build makes the 3D Tiles
    it('offers Rebuild, forced, for a file built without the output the viewer needs', async () => {
        const start = vi.spyOn(BuildManager, 'startBuild').mockResolvedValue(true);
        const { wait, scope } = setup();
        wait.setAvailability(availability('rebuild'));
        expect(wait.notice.value).toMatchObject({ status: 'rebuild', title: 'Rebuild needed', canBuild: true, actionLabel: 'Rebuild' });
        expect(wait.notice.value.text).toBe('The build of this file has no output this viewer can show. Rebuild it to open it here.');

        await wait.build();
        expect(start).toHaveBeenCalledWith(dataset, PATH, true);
        scope.stop();
    });

    it('says what a build on hold waits for, from the check', () => {
        const { wait, scope } = setup();
        wait.setAvailability(availability('blocked', {
            title: 'Waiting for files', message: "The file 'OfficePlan.obj' cannot be opened yet.\n\nThe build needs OfficePlan.mtl."
        }));
        expect(wait.notice.value).toMatchObject({ status: 'blocked', title: 'Waiting for files', text: 'The build needs OfficePlan.mtl.' });
        scope.stop();
    });

    it('shows Building… with how far it is, and no button, while the build runs', () => {
        const { wait, scope } = setup();
        wait.setAvailability(availability('building'));
        listChanges([task('Processing', { progressPercent: 40 })]);

        expect(wait.notice.value).toMatchObject({ status: 'building', title: 'Building… 40 %', percent: 40, canBuild: false });
        scope.stop();
    });

    it('starts the build as a rebuild unless the file was never built, and shows it running at once', async () => {
        const start = vi.spyOn(BuildManager, 'startBuild').mockResolvedValue(true);
        const never = setup();
        never.wait.setAvailability(availability('queued'));
        await never.wait.build();
        expect(start).toHaveBeenLastCalledWith(dataset, PATH, false);
        never.scope.stop();

        const failed = setup();
        failed.wait.setAvailability(availability('failed'));
        await failed.wait.build();
        expect(start).toHaveBeenLastCalledWith(dataset, PATH, true);
        failed.scope.stop();
    });

    it('says why the build could not start', async () => {
        vi.spyOn(BuildManager, 'startBuild').mockRejectedValue(new Error('Build already in progress for model/OfficePlan.obj'));
        const { wait, scope } = setup();
        wait.setAvailability(availability('failed'));
        await wait.build();
        expect(wait.notice.value.error).toBe('Build already in progress for model/OfficePlan.obj');
        scope.stop();
    });

    it('does not start a build for somebody who cannot write', async () => {
        const start = vi.spyOn(BuildManager, 'startBuild').mockResolvedValue(true);
        const { wait, scope } = setup({ canWrite: false });
        wait.setAvailability(availability('failed'));
        await wait.build();
        expect(start).not.toHaveBeenCalled();
        scope.stop();
    });

    it('loads the file again once, when the build ends, and not for a file that already opens', async () => {
        const reload = vi.fn();
        const { wait, scope } = setup({ reload });
        listChanges([task('Processing')]);
        listChanges([task('Succeeded')]);
        expect(reload).not.toHaveBeenCalled();

        wait.setAvailability(availability('queued'));
        listChanges([task('Processing', { taskId: 't2', createdAt: '2026-11-01T11:00:00Z' })]);
        listChanges([task('Succeeded', { taskId: 't2', createdAt: '2026-11-01T11:00:00Z' })]);
        await Promise.resolve();
        expect(reload).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('loads the file again once when the build ended while the file was being checked (the check said it builds)', async () => {
        const reload = vi.fn();
        const { wait, scope } = setup({ reload });
        listChanges([task('Processing')]);
        // The build ends while the first check runs: no notice yet, so its end reloads nothing
        listChanges([task('Succeeded')]);
        expect(reload).not.toHaveBeenCalled();

        wait.setAvailability(availability('building'));
        await Promise.resolve();
        expect(reload).toHaveBeenCalledTimes(1);

        // The check that reload made still says it builds: no loop
        wait.setAvailability(availability('building'));
        await Promise.resolve();
        expect(reload).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('does not reload a building result while the build still runs', async () => {
        const reload = vi.fn();
        const { wait, scope } = setup({ reload });
        listChanges([task('Processing')]);
        wait.setAvailability(availability('building'));
        await Promise.resolve();
        expect(reload).not.toHaveBeenCalled();
        scope.stop();
    });

    it('loads once more when the build ends while a reload runs', async () => {
        let finish;
        const reload = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        const { wait, scope } = setup({ reload });
        listChanges([task('Processing')]);
        wait.setAvailability(availability('queued'));
        listChanges([task('Failed')]);
        expect(reload).toHaveBeenCalledTimes(1);

        // A second build ends before the first reload is done: its result may predate that end
        listChanges([task('Processing', { taskId: 't2', createdAt: '2026-11-01T11:00:00Z' })]);
        listChanges([task('Succeeded', { taskId: 't2', createdAt: '2026-11-01T11:00:00Z' })]);
        expect(reload).toHaveBeenCalledTimes(1);
        finish();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(reload).toHaveBeenCalledTimes(2);
        finish();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(reload).toHaveBeenCalledTimes(2);
        scope.stop();
    });

    it('is a build wait for the build statuses, and for no other', () => {
        for (const status of ['building', 'queued', 'rebuild', 'blocked', 'failed', 'unknown']) expect(isBuildWait({ status })).toBe(true);
        for (const status of ['not-found', 'error', 'ready']) expect(isBuildWait({ status })).toBe(false);
        expect(isBuildWait(null)).toBe(false);
    });
});

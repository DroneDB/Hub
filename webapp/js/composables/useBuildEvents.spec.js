/**
 * The build toasts of the dataset page: one when a build starts (BuildManager 'buildStarted'), one when it ends. A build
 * that runs adds none (the spinner shows it). The builds that end together are one toast (FR-PRC-26).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';

vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => [{ id: 'photogrammetry', title: 'Photogrammetry' }] } } }));
const { notify } = await import('@/libs/notify');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
const { useBuildEvents, BUILD_TOAST_WINDOW_MS } = await import('./useBuildEvents');

const dataset = { baseApi: '/orgs/o/ds/d' };
let stop;

function listen() {
    const events = useBuildEvents();
    events.watchBuildEvents(() => dataset);
    stop = () => BuildManager.eventListeners.buildStateChanged.splice(0);
    return events;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(taskMonitor, 'getTasks').mockReturnValue([]);
});
afterEach(() => {
    stop?.();
    BuildManager.eventListeners.buildStarted?.splice(0);
    BuildManager.eventListeners.buildError?.splice(0);
    BuildManager.eventListeners.newBuildableFilesDetected?.splice(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const ended = (filePath, newState = 'Succeeded', extra = {}) => BuildManager.emit('buildStateChanged', { dataset, filePath, newState, ...extra });

describe('useBuildEvents', () => {
    it('shows a rebuild as started and then completed: two toasts', () => {
        listen();
        const filePath = 'odm_texturing/model.glb';

        BuildManager.emit('buildStarted', { filePath });
        for (const newState of ['Enqueued', 'Processing', 'Succeeded']) ended(filePath, newState);
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);

        expect(notify.info).toHaveBeenCalledTimes(1);
        expect(notify.info).toHaveBeenCalledWith('Build started for model.glb', { summary: 'Build Started' });
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledWith('Build completed for model.glb', { summary: 'Build Completed' });
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('says a build that failed, alone, as before', () => {
        listen();

        ended('a.tif', 'Failed');
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);

        expect(notify.error).toHaveBeenCalledOnce();
        expect(notify.error).toHaveBeenCalledWith('Build failed for a.tif', { summary: 'Build Failed' });
    });

    it('9 builds that end in the window are one toast, with the names (FR-PRC-26)', () => {
        listen();

        for (let i = 1; i <= 9; i++) ended(`out/file${i}.tif`);
        expect(notify.success).not.toHaveBeenCalled();
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);

        expect(notify.success).toHaveBeenCalledOnce();
        expect(notify.success).toHaveBeenCalledWith('file1.tif, file2.tif, file3.tif, file4.tif, file5.tif and 4 more', { summary: '9 files built' });
    });

    it('says how many built and how many failed', () => {
        listen();

        ended('a.tif');
        ended('b.tif');
        ended('c.tif', 'Failed');
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);

        expect(notify.warn).toHaveBeenCalledOnce();
        expect(notify.warn).toHaveBeenCalledWith('a.tif, b.tif, c.tif (failed)', { summary: '2 built, 1 failed' });
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('a build that ends after the window is a toast of its own', () => {
        listen();

        ended('a.tif');
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);
        ended('b.tif');
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);

        expect(notify.success).toHaveBeenCalledTimes(2);
    });

    it('the builds of a photogrammetry run are one toast that names the run, when the last build ended', () => {
        listen();
        const run = { taskId: 'pg', toolId: 'photogrammetry', state: 'Succeeded' };
        const children = Array.from({ length: 3 }, (_, i) => ({ taskId: `b${i}`, toolId: 'build', state: 'Processing', parentJobId: 'pg' }));
        taskMonitor.getTasks.mockImplementation(() => [run, ...children]);

        for (let i = 0; i < 3; i++) {
            children[i].state = 'Succeeded';
            ended(`out/f${i}.tif`, 'Succeeded', { parentJobId: 'pg' });
            // The windows pass in between: the builds of a run wait for the last one
            vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS * 2);
        }

        expect(notify.success).toHaveBeenCalledOnce();
        expect(notify.success).toHaveBeenCalledWith('f0.tif, f1.tif, f2.tif', { summary: 'Photogrammetry finished - 3 files built' });
    });

    it('a run says what it has when its builds do not all end - never "finished" while a build runs', () => {
        listen();
        const run = { taskId: 'pg', toolId: 'photogrammetry', state: 'Succeeded' };
        taskMonitor.getTasks.mockImplementation(() => [run,
            { taskId: 'b0', toolId: 'build', state: 'Succeeded', parentJobId: 'pg' },
            { taskId: 'b1', toolId: 'build', state: 'Enqueued', parentJobId: 'pg' }]);

        ended('out/f0.tif', 'Succeeded', { parentJobId: 'pg' });
        vi.advanceTimersByTime(60_000);

        expect(notify.success).toHaveBeenCalledOnce();
        expect(notify.success).toHaveBeenCalledWith('f0.tif', { summary: 'Photogrammetry - 1 file built so far' });
    });

    it('builds of a run that end at 0, 20, 40 and 60 s are one toast, at the end', () => {
        listen();
        const run = { taskId: 'pg', toolId: 'photogrammetry', state: 'Succeeded' };
        const children = Array.from({ length: 4 }, (_, i) => ({ taskId: `b${i}`, toolId: 'build', state: 'Processing', parentJobId: 'pg' }));
        taskMonitor.getTasks.mockImplementation(() => [run, ...children]);

        for (let i = 0; i < 4; i++) {
            children[i].state = 'Succeeded';
            ended(`out/f${i}.tif`, 'Succeeded', { parentJobId: 'pg' });
            if (i < 3) {
                vi.advanceTimersByTime(20_000);
                expect(notify.success).not.toHaveBeenCalled();
            }
        }
        vi.advanceTimersByTime(120_000);

        expect(notify.success).toHaveBeenCalledOnce();
        expect(notify.success).toHaveBeenCalledWith('f0.tif, f1.tif, f2.tif, f3.tif', { summary: 'Photogrammetry finished - 4 files built' });
        expect(notify.warn).not.toHaveBeenCalled();
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('a run that still runs waits for its builds instead of saying "so far"', () => {
        listen();
        const run = { taskId: 'pg', toolId: 'photogrammetry', state: 'Processing' };
        const b1 = { taskId: 'b1', toolId: 'build', state: 'Processing', parentJobId: 'pg' };
        taskMonitor.getTasks.mockImplementation(() => [run, { taskId: 'b0', toolId: 'build', state: 'Succeeded', parentJobId: 'pg' }, b1]);

        ended('out/f0.tif', 'Succeeded', { parentJobId: 'pg' });
        vi.advanceTimersByTime(90_000);
        expect(notify.success).not.toHaveBeenCalled();

        run.state = 'Succeeded';
        b1.state = 'Succeeded';
        ended('out/f1.tif', 'Succeeded', { parentJobId: 'pg' });

        expect(notify.success).toHaveBeenCalledOnce();
        expect(notify.success).toHaveBeenCalledWith('f0.tif, f1.tif', { summary: 'Photogrammetry finished - 2 files built' });
    });

    it('the builds that ended are told when the page goes away, failures included', () => {
        const scope = effectScope();
        scope.run(() => useBuildEvents().watchBuildEvents(() => dataset));

        ended('a.tif', 'Failed');
        scope.stop();

        expect(notify.error).toHaveBeenCalledOnce();
        expect(notify.error).toHaveBeenCalledWith('Build failed for a.tif', { summary: 'Build Failed' });
        // The listener is gone and the window timer with it: nothing is told twice
        expect(BuildManager.eventListeners.buildStateChanged).toHaveLength(0);
        vi.advanceTimersByTime(BUILD_TOAST_WINDOW_MS);
        expect(notify.error).toHaveBeenCalledOnce();
    });

    it('the builds of a run that ended are told "so far" when the page goes away while others run', () => {
        const scope = effectScope();
        scope.run(() => useBuildEvents().watchBuildEvents(() => dataset));
        const run = { taskId: 'pg', toolId: 'photogrammetry', state: 'Succeeded' };
        taskMonitor.getTasks.mockImplementation(() => [run,
            { taskId: 'b0', toolId: 'build', state: 'Failed', parentJobId: 'pg' },
            { taskId: 'b1', toolId: 'build', state: 'Processing', parentJobId: 'pg' }]);

        ended('out/f0.tif', 'Failed', { parentJobId: 'pg' });
        scope.stop();

        expect(notify.error).toHaveBeenCalledOnce();
        expect(notify.error).toHaveBeenCalledWith('f0.tif (failed)', { summary: 'Photogrammetry - 0 built, 1 failed so far' });
    });
});

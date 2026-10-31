/**
 * The build toasts of the dataset page: one when a build starts (BuildManager 'buildStarted'),
 * one when it ends. A build that runs adds none (the spinner shows it).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const { notify } = await import('@/libs/notify');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const { useBuildEvents } = await import('./useBuildEvents');

describe('useBuildEvents', () => {
    it('shows a rebuild as started and then completed: two toasts', () => {
        const { watchBuildEvents } = useBuildEvents();
        watchBuildEvents(() => null);
        const filePath = 'odm_texturing/model.glb';

        BuildManager.emit('buildStarted', { filePath });
        for (const newState of ['Enqueued', 'Processing', 'Succeeded'])
            BuildManager.emit('buildStateChanged', { filePath, newState });

        expect(notify.info).toHaveBeenCalledTimes(1);
        expect(notify.info).toHaveBeenCalledWith('Build started for model.glb', { summary: 'Build Started' });
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.error).not.toHaveBeenCalled();
    });
});

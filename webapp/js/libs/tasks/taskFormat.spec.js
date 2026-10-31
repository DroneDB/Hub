import { describe, it, expect } from 'vitest';
import * as f from './taskFormat';

const tools = [{ id: 'build', title: 'Build', producesArtifact: true, resultExtension: 'zip' }, { id: 'noop' }];

describe('taskFormat', () => {
    it('maps states to tags and icons, unknown states count as active', () => {
        expect(f.tagSeverity('Failed')).toBe('danger');
        expect(f.stateIcon('Succeeded')).toBe('fa-solid fa-check');
        const states = [{ value: 'Succeeded', terminal: true }, { value: 'Processing', terminal: false }];
        expect(f.isActiveTaskState('Succeeded', states)).toBe(false);
        expect(f.isActiveTaskState('Reused', states)).toBe(true);
    });

    it('running and waiting work is the brand blue, not a warning', () => {
        for (const state of ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Reused']) expect(f.tagSeverity(state)).toBe('info');
        expect(f.tagSeverity('Succeeded')).toBe('success');
        expect(f.tagSeverity('Deleted')).toBe('secondary');
    });

    it('measures running and concluded tasks', () => {
        expect(f.runningTime({ startedAt: '2026-10-20T10:00:00Z' }, Date.parse('2026-10-20T10:01:05Z'))).toBe('1m 5s');
        expect(f.taskDuration({ createdAt: '2026-10-20T10:00:00Z', finishedAt: '2026-10-20T11:00:01Z' })).toBe('1h 0m 1s');
        expect(f.taskDuration({ createdAt: '2026-10-20T10:00:00Z' })).toBe('');
    });

    it('offers a result only while the artifact is retained', () => {
        const task = { state: 'Succeeded', toolId: 'build', taskId: 't1', artifactExpiresAt: '2026-10-21T00:00:00Z' };
        expect(f.canDownloadResult(task, tools, Date.parse('2026-10-20T00:00:00Z'))).toBe(true);
        expect(f.canDownloadResult(task, tools, Date.parse('2026-10-22T00:00:00Z'))).toBe(false);
        expect(f.canDownloadResult({ ...task, toolId: 'noop' }, tools, 0)).toBe(false);
        expect(f.resultFileName(task, tools)).toBe('build_t1.zip');
        expect(f.toolTitle('build', tools)).toBe('Build');
        expect(f.toolTitle('other', tools)).toBe('other');
    });

    it('a succeeded build whose entry waits for files is a yellow Waiting for files, naming them', () => {
        const tag = f.stateTag({ state: 'Succeeded', waitingForFiles: true, missingFiles: ['m.mtl', 't.png'] });
        expect(tag).toEqual({
            severity: 'warn', icon: 'fa-solid fa-hourglass-half', label: 'Waiting for files',
            title: 'Waiting for files: m.mtl, t.png. Upload the missing files to this dataset and processing starts by itself.',
            files: ['m.mtl', 't.png']
        });
        expect(f.isWaitingForFiles({ state: 'Succeeded', waitingForFiles: true })).toBe(true);
    });

    it('any other task has the tag of its state', () => {
        expect(f.stateTag({ state: 'Succeeded', waitingForFiles: false, missingFiles: null }))
            .toEqual({ severity: 'success', icon: 'fa-solid fa-check', label: 'Succeeded', title: 'Succeeded', files: [] });
        // Only a succeeded task waits: the flag of another state is not read
        expect(f.isWaitingForFiles({ state: 'Failed', waitingForFiles: true })).toBe(false);
        expect(f.stateTag({ state: 'Failed', waitingForFiles: true }).severity).toBe('danger');
        expect(f.isWaitingForFiles(null)).toBe(false);
    });
});

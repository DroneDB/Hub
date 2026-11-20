import { describe, it, expect } from 'vitest';
import { foldBuildChildren, childBuildsText } from './taskGroups';

const isActive = state => ['Enqueued', 'Processing'].includes(state);
const task = (taskId, over = {}) => ({ taskId, toolId: 'build', state: 'Succeeded', parentJobId: null, ...over });

describe('foldBuildChildren (FR-PRC-26)', () => {
    it('folds the builds of a listed task into it, with their count', () => {
        const rows = [
            task('pg', { toolId: 'photogrammetry' }),
            ...Array.from({ length: 9 }, (_, i) => task(`b${i}`, { parentJobId: 'pg', state: i < 2 ? 'Processing' : 'Succeeded' }))
        ];

        const folded = foldBuildChildren(rows, isActive);

        expect(folded).toHaveLength(1);
        expect(folded[0].taskId).toBe('pg');
        expect(folded[0].childBuilds).toEqual({ total: 9, active: 2 });
    });

    it('keeps a failed build, a build of a task that is not listed and a build of nobody', () => {
        const rows = [
            task('pg', { toolId: 'photogrammetry' }),
            task('failed', { parentJobId: 'pg', state: 'Failed' }),
            task('orphan', { parentJobId: 'gone' }),
            task('manual'),
            task('ok', { parentJobId: 'pg' })
        ];

        const folded = foldBuildChildren(rows, isActive);

        expect(folded.map(t => t.taskId)).toEqual(['pg', 'failed', 'orphan', 'manual']);
        expect(folded[0].childBuilds).toEqual({ total: 1, active: 0 });
    });

    it('leaves the tasks without builds as they are', () => {
        const rows = [task('a'), task('b', { toolId: 'extract' })];

        const folded = foldBuildChildren(rows, isActive);

        expect(folded[0]).toBe(rows[0]);
        expect(folded[1]).toBe(rows[1]);
    });

    it('says the count in words', () => {
        expect(childBuildsText({ total: 9, active: 2 })).toBe('9 builds, 2 running or queued');
        expect(childBuildsText({ total: 1, active: 0 })).toBe('1 build');
        expect(childBuildsText(undefined)).toBe('');
    });
});

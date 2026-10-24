import { describe, it, expect, vi } from 'vitest';
import { isBuilt, entryBuildStatus, shownBuildStatus, applyBuildFields, currentEntry } from './entryBuild';

const COG = { role: 'raster.cog', url: '/orgs/o/ds/d/build/h/cog/cog.tif', mediaType: 'image/tiff' };

describe('isBuilt', () => {
    it('is a build with artifacts and no build state (the server leaves a complete build without one)', () => {
        expect(isBuilt({ artifacts: [COG] })).toBe(true);
    });

    it('is not a build that has nothing yet, whatever a job did', () => {
        expect(isBuilt({})).toBe(false);
        expect(isBuilt({ artifacts: [] })).toBe(false);
        expect(isBuilt(null)).toBe(false);
    });

    it('is not a build the server says is queued, running, on hold or failed, even when an older output remains', () => {
        for (const buildStatus of ['queued', 'building', 'pending', 'failed']) {
            expect(isBuilt({ artifacts: [COG], buildStatus })).toBe(false);
        }
    });
});

describe('build status shown', () => {
    it('is the entry status worth a badge: queued, pending or failed', () => {
        expect(entryBuildStatus({ buildStatus: 'queued' })).toBe('queued');
        expect(entryBuildStatus({ buildStatus: 'pending' })).toBe('pending');
        expect(entryBuildStatus({ buildStatus: 'failed' })).toBe('failed');
        expect(entryBuildStatus({ buildStatus: 'building' })).toBeNull();
        expect(entryBuildStatus({})).toBeNull();
        expect(entryBuildStatus(undefined)).toBeNull();
    });

    it('is the failure of the job, nothing while a job runs, and otherwise the entry', () => {
        expect(shownBuildStatus({ currentState: 'Failed' }, {})).toBe('failed');
        expect(shownBuildStatus({ currentState: 'Processing' }, { buildStatus: 'queued' })).toBeNull();
        expect(shownBuildStatus({ currentState: 'Enqueued' }, { buildStatus: 'pending' })).toBeNull();
    });

    it('does not let a job that succeeded hide a build the entry says is on hold', () => {
        expect(shownBuildStatus({ currentState: 'Succeeded' }, { buildStatus: 'pending' })).toBe('pending');
        expect(shownBuildStatus({ currentState: 'Succeeded' }, { artifacts: [COG] })).toBeNull();
        expect(shownBuildStatus(null, { buildStatus: 'queued' })).toBe('queued');
    });
});

describe('applyBuildFields', () => {
    it('copies the build fields of a fresh listing and clears the ones the server omits', () => {
        const held = { path: 'a.tif', hash: 'h', buildStatus: 'queued', buildMissingDependencies: ['x'], polygon_geom: { a: 1 } };
        applyBuildFields(held, { path: 'a.tif', hash: 'h2', artifacts: [COG] });
        expect(held).toEqual({ path: 'a.tif', hash: 'h', artifacts: [COG], polygon_geom: { a: 1 } });
        expect('buildStatus' in held).toBe(false);
        expect(isBuilt(held)).toBe(true);
    });
});

describe('currentEntry', () => {
    const stale = { path: 'a/ortho.tif', hash: 'h' };
    const fresh = { path: 'a/ortho.tif', hash: 'h', artifacts: [COG] };

    it('keeps a snapshot that already answers: no request', async () => {
        const dataset = { listOne: vi.fn() };
        expect(await currentEntry(dataset, fresh, e => !!e.artifacts)).toBe(fresh);
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('lists the entry again, once, when the snapshot does not answer (the build finished after the listing)', async () => {
        const dataset = { listOne: vi.fn(async () => fresh) };
        expect(await currentEntry(dataset, stale, e => !!e.artifacts)).toBe(fresh);
        expect(dataset.listOne).toHaveBeenCalledTimes(1);
        expect(dataset.listOne).toHaveBeenCalledWith('a/ortho.tif');
    });

    it('does not hide a failed listing', async () => {
        const dataset = { listOne: vi.fn(async () => { throw new Error('Cannot find: a/ortho.tif'); }) };
        await expect(currentEntry(dataset, stale, () => false)).rejects.toThrow('Cannot find');
    });
});

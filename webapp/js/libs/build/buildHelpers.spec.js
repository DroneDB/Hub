/**
 * buildHelpers: "built" is what the entry lists (libddb's artifacts); the Hangfire job gives
 * progress and failures only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildManager = vi.hoisted(() => ({ getBuildState: vi.fn(), hasActiveBuild: vi.fn() }));
vi.mock('@/libs/build/buildManager', () => ({
    default: buildManager,
    BUILD_STATES: { AWAITING: 'Awaiting', CREATED: 'Created', ENQUEUED: 'Enqueued', FAILED: 'Failed', PROCESSING: 'Processing', SCHEDULED: 'Scheduled', SUCCEEDED: 'Succeeded' }
}));

const { getBuildBadge, getBuildBadgeTooltip, isBuildComplete, isFileBuilt } = await import('./buildHelpers');

const COG = { role: 'raster.cog', url: '/orgs/o/ds/d/build/h/cog/cog.tif' };
const file = entry => ({ entry: { path: 'ortho.tif', hash: 'h', ...entry } });
const dataset = (current) => ({ listOne: vi.fn(async () => ({ path: 'ortho.tif', hash: 'h', ...current })) });

beforeEach(() => {
    buildManager.getBuildState.mockReset().mockReturnValue(null);
    buildManager.hasActiveBuild.mockReset().mockReturnValue(false);
});

describe('build badge', () => {
    it('shows the status of the entry when there is no job', () => {
        expect(getBuildBadge({}, file({ buildStatus: 'pending' }))).toContain('fa-triangle-exclamation');
        expect(getBuildBadge({}, file({ buildStatus: 'queued' }))).toContain('fa-clock');
        expect(getBuildBadge({}, file({ artifacts: [COG] }))).toBeNull();
    });

    it('shows the failure of the job, and nothing while a job runs', () => {
        buildManager.getBuildState.mockReturnValue({ currentState: 'Failed' });
        expect(getBuildBadge({}, file({}))).toContain('fa-circle-xmark');
        expect(getBuildBadgeTooltip({}, file({}))).toBe('Build failed');
        buildManager.getBuildState.mockReturnValue({ currentState: 'Processing' });
        expect(getBuildBadge({}, file({ buildStatus: 'queued' }))).toBeNull();
    });

    it('keeps the on-hold badge and its reason after a job that succeeded', () => {
        buildManager.getBuildState.mockReturnValue({ currentState: 'Succeeded' });
        const held = file({ buildStatus: 'pending', buildMissingDependencies: ['ortho.tfw'] });
        expect(getBuildBadge({}, held)).toContain('fa-triangle-exclamation');
        expect(getBuildBadgeTooltip({}, held)).toContain('ortho.tfw');
    });
});

describe('isBuildComplete (download menu)', () => {
    it('needs artifacts and no build status, not a succeeded job', () => {
        buildManager.getBuildState.mockReturnValue({ currentState: 'Succeeded' });
        expect(isBuildComplete({}, file({}))).toBe(false);
        expect(isBuildComplete({}, file({ artifacts: [COG] }))).toBe(true);
        expect(isBuildComplete({}, file({ artifacts: [COG], buildStatus: 'failed' }))).toBe(false);
    });

    it('is false while a build runs', () => {
        buildManager.hasActiveBuild.mockReturnValue(true);
        expect(isBuildComplete({}, file({ artifacts: [COG] }))).toBe(false);
    });
});

describe('isFileBuilt', () => {
    it('trusts an entry that lists a complete build: no request', async () => {
        const ds = dataset({});
        expect(await isFileBuilt(ds, file({ artifacts: [COG] }))).toBe(true);
        expect(ds.listOne).not.toHaveBeenCalled();
    });

    it('lists the entry once when the held one shows no build (it may have finished since)', async () => {
        const ds = dataset({ artifacts: [COG] });
        expect(await isFileBuilt(ds, file({ buildStatus: 'queued' }))).toBe(true);
        expect(ds.listOne).toHaveBeenCalledTimes(1);
        expect(await isFileBuilt(dataset({ buildStatus: 'failed' }), file({}))).toBe(false);
    });

    it('is false while a build runs, without a request', async () => {
        buildManager.hasActiveBuild.mockReturnValue(true);
        const ds = dataset({ artifacts: [COG] });
        expect(await isFileBuilt(ds, file({ artifacts: [COG] }))).toBe(false);
        expect(ds.listOne).not.toHaveBeenCalled();
    });

    it('is false (and says why in the console) when the entry cannot be listed', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ds = { listOne: vi.fn(async () => { throw new Error('gone'); }) };
        expect(await isFileBuilt(ds, file({}))).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

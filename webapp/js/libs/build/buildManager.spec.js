/**
 * BuildManager: the jobs give progress and failures; whether new files still need a build is
 * what their entries list, not whether a job once succeeded.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';

vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), acquire: vi.fn(), release: vi.fn(), forceRefresh: vi.fn(), onFilesAdded: vi.fn() } }));
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

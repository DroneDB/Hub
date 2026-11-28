/**
 * A build started from the details panel that queues no job on the server (a file it takes without processing): the
 * BuildManager shows it as "Enqueued" until a task list asked for after the start has no task of it, then drops it
 * without a build event. The spinner of the panel must go with it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb, { thumbs } from 'ddb';

const monitor = vi.hoisted(() => ({ refresh: null }));
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), isLoaded: vi.fn(() => true), acquire: vi.fn(), release: vi.fn(),
        // The refresh after the start answers when the test says so
        forceRefresh: vi.fn(() => new Promise(resolve => { monitor.refresh = resolve; })),
        // A dataset the monitor does not follow: the build is settled by the refresh after the start
        listRequests: vi.fn(() => null), onFilesAdded: vi.fn()
    }
}));

const { default: BuildManager } = await import('@/libs/build/buildManager');
const DetailPanel = (await import('./DetailPanel.vue')).default;

const PATH = 'site/cloud.laz';
const file = {
    path: `ddb://h/org/ds/${PATH}`,
    entry: { path: PATH, type: ddb.entry.type.POINTCLOUD, size: 1, mtime: 1, hash: 'h', meta: {}, properties: {} }
};
const spinner = w => w.find('.fa-circle-notch.massive').exists();

afterEach(() => { BuildManager.cleanup(); vi.restoreAllMocks(); });

describe('the details panel after a build that queued no job', () => {
    it('stops its spinner when the BuildManager drops the build', async () => {
        const dataset = {
            org: 'org', ds: 'ds', baseApi: '/orgs/org/ds/ds',
            listOne: vi.fn(async () => ({ type: ddb.entry.type.POINTCLOUD })), build: vi.fn(async () => true)
        };
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(thumbs, 'fetch').mockImplementation(() => '/orgs/org/ds/ds/thumb?path=site/cloud.laz');
        const w = mount(DetailPanel, { props: { dataset, file }, global: { plugins: [PrimeVue] } });
        await flushPromises();

        await w.vm.startBuild();
        await flushPromises();
        expect(BuildManager.hasActiveBuild(dataset, PATH)).toBe(true);
        expect(spinner(w)).toBe(true);

        // The list asked for after the start has no task of the build: it is dropped, and no build event is told
        const told = vi.fn();
        BuildManager.on('buildStateChanged', told);
        monitor.refresh();
        await flushPromises();

        expect(BuildManager.hasActiveBuild(dataset, PATH)).toBe(false);
        expect(told).not.toHaveBeenCalled();
        expect(spinner(w)).toBe(false);
        expect(w.find('img.detail-thumbnail').exists()).toBe(true);
        BuildManager.off('buildStateChanged', told);
        w.unmount();
    });
});

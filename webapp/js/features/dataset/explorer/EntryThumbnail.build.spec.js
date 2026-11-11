/**
 * The tile of a file that builds (FR-EXP-07, FR-EXP-21, FR-XC-16): the spinner stays from the first to the last active state
 * of the build (Enqueued, Processing), with no image in between; the type icon is shown dimmed under it and the tile says
 * 'Building…'; the thumbnail loads when the build succeeds. The tooltip is the file's name, type, size and build state in
 * plain words, never the internal address of the file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';

vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        on: vi.fn(), off: vi.fn(), getTasks: vi.fn(() => []), isLoaded: vi.fn(() => true),
        acquire: vi.fn(), release: vi.fn(), forceRefresh: vi.fn(), onFilesAdded: vi.fn()
    }
}));
// The tile's tooltip is worked out from the build it shows: counting it tells whether a poll reached the tile
vi.mock('@/libs/dataset/tileTitle', async importOriginal => {
    const original = await importOriginal();
    return { ...original, tileTitle: vi.fn(original.tileTitle) };
});
const { tileTitle } = await import('@/libs/dataset/tileTitle');
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
const { default: BuildManager } = await import('@/libs/build/buildManager');
const EntryThumbnail = (await import('./EntryThumbnail.vue')).default;

const THUMB = '/orgs/acme/ds/site/thumb?path=cloud.laz&size=256';
const dataset = { org: 'acme', ds: 'site', baseApi: '/orgs/acme/ds/site', getTasks: async () => [] };
const build = (state, extra = {}) => ({ taskId: 't1', toolId: 'build', path: 'cloud.laz', state, createdAt: '2026-11-01T10:00:00Z', ...extra });

function mountTile(entryFields = {}, fileFields = {}) {
    const file = {
        label: 'cloud.laz', path: 'ddb://localhost:5100/acme/site/cloud.laz', icon: 'fa-solid fa-cloud', selected: false,
        entry: { path: 'cloud.laz', type: ddbEntry.type.POINTCLOUD, size: 23068672, hash: 'h', ...entryFields }, ...fileFields
    };
    return mount(EntryThumbnail, { props: { file, dataset } });
}

/** The task monitor tells the BuildManager that the list changed. */
function listChanges(tasks) {
    taskMonitor.getTasks.mockReturnValue(tasks);
    const [, onTasksUpdated] = taskMonitor.on.mock.calls.find(([event]) => event === 'tasksUpdated');
    onTasksUpdated({ dataset });
}

describe('EntryThumbnail while its file builds', () => {
    beforeEach(() => {
        BuildManager.cleanup();
        taskMonitor.on.mockClear();
        taskMonitor.getTasks.mockReturnValue([]);
        vi.spyOn(thumbs, 'fetch').mockReturnValue(THUMB);
    });
    afterEach(() => {
        BuildManager.cleanup();
        vi.restoreAllMocks();
    });

    it('keeps the spinner and no image from Enqueued to Processing, and loads the thumbnail when the build succeeds', async () => {
        const w = mountTile();
        await flushPromises();
        expect(w.find('img').exists()).toBe(true);

        listChanges([build('Enqueued')]);
        await flushPromises();
        expect(w.find('i.loading').exists()).toBe(true);
        expect(w.find('img').exists()).toBe(false);

        listChanges([build('Processing')]);
        await flushPromises();
        expect(w.find('i.loading').exists()).toBe(true);
        expect(w.find('img').exists()).toBe(false);

        listChanges([build('Succeeded')]);
        await flushPromises();
        expect(w.find('i.loading').exists()).toBe(false);
        expect(w.find('img').attributes('src')).toBe(THUMB);
        w.unmount();
    });

    it('shows the type icon dimmed under the spinner, and says "Building…"', async () => {
        const w = mountTile({}, {});
        await flushPromises();
        listChanges([build('Processing')]);
        await flushPromises();

        const icon = w.find('i.icon-file');
        expect(icon.classes()).toContain('fa-cloud');
        expect(icon.classes()).toContain('build-dimmed');
        expect(w.find('.build-caption').text()).toBe('Building…');
        w.unmount();
    });

    it('is built from the first look when the build is already running as the tile appears', async () => {
        taskMonitor.getTasks.mockReturnValue([build('Processing')]);
        const w = mountTile();
        await flushPromises();

        expect(w.find('i.loading').exists()).toBe(true);
        expect(w.find('img').exists()).toBe(false);
        expect(w.find('.build-caption').exists()).toBe(true);
        expect(thumbs.fetch).not.toHaveBeenCalled();
        w.unmount();
    });

    it('stops the spinner when the build fails, with the icon and the failed badge, and asks for no thumbnail', async () => {
        const w = mountTile();
        await flushPromises();
        thumbs.fetch.mockClear();
        listChanges([build('Processing')]);
        await flushPromises();
        listChanges([build('Failed')]);
        await flushPromises();

        expect(w.find('i.loading').exists()).toBe(false);
        expect(w.find('.build-caption').exists()).toBe(false);
        expect(w.find('img').exists()).toBe(false);
        expect(w.find('i.icon-file').classes()).not.toContain('build-dimmed');
        expect(w.find('.build-badge.error').exists()).toBe(true);
        expect(thumbs.fetch).not.toHaveBeenCalled();
        w.unmount();
    });

    // Each poll gives the BuildManager a new task list: a tile whose build did not change is not drawn again (a folder of
    // hundreds of built files would be drawn whole on every poll)
    it('is not drawn again by a poll that leaves its build as it was', async () => {
        let renders = 0;
        const counter = { updated() { if (this.$options.name === 'EntryThumbnail') renders++; } };
        const file = {
            label: 'cloud.laz', path: 'ddb://localhost:5100/acme/site/cloud.laz', icon: 'fa-solid fa-cloud', selected: false,
            entry: { path: 'cloud.laz', type: ddbEntry.type.POINTCLOUD, size: 23068672, hash: 'h' }
        };
        const w = mount(EntryThumbnail, { props: { file, dataset }, global: { mixins: [counter] } });
        await flushPromises();
        listChanges([build('Processing')]);
        await flushPromises();
        const before = renders;
        expect(before).toBeGreaterThan(0);
        tileTitle.mockClear();

        listChanges([build('Processing')]);
        await flushPromises();
        listChanges([build('Processing', { progressPercent: 10 })]);
        await flushPromises();
        expect(renders).toBe(before);
        expect(tileTitle).not.toHaveBeenCalled();

        listChanges([build('Failed')]);
        await flushPromises();
        expect(renders).toBeGreaterThan(before);
        w.unmount();
    });

    it('follows no build for a file that libddb does not build', async () => {
        const w = mountTile({ path: 'a.jpg', type: ddbEntry.type.IMAGE });
        await flushPromises();
        expect(taskMonitor.on).not.toHaveBeenCalled();
        expect(BuildManager.eventListeners.buildStateChanged?.size ?? 0).toBe(0);
        w.unmount();
    });
});

describe('EntryThumbnail tooltip (FR-EXP-21)', () => {
    beforeEach(() => {
        BuildManager.cleanup();
        taskMonitor.getTasks.mockReturnValue([]);
        vi.spyOn(thumbs, 'fetch').mockReturnValue(THUMB);
    });
    afterEach(() => {
        BuildManager.cleanup();
        vi.restoreAllMocks();
    });

    it('is the relative path, the type and the size, with no internal address', async () => {
        const w = mountTile({ path: 'images/a.jpg', type: ddbEntry.type.IMAGE, size: 3355443 });
        await flushPromises();
        expect(w.find('.thumbnail').attributes('title')).toBe('images/a.jpg — Image — 3.2 MB');
        expect(w.find('.thumbnail').attributes('title')).not.toContain('ddb+');
        expect(w.find('.thumbnail').attributes('title')).not.toContain('localhost');
        w.unmount();
    });

    it('adds the build state in plain words for a file that is built: Built, Building…, Failed', async () => {
        const w = mountTile({ artifacts: [{ role: 'pointcloud.copc', url: '/x' }] });
        await flushPromises();
        expect(w.find('.thumbnail').attributes('title')).toBe('cloud.laz — Point Cloud — 22 MB — Built');

        listChanges([build('Processing')]);
        await flushPromises();
        expect(w.find('.thumbnail').attributes('title')).toBe('cloud.laz — Point Cloud — 22 MB — Building…');

        listChanges([build('Failed')]);
        await flushPromises();
        expect(w.find('.thumbnail').attributes('title')).toBe('cloud.laz — Point Cloud — 22 MB — Failed');
        w.unmount();
    });
});

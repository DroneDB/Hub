/**
 * A tile whose thumbnail fails to load: while the build of the entry may still make it, the
 * thumbnail is asked for again (bounded, with backoff); when the build failed or is on hold,
 * the file icon shows at once instead of an empty tile for the whole retry budget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';
import { createThumbnailQueue } from '@/libs/thumbnailQueue';

const THUMB = '/orgs/acme/ds/site/thumb?path=cloud.laz&size=256';

function mountTile(entryFields) {
    const file = {
        label: 'cloud.laz', path: 'ddb://hub.test/acme/site/cloud.laz', icon: 'fa-solid fa-cloud', selected: false,
        entry: { path: 'cloud.laz', type: ddbEntry.type.POINTCLOUD, ...entryFields }
    };
    return mount(EntryThumbnail, { props: { file, dataset: { org: 'acme', ds: 'site', getTasks: async () => [] } } });
}

let EntryThumbnail;

describe('EntryThumbnail retries', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(thumbs, 'fetch').mockReturnValue(THUMB);
        EntryThumbnail = (await import('./EntryThumbnail.vue')).default;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('shows the file icon at once when the build failed', async () => {
        const w = mountTile({ buildStatus: 'failed' });
        await flushPromises();
        const timers = vi.getTimerCount();
        await w.find('img').trigger('error');

        expect(w.find('img').exists()).toBe(false);
        expect(w.find('i.icon-file').classes()).toContain('fa-cloud');
        expect(vi.getTimerCount()).toBe(timers);
        w.unmount();
    });

    it('shows the file icon at once when the build is on hold', async () => {
        const w = mountTile({ buildStatus: 'pending' });
        await flushPromises();
        const timers = vi.getTimerCount();
        await w.find('img').trigger('error');

        expect(w.find('img').exists()).toBe(false);
        expect(vi.getTimerCount()).toBe(timers);
        w.unmount();
    });

    it('asks again later while the build may still make the thumbnail', async () => {
        const w = mountTile({ buildStatus: 'queued' });
        await flushPromises();
        const timers = vi.getTimerCount();
        await w.find('img').trigger('error');
        expect(vi.getTimerCount()).toBe(timers + 1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(w.find('img').attributes('src')).toBe(`${THUMB}&retry=1`);
        w.unmount();
    });

    // In the Explorer every request takes a slot of the loader's queue: a retry too, so failing thumbnails never load
    // more images at once than its limit
    it('asks again only when the loader gives it a slot', async () => {
        const queue = createThumbnailQueue({ concurrency: 1 });
        const file = {
            label: 'a.jpg', path: 'ddb://hub.test/acme/site/a.jpg', icon: 'fa-solid fa-image', selected: false,
            entry: { path: 'a.jpg', type: ddbEntry.type.IMAGE }
        };
        const w = mount(EntryThumbnail, {
            props: { file, dataset: { org: 'acme', ds: 'site', getTasks: async () => [] } },
            global: { provide: { thumbnailLoader: { queue, visibility: null } } }
        });
        await flushPromises();
        expect(w.find('img').attributes('src')).toBe(THUMB);
        expect(queue.running).toBe(1);

        await w.find('img').trigger('error');
        expect(queue.running).toBe(0);
        const other = queue.enqueue(() => {}); // another tile takes the slot meanwhile
        await vi.advanceTimersByTimeAsync(5000);
        expect(w.find('img').attributes('src')).toBe(THUMB);
        expect(queue.running).toBe(1);

        other.release();
        await flushPromises();
        expect(w.find('img').attributes('src')).toBe(`${THUMB}&retry=1`);
        expect(queue.running).toBe(1);
        w.unmount();
    });

    it('shows the warning icon, not a broken image, when the thumbnail of a photo cannot be made', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        thumbs.fetch.mockReturnValue('/static/thumb.jpg'); // not a Registry URL: no retry
        const file = {
            label: 'a.jpg', path: 'ddb://hub.test/acme/site/a.jpg', icon: 'fa-solid fa-image', selected: false,
            entry: { path: 'a.jpg', type: ddbEntry.type.IMAGE }
        };
        const w = mount(EntryThumbnail, { props: { file, dataset: { org: 'acme', ds: 'site', getTasks: async () => [] } } });
        await flushPromises();
        await w.find('img').trigger('error');
        await flushPromises();

        expect(w.find('img').exists()).toBe(false);
        expect(w.find('i.icon-file').classes()).toContain('fa-triangle-exclamation');
        w.unmount();
    });
});

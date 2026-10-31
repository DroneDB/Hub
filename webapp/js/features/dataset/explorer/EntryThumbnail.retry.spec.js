/**
 * A tile whose thumbnail fails to load: while the build of the entry may still make it, the
 * thumbnail is asked for again (bounded, with backoff); when the build failed or is on hold,
 * the file icon shows at once instead of an empty tile for the whole retry budget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';

const THUMB = '/orgs/acme/ds/site/thumb?path=cloud.laz&size=256';

function mountTile(entryFields) {
    const file = {
        label: 'cloud.laz', path: 'ddb://hub.test/acme/site/cloud.laz', icon: 'fa-solid fa-cloud', selected: false,
        entry: { path: 'cloud.laz', type: ddbEntry.type.POINTCLOUD, ...entryFields }
    };
    return mount(EntryThumbnail, { props: { file, dataset: { org: 'acme', ds: 'site' } } });
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
});

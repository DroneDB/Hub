/**
 * A file uploaded again under its name keeps its tile (the tile is keyed by the path), but its content, and so its
 * hash, is new: the thumbnail of the old content must not stay on show.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';
import { createThumbnailQueue } from '@/libs/thumbnailQueue';

const EntryThumbnail = (await import('./EntryThumbnail.vue')).default;

const fileWith = hash => ({
    label: 'a.jpg', path: 'ddb://hub.test/acme/site/a.jpg', icon: 'fa-solid fa-image', selected: false,
    entry: { path: 'a.jpg', type: ddbEntry.type.GEOIMAGE, hash }
});
const dataset = { org: 'acme', ds: 'site', getTasks: async () => [] };
const src = w => (w.find('img').exists() ? w.find('img').attributes('src') : null);

beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size, hash) => `/orgs/acme/ds/site/thumb?size=${size}&hash=${hash}`);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('EntryThumbnail of a file uploaded again', () => {
    it('shows the thumbnail of the new content once the hash of the entry changes', async () => {
        const w = mount(EntryThumbnail, { props: { file: fileWith('old'), size: 128, dataset } });
        await flushPromises();
        expect(src(w)).toBe('/orgs/acme/ds/site/thumb?size=128&hash=old');

        await w.setProps({ file: fileWith('new') });
        await flushPromises();
        expect(src(w)).toBe('/orgs/acme/ds/site/thumb?size=128&hash=new');
        w.unmount();
    });

    it('in the Explorer, a tile out of view asks for the new thumbnail when it comes into view', async () => {
        const seen = new Map();
        const thumbnailLoader = {
            queue: createThumbnailQueue({ concurrency: 1 }),
            visibility: { observe: (el, cb) => seen.set(el, cb), unobserve: el => seen.delete(el) }
        };
        const w = mount(EntryThumbnail, {
            props: { file: fileWith('old'), size: 128, lazyLoad: true, dataset },
            global: { provide: { thumbnailLoader } }
        });
        const show = async visible => { seen.get(w.find('.thumbnail').element)(visible); await flushPromises(); };
        await show(true);
        await w.find('img').trigger('load');
        expect(src(w)).toBe('/orgs/acme/ds/site/thumb?size=128&hash=old');

        await show(false);
        await w.setProps({ file: fileWith('new') });
        await flushPromises();
        // Out of view: nothing is asked for yet, the old image stays
        expect(src(w)).toBe('/orgs/acme/ds/site/thumb?size=128&hash=old');

        await show(true);
        expect(src(w)).toBe('/orgs/acme/ds/site/thumb?size=128&hash=new');
        w.unmount();
    });
});
